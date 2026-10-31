// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {JobDetails} from './JobDetails';
import {jobsService} from '../../services/jobs.service';
import {readDraft,resetDrafts} from './jobDrafts';
import type {Job} from '../../types';
const state=vi.hoisted(()=>({user:{id:41},dirty:vi.fn()}));
vi.mock('../../store/authStore',()=>({useAuthStore:Object.assign((select:(s:typeof state)=>unknown)=>select(state),{getState:()=>state})}));
vi.mock('../../store/languageStore',()=>({useLanguage:()=>({lang:'en',t:(key:string)=>key})}));
vi.mock('../../hooks/useDirtyNavigation',()=>({useDirtyNavigation:()=>state.dirty}));
vi.mock('../../store/toastStore',()=>({useToastStore:()=>vi.fn()}));
vi.mock('../../services/jobs.service',()=>({APPLICATION_CHECKLIST:['CV tailored'],jobsService:{getJob:vi.fn(),updateNotes:vi.fn(),updateCoverLetter:vi.fn(),updateChecklist:vi.fn(),updateStatus:vi.fn(),toggleHidden:vi.fn(),updateInterviewDate:vi.fn()}}));
const job=(id=1):Job=>({id,title:'Frontend Engineer '+id,company:'Synthetic Studio',location:'Berlin',description:'<p>Role</p><img src=x onerror="alert(1)"><script>bad()</script>',url:'https://example.com',external_id:String(id),source:'manual',posted_date:null,deadline:null,salary:null,status:'saved',notes:'Original notes',cover_letter:'',applied_date:null,follow_up_date:null,interview_date:null,is_hidden:false,language:'en',created_at:'2026-10-28',updated_at:'2026-10-28'});
let root:Root|undefined;
let host:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();state.user={id:41};resetDrafts(null);resetDrafts(41);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;document.body.innerHTML='';});
function render(element:React.ReactNode){act(()=>root!.render(element));return {container:host,rerender:(next:React.ReactNode)=>act(()=>root!.render(next)),unmount:()=>{act(()=>root!.unmount());root=createRoot(host);}};}
function byRole(role:string,name?:string){const selector=role==='heading'?'h1,h2,h3':role==='button'?'button':role==='combobox'?'select':`[role="${role}"]`;return [...host.querySelectorAll<HTMLElement>(selector)].find(el=>(!name||el.textContent===name)&&!el.closest('[hidden]'))??null;}
async function waitFor(check:()=>void){let failure:unknown;for(let i=0;i<50;i++){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});try{check();return;}catch(error){failure=error;}}throw failure;}
const screen={getByRole:(role:string,options?:{name:string})=>{const el=byRole(role,options?.name);if(!el)throw Error('Missing '+role+' '+options?.name);return el;},queryByRole:(role:string,options?:{name:string})=>byRole(role,options?.name),findByRole:async(role:string,options?:{name:string})=>{await waitFor(()=>expect(byRole(role,options?.name)).not.toBeNull());return byRole(role,options?.name)!;},getByLabelText:(name:string)=>{const label=[...host.querySelectorAll('label')].find(el=>[...el.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim()===name);const field=label?.querySelector('textarea,input');if(!field)throw Error('Missing field '+name);return field;}};
const fireEvent={click:(el:Element)=>act(()=>(el as HTMLElement).click()),change:(el:Element,event:{target:{value:string}})=>act(()=>{const prototype=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(el,event.target.value);el.dispatchEvent(new Event(el.tagName==='TEXTAREA'?'input':'change',{bubbles:true}));})};
describe('shared application editor',()=>{
  it('uses an authorized initial row without a redundant request and sanitizes content',async()=>{
    const view=render(<JobDetails id={1} initialJob={job()}/>);
    expect(jobsService.getJob).not.toHaveBeenCalled();
    expect(view.container.querySelector('script')).toBeNull();expect(view.container.querySelector('img')?.hasAttribute('onerror')).toBe(false);
    expect(screen.getByRole('combobox').querySelectorAll('option')).toHaveLength(9);
  });
  it('retains failed notes, allows retry and does not save the cover letter implicitly',async()=>{
    vi.mocked(jobsService.updateNotes).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({...job(),notes:'New draft'});
    render(<JobDetails id={1} initialJob={job()}/>);fireEvent.click(screen.getByRole('tab',{name:'Preparation'}));
    fireEvent.change(screen.getByLabelText('notes'),{target:{value:'New draft'}});
    fireEvent.click(screen.getByRole('button',{name:'saveNotes'}));await screen.findByRole('alert');
    expect((screen.getByLabelText('notes') as HTMLTextAreaElement).value).toBe('New draft');
    expect(readDraft(41,1)?.notes).toBe('New draft');expect(jobsService.updateCoverLetter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'saveNotes'}));await waitFor(()=>expect(jobsService.updateNotes).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect(readDraft(41,1)).toBeUndefined());
  });
  it('restores an unsaved draft after changing jobs within this session',()=>{
    const view=render(<JobDetails id={1} initialJob={job()}/>);fireEvent.click(screen.getByRole('tab',{name:'Preparation'}));
    fireEvent.change(screen.getByLabelText('notes'),{target:{value:'Keep this'}});view.unmount();
    render(<JobDetails id={1} initialJob={job()}/>);fireEvent.click(screen.getByRole('tab',{name:'Preparation'}));
    expect((screen.getByLabelText('notes') as HTMLTextAreaElement).value).toBe('Keep this');
  });
  it('ignores an earlier detail request after selecting another job',async()=>{
    let finish!:(value:Job)=>void;vi.mocked(jobsService.getJob).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(job(2));
    const view=render(<JobDetails id={1}/>);view.rerender(<JobDetails id={2}/>);
    await screen.findByRole('heading',{name:'Frontend Engineer 2'});finish(job(1));
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'Frontend Engineer 1'})).toBeNull());
  });
  it('keeps a failed interview-date edit visible with an error',async()=>{
    vi.mocked(jobsService.updateInterviewDate).mockRejectedValueOnce(Error('offline'));
    render(<JobDetails id={1} initialJob={job()}/>);
    fireEvent.change(screen.getByLabelText('interviewDate'),{target:{value:'2026-11-01'}});await screen.findByRole('alert');
    expect((screen.getByLabelText('interviewDate') as HTMLInputElement).value).toBe('2026-11-01');
  });
});
