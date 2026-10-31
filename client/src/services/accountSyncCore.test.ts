import { describe, expect, it } from 'vitest';
import { AccountCollection, type CollectionTransport, type PendingItem, type RemoteItem, type SyncMeta, type SyncStatus } from './accountSyncCore';

type Item = { id: string; title: string; normalized?: boolean };
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function harness() {
  const records = new Map<number, Map<string, RemoteItem<Item>>>();
  const journals = new Map<string, SyncMeta<Item>>();
  const recoveries = new Map<string, SyncMeta<Item>>();
  let online = true, sequence = 0;
  const transport: CollectionTransport<Item> = {
    async list(owner) { return copy([...(records.get(owner)?.values() ?? [])]); },
    async write(owner, _kind, id, pending) {
      let rows = records.get(owner); if (!rows) { rows = new Map(); records.set(owner, rows); }
      const old = rows.get(id);
      if (old && old.last_operation === pending.operation) return { applied: true, record: copy(old) };
      if ((old?.revision ?? null) !== pending.expectedRevision) return { applied: false, record: copy(old!) };
      const row = { item_id: id, data: pending.data, deleted: pending.data === null, revision: (old?.revision ?? 0) + 1, last_operation: pending.operation };
      rows.set(id,copy(row)); return { applied: true, record: copy(row) };
    },
  };
  const device = (name: string) => {
    let items: Item[] = [], status: SyncStatus = { phase: 'idle',pending: 0,conflicts: 0 };
    const manager = new AccountCollection<Item>({ kind:'reminders', transport,
      loadMeta: owner => copy(journals.get(name+owner) ?? null), saveMeta: (owner,meta) => { journals.set(name+owner,copy(meta)); },
      recoverMeta: owner => { const old=journals.get(name+owner);if(old)recoveries.set(name+owner,copy(old));journals.set(name+owner,{migrated:false,versions:{},pending:{}}); },
      validateItem: value => !!value && typeof value === 'object' && typeof (value as Item).title === 'string',
      setItems: rows => { items = rows; },status: value => { status=value; }, uuid: () => 'op-'+(++sequence),online: () => online,
    });
    return { manager,items: () => items,status: () => status };
  };
  return { device,records,journals,recoveries,transport,offline: () => {online=false;},online: () => {online=true;} };
}
describe('durable account collections', () => {
  it('imports owned local entries and retrieves them on another device', async () => {
    const h=harness(),a=h.device('a'),b=h.device('b');
    a.manager.activate(1,[{id:'r1',title:'Local reminder'}]);await a.manager.sync();
    b.manager.activate(1,[]);await b.manager.sync();expect(b.items()).toEqual([{id:'r1',title:'Local reminder'}]);
    expect(a.status().phase).toBe('synced');
  });
  it('persists offline edits and deletion tombstones across reloads', async () => {
    const h=harness(),a=h.device('a');a.manager.activate(1,[]);await a.manager.sync();
    a.manager.put({id:'r1',title:'Will delete'});await a.manager.sync();h.offline();a.manager.remove('r1');a.manager.put({id:'r2',title:'Offline addition'});await a.manager.sync();
    const reload=h.device('a');reload.manager.activate(1,[{id:'r2',title:'Offline addition'}]);h.online();await reload.manager.sync();
    expect(reload.items()).toEqual([{id:'r2',title:'Offline addition'}]);expect(h.records.get(1)?.get('r1')?.deleted).toBe(true);
  });
  it('does not resurrect an account deletion from an old cached device', async () => {
    const h=harness(),a=h.device('a');a.manager.activate(1,[]);a.manager.put({id:'r1',title:'Deleted'});await a.manager.sync();a.manager.remove('r1');await a.manager.sync();
    const old=h.device('old');old.manager.activate(1,[{id:'r1',title:'Deleted'}]);await old.manager.sync();expect(old.items()).toEqual([]);expect(old.status().pending).toBe(0);
  });
  it('retains both sides of a conflict until the user chooses the account version', async () => {
    const h=harness(),a=h.device('a'),b=h.device('b');a.manager.activate(1,[]);a.manager.put({id:'r1',title:'Original'});await a.manager.sync();b.manager.activate(1,[]);await b.manager.sync();
    a.manager.put({id:'r1',title:'Device A'});await a.manager.sync();b.manager.put({id:'r1',title:'Device B'});await b.manager.sync();
    expect(b.status().phase).toBe('conflict');expect(b.items()[0].title).toBe('Device B');expect(h.records.get(1)?.get('r1')?.data?.title).toBe('Device A');
    await b.manager.resolve('account');expect(b.items()[0].title).toBe('Device A');
  });
  it('only overwrites a conflicting account version after an explicit local choice', async () => {
    const h=harness(),a=h.device('a'),b=h.device('b');a.manager.activate(1,[{id:'r1',title:'Cloud'}]);await a.manager.sync();b.manager.activate(1,[{id:'r1',title:'Different legacy edit'}]);await b.manager.sync();
    expect(b.status().phase).toBe('conflict');await b.manager.resolve('local');expect(h.records.get(1)?.get('r1')?.data?.title).toBe('Different legacy edit');
  });
  it('ignores an old account response after the owner switches', async () => {
    const h=harness(),a=h.device('a');let complete!:(rows:RemoteItem<Item>[])=>void;
    h.transport.list=async owner=>owner===1?new Promise(resolve=>{complete=resolve;}):[];
    a.manager.activate(1,[]);const inFlight=a.manager.sync();a.manager.activate(2,[]);await a.manager.sync();complete([{item_id:'private-a',data:{id:'private-a',title:'Account A'},deleted:false,revision:1,last_operation:'old'}]);await inFlight;
    expect(a.items()).toEqual([]);expect(h.journals.get('a2')?.pending).toEqual({});
  });
  it('retries the same operation after a lost response without resending a normalized write', async () => {
    const h=harness(),a=h.device('a'),write=h.transport.write;let first=true;
    h.transport.write=async(owner,kind,id,pending)=>{const result=await write(owner,kind,id,pending);if(first){first=false;result.record.data!.normalized=true;h.records.get(owner)!.set(id,result.record);throw Error('response lost');}return result;};
    a.manager.activate(1,[]);a.manager.put({id:'r1',title:'Test'});await a.manager.sync();expect(a.status().phase).toBe('error');await a.manager.sync();
    expect(a.status().phase).toBe('synced');expect(h.records.get(1)?.get('r1')?.revision).toBe(1);expect(a.items()[0].normalized).toBe(true);
  });
  it('keeps an edit typed while an earlier write is in flight', async () => {
    const h=harness(),a=h.device('a'),write=h.transport.write;let complete!:()=>void,started!:()=>void;
    const startedPromise=new Promise<void>(resolve=>{started=resolve;});let first=true;
    h.transport.write=async(owner,kind,id,pending:PendingItem<Item>)=>{if(first){first=false;started();await new Promise<void>(resolve=>{complete=resolve;});}return write(owner,kind,id,pending);};
    a.manager.activate(1,[]);a.manager.put({id:'r1',title:'First'});const syncing=a.manager.sync();await startedPromise;a.manager.put({id:'r1',title:'Second'});complete();await syncing;
    expect(a.items()[0].title).toBe('Second');expect(h.records.get(1)?.get('r1')?.data?.title).toBe('Second');expect(a.status().pending).toBe(0);
  });
  it('immediately overlays pending edits and tombstones over a lagging cache while offline', async () => {
    const h=harness();h.offline();
    h.journals.set('a1',{migrated:true,versions:{deleted:1,edited:1},pending:{deleted:{data:null,expectedRevision:1,operation:'delete-op'},edited:{data:{id:'edited',title:'Durable edit'},expectedRevision:1,operation:'edit-op'}}});
    const a=h.device('a');a.manager.activate(1,[{id:'deleted',title:'Stale cached item'},{id:'edited',title:'Stale cached title'}]);
    expect(a.items()).toEqual([{id:'edited',title:'Durable edit'}]);
    await a.manager.sync();expect(a.status().phase).toBe('offline');expect(a.status().pending).toBe(2);expect(h.records.size).toBe(0);
  });
  it('preserves malformed journals and blocks writes without crashing or overwriting raw state', async () => {
    const malformed=[{migrated:true,versions:{},pending:null},{migrated:'yes',versions:{},pending:{}},{migrated:true,versions:[],pending:{}},{migrated:true,versions:{},pending:{x:{data:{id:'wrong',title:'Bad'},expectedRevision:null,operation:'op'}}},{migrated:true,versions:{},pending:{x:{data:{id:'x',title:{bad:true}},expectedRevision:null,operation:'op'}}}];
    for(const value of malformed){
      const h=harness(),bad=value as unknown as SyncMeta<Item>;h.journals.set('a1',copy(bad));const a=h.device('a');
      expect(()=>a.manager.activate(1,[{id:'cached',title:'Visible cached item'}])).not.toThrow();
      a.manager.put({id:'new',title:'New edit while blocked'});await a.manager.sync();
      expect(a.status().phase).toBe('error');expect(a.status().journalIssue).toBe(true);expect(h.journals.get('a1')).toEqual(bad);expect(h.records.size).toBe(0);
    }
  });
  it('only reconnects after retaining recovery data, then imports visible and new local edits', async () => {
    const h=harness(),bad={migrated:true,versions:{},pending:'unreadable'} as unknown as SyncMeta<Item>;h.journals.set('a1',copy(bad));
    const a=h.device('a');a.manager.activate(1,[{id:'cached',title:'Visible local data'}]);a.manager.put({id:'new',title:'Typed after the warning'});
    await a.manager.recoverJournal();expect(h.recoveries.get('a1')).toEqual(bad);expect(a.status().phase).toBe('synced');
    expect(a.items().map(item=>item.title).sort()).toEqual(['Typed after the warning','Visible local data']);
    expect(h.records.get(1)?.size).toBe(2);
  });
});
