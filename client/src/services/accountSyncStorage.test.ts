import { describe, expect, it } from 'vitest';
import { loadSyncJournal, recoverSyncJournal } from './accountSyncStorage';
import { validateSyncMeta } from './accountSyncCore';

function storage() {
  const entries=new Map<string,string>();
  return {entries,getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);}};
}
describe('sync journal recovery storage',()=>{
  it('preserves invalid JSON without substituting a new empty journal',()=>{
    const s=storage(),raw='{"pending":';s.entries.set('journal',raw);
    expect(()=>loadSyncJournal(s,'journal')).toThrow();expect(s.entries.get('journal')).toBe(raw);
    s.entries.set('journal','{"migrated":true,"versions":{},"pending":null}');
    expect(()=>validateSyncMeta(loadSyncJournal(s,'journal'))).toThrow();expect(s.entries.get('journal')).toContain('"pending":null');
  });
  it('keeps an exact recovery copy before starting a new journal',()=>{
    const s=storage(),raw='{"pending":';s.entries.set('journal',raw);
    recoverSyncJournal(s,'journal','owned-recovery');
    expect(s.entries.get('journal:recovery:owned-recovery')).toBe(raw);
    expect(validateSyncMeta(loadSyncJournal(s,'journal'))).toEqual({migrated:false,versions:{},pending:{}});
  });
  it('does not reset stored data when the recovery copy cannot be saved',()=>{
    const s=storage(),raw='broken original';s.entries.set('journal',raw);
    const blocked={getItem:s.getItem,setItem:()=>{throw Error('quota');}};
    expect(()=>recoverSyncJournal(blocked,'journal','id')).toThrow('quota');expect(s.entries.get('journal')).toBe(raw);
  });
  it('preserves an existing recovery copy rather than overwriting it',()=>{
    const s=storage();s.entries.set('journal','new broken data');s.entries.set('journal:recovery:id','older recovery data');
    expect(()=>recoverSyncJournal(s,'journal','id')).toThrow();expect(s.entries.get('journal')).toBe('new broken data');expect(s.entries.get('journal:recovery:id')).toBe('older recovery data');
  });
});
