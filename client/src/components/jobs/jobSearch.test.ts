import {afterEach,describe,expect,it,vi} from 'vitest';
import {consumeJobReturn,jobFilters,readJobSearch,rememberJobReturn,writeJobSearch} from './jobSearch';
import {clearDraft,readDraft,resetDrafts,writeDraft} from './jobDrafts';
afterEach(()=>vi.unstubAllGlobals());
describe('workspace navigation state',()=>{
  it('round-trips every criterion and retains selected detail identity',()=>{
    const params=new URLSearchParams('tab=all&search=design&sort=company&source=adzuna&days=30&remote=1&student=1&match=high&location=K%C3%B6ln%7CEssen&page=3&job=42');
    const state=readJobSearch(params);
    expect(readJobSearch(writeJobSearch(state,params))).toEqual(state);
    expect(writeJobSearch(state,params).get('job')).toBe('42');
    expect(jobFilters(state)).toMatchObject({offset:100,limit:50,location:'Köln|Essen',noFilter:true,sortOrder:'ASC',remoteOnly:true,highMatchOnly:true,studentOnly:true});
  });
  it('preserves existing student/hot links and rejects unsupported values',()=>{
    expect(readJobSearch(new URLSearchParams('type=werkstudent')).studentOnly).toBe(true);
    expect(readJobSearch(new URLSearchParams('type=hot')).highMatchOnly).toBe(true);
    expect(readJobSearch(new URLSearchParams('tab=invalid&sort=bad&days=365&page=-2'))).toMatchObject({tab:'new',sortBy:'posted_date',dateDays:'',page:1});
  });
  it('recomputes saved relative date windows when the search runs',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    const search=readJobSearch(new URLSearchParams('days=7'));
    expect(jobFilters(search).dateFrom).toBe('2026-10-21');
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
    expect(jobFilters(search).dateFrom).toBe('2026-10-25');vi.useRealTimers();
  });
  it('restores return focus/scroll once and never across accounts',()=>{
    vi.stubGlobal('window',{scrollY:420});
    rememberJobReturn(1,'/jobs?tab=saved',24);
    expect(consumeJobReturn(1,'/jobs?tab=saved')).toEqual({id:24,y:420});
    expect(consumeJobReturn(1,'/jobs?tab=saved')).toBeUndefined();
    rememberJobReturn(1,'/jobs',2);expect(consumeJobReturn(2,'/jobs')).toBeUndefined();
  });
  it('keeps unsaved work for this account and clears it on owner switch',()=>{
    resetDrafts(1);writeDraft(1,42,{notes:'draft',coverLetter:'letter'});
    expect(readDraft(1,42)?.notes).toBe('draft');clearDraft(1,42);expect(readDraft(1,42)).toBeUndefined();
    writeDraft(1,42,{notes:'private',coverLetter:''});resetDrafts(2);expect(readDraft(2,42)).toBeUndefined();expect(readDraft(1,42)).toBeUndefined();
  });
});
