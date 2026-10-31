import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { jobsService } from '../services/jobs.service';
import { invalidateJobSnapshot } from '../services/jobSnapshot';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../store/languageStore';
import { useToastStore } from '../store/toastStore';
import type { DashboardStats, Job } from '../types';
import { SavedSearches } from '../components/common/SavedSearches';
const JobDetails=lazy(()=>import('../components/jobs/JobDetails').then(module=>({default:module.JobDetails})));
import { STATE_CITIES } from '../components/jobs/stateCities';
import { JOB_SORTS, JOB_TABS, consumeJobReturn, jobFilters, readJobSearch, rememberJobReturn, writeJobSearch, type JobSearch } from '../components/jobs/jobSearch';
import { JobResultContent } from '../components/jobs/JobResultContent';
import { FeedHealth } from '../components/jobs/FeedHealth';
import { ListingEvidence } from '../components/jobs/ListingEvidence';
import { SwipeableRow } from '../components/jobs/SwipeableRow';
import { Button, Dialog, EmptyState, Icon, InlineError, PageHeader, Skeleton } from '../components/ui';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { confirmSaved } from '../utils/uiMotion';
const emptyManual = {
  title: '',
  company: '',
  location: '',
  url: '',
  description: ''
};
export function JobsWorkspace() {
  const {
      lang,
      t
    } = useLanguage(),
    de = lang === 'de',
    owner = useAuthStore(s => s.user?.id ?? null),
    wide = useMediaQuery('(min-width:1200px)'),
    phone = useMediaQuery('(max-width:767px)');
  const [params, setParams] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate(),
    search = readJobSearch(params),
    criteria = JSON.stringify(search);
  const [data, setData] = useState<{
      owner: number | null;
      jobs: Job[];
      total: number;
    }>({
      owner,
      jobs: [],
      total: 0
    }),
    [stats, setStats] = useState<DashboardStats | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [input, setInput] = useState(search.search),
    [filtersOpen, setFiltersOpen] = useState(false),
    [refresh, setRefresh] = useState(0),
    [action, setAction] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false),
    [manual, setManual] = useState(emptyManual),
    [manualBusy, setManualBusy] = useState(false),
    [manualError, setManualError] = useState('');
  const sequence = useRef(0),
    latestParams = useRef(params),
    userSelected = useRef(false),
    showToast = useToastStore(s => s.show),
    listRoot = useRef<HTMLDivElement>(null);
  const jobs = data.owner === owner ? data.jobs : [],
    total = data.owner === owner ? data.total : 0,
    selectedParam = Number(params.get('job')),
    selectedId = Number.isSafeInteger(selectedParam) && selectedParam > 0 ? selectedParam : jobs[0]?.id;
  const selected = jobs.find(job => job.id === selectedId),
    url = location.pathname + location.search;
  useEffect(() => { latestParams.current = params; }, [params]);
  const commit = (next: URLSearchParams, replace=false) => {
    latestParams.current=next;
    setParams(next,{replace});
  };
  const change = (patch: Partial<JobSearch>, replace = false) => {
    const previous=latestParams.current;
    commit(writeJobSearch({
      ...readJobSearch(previous),
      ...patch,
      page: patch.page ?? 1
    }, previous), replace);
  };
  useEffect(() => setInput(search.search), [search.search]);
  useEffect(() => {
    if (input === search.search) return;
    const timer = setTimeout(() => change({
      search: input
    }, true), 400);
    return () => clearTimeout(timer);
  }, [input, search.search]);
  useEffect(() => {
    const request = ++sequence.current;
    let cancelled = false;
    setLoading(true);
    setError('');
    jobsService.getJobs(jobFilters(JSON.parse(criteria) as JobSearch)).then(response => {
      if (cancelled || request !== sequence.current || useAuthStore.getState().user?.id !== owner) return;
      setData({
        owner,
        jobs: response.jobs,
        total: response.total
      });
    }).catch(() => {
      if (!cancelled) setError(de ? 'Jobs konnten nicht geladen werden. Deine Filter bleiben erhalten.' : 'Unable to load jobs. Your filters have been retained.');
    }).finally(() => {
      if (!cancelled && request === sequence.current) setLoading(false);
    });
    return () => {
      cancelled = true;
      sequence.current++;
    };
  }, [criteria, refresh, owner]);
  useEffect(() => {
    let live = true;
    jobsService.getStats().then(value => {
      if (live) setStats(value);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [owner, refresh]);
  useEffect(() => {
    if (wide && jobs[0] && !params.get('job')) setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('job', String(jobs[0].id));
      return next;
    }, {
      replace: true
    });
  }, [wide, jobs, params]);
  useEffect(() => {
    if (loading) return;
    const anchor = consumeJobReturn(owner, url);
    if (!anchor) return;
    const frame = requestAnimationFrame(() => {
      listRoot.current?.querySelector<HTMLButtonElement>(`[data-job-id="${anchor.id}"] .job-result-title`)?.focus({
        preventScroll: true
      });
      window.scrollTo(0, anchor.y);
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, owner, url]);
  const updateJob = (updated: Job) => {
    setData(current => current.owner === owner ? {
      ...current,
      jobs: current.jobs.map(job => job.id === updated.id ? updated : job).filter(job => !job.is_hidden && (search.tab === 'all' || job.status === search.tab)),
      total: Math.max(0,current.total - (current.jobs.some(job=>job.id===updated.id) && (updated.is_hidden || (search.tab!=='all' && updated.status!==search.tab)) ? 1 : 0))
    } : current);
    void jobsService.getStats().then(value=>{if(useAuthStore.getState().user?.id===owner)setStats(value);}).catch(() => {});
  };
  const openJob = (job: Job) => {
    userSelected.current = true;
    // Flush a keyword typed immediately before opening a result. Its debounce
    // must not discard the return query when this component unmounts.
    const next=writeJobSearch({...readJobSearch(latestParams.current),search:input},latestParams.current);
    if (wide) {
      next.set('job', String(job.id));
      commit(next);
    } else {
      const fromJobs=location.pathname+(next.size?'?'+next.toString():'');
      if(fromJobs!==url)commit(next,true);
      rememberJobReturn(owner, fromJobs, job.id);
      navigate(`/jobs/${job.id}`, {
        state: {
          fromJobs,
          selection: true
        }
      });
    }
  };
  const saveJob = async (job: Job, button?: HTMLButtonElement) => {
    if (action !== null) return;
    setAction(job.id);
    setError('');
    try {
      const updated = await jobsService.updateStatus(job.id, job.status === 'new' ? 'saved' : 'new');
      if (useAuthStore.getState().user?.id !== owner) return;
      updateJob(updated);
      confirmSaved(button ?? null);
      showToast(updated.status === 'saved' ? t('toastJobSaved') : t('toastJobUnsaved'));
    } catch {
      setError(de ? 'Status nicht gespeichert. Bitte erneut versuchen.' : 'Status was not saved. Please try again.');
    } finally {
      setAction(null);
    }
  };
  const hideJob = async (job: Job) => {
    if(action!==null)return;setAction(job.id);
    try {
      await jobsService.toggleHidden(job.id, true);
      if (useAuthStore.getState().user?.id !== owner) return;
      setRefresh(value => value + 1);
      showToast(t('toastJobHidden'), 'info', {
        label: de ? 'Rückgängig' : 'Undo',
        onClick: () => {
          if (useAuthStore.getState().user?.id !== owner) return;
          void jobsService.toggleHidden(job.id, false).then(() => {
            if (useAuthStore.getState().user?.id === owner) setRefresh(value => value + 1);
          }).catch(() => setError(de ? 'Wiederherstellen fehlgeschlagen.' : 'Unable to restore this job.'));
        }
      });
    } catch {
      if(useAuthStore.getState().user?.id===owner)setError(de ? 'Job konnte nicht ausgeblendet werden.' : 'Could not hide this job.');
    } finally { setAction(null); }
  };
  const createManual = async (event: FormEvent) => {
    event.preventDefault();
    if (manualBusy) return;
    if(!manual.title.trim()||!manual.company.trim()){
      setManualError(de?'Bitte einen Stellentitel und ein Unternehmen eingeben.':'Enter a job title and company.');
      return;
    }
    setManualBusy(true);
    setManualError('');
    try {
      const created = await jobsService.createManualJob(manual);
      if(useAuthStore.getState().user?.id!==owner)return;
      setManual(emptyManual);
      setManualOpen(false);
      navigate(`/jobs/${created.id}`);
    } catch {
      setManualError(de ? 'Job nicht gespeichert. Bitte erneut versuchen.' : 'Job was not saved. Please try again.');
    } finally {
      setManualBusy(false);
    }
  };
  const activeFilters: [string, string, () => void][] = [...(search.search ? [[de ? 'Suche' : 'Search', search.search, () => {
    setInput('');
    change({
      search: ''
    });
  }] as [string, string, () => void]] : []), ...(search.source ? [[de ? 'Quelle' : 'Source', search.source, () => change({
    source: ''
  })] as [string, string, () => void]] : []), ...(search.dateDays ? [[de ? 'Zeitraum' : 'Date', `${search.dateDays} ${de ? 'Tage' : 'days'}`, () => change({
    dateDays: ''
  })] as [string, string, () => void]] : []), ...(search.remoteOnly ? [[de ? 'Arbeitsort' : 'Work', 'Remote', () => change({
    remoteOnly: false
  })] as [string, string, () => void]] : []), ...(search.studentOnly ? [[de ? 'Stellentyp' : 'Type', de ? 'Studierende' : 'Student', () => change({
    studentOnly: false
  })] as [string, string, () => void]] : []), ...(search.highMatchOnly ? [[de ? 'Passung' : 'Match', de ? 'Starke Passung' : 'Strong match', () => change({
    highMatchOnly: false
  })] as [string, string, () => void]] : []), ...(search.location ? [[de ? 'Ort' : 'Location', Object.keys(STATE_CITIES).find(key => STATE_CITIES[key].join('|') === search.location) ?? search.location, () => change({
    location: ''
  })] as [string, string, () => void]] : [])];
  const clear = () => {
    setInput('');
    change({
      search: '',
      source: '',
      dateDays: '',
      remoteOnly: false,
      studentOnly: false,
      highMatchOnly: false,
      location: ''
    });
  };
  const filterContent = <div className="jobs-filter-panel"><label className="ui-label">{t('allStates')}<select className="ui-field" value={search.location} onChange={event => change({
        location: event.target.value
      })}><option value="">{t('allStates')}</option>{Object.entries(STATE_CITIES).map(([state, cities]) => <option value={cities.join('|')} key={state}>{state}</option>)}</select></label><label className="ui-label">{de ? 'Quelle' : 'Source'}<select className="ui-field" value={search.source} onChange={event => change({
        source: event.target.value
      })}><option value="">{t('allSources')}</option><option value="bundesagentur">Bundesagentur</option><option value="adzuna">Adzuna</option><option value="stepstone">StepStone</option></select></label><label className="ui-label">{de ? 'Veröffentlicht' : 'Posted'}<select className="ui-field" value={search.dateDays} onChange={event => change({
        dateDays: event.target.value
      })}>{[['', 'anyTime'], ['7', 'last7Days'], ['30', 'last30Days'], ['90', 'last3Months']].map(([value, key]) => <option value={value} key={value}>{t(key)}</option>)}</select></label><label className="ui-check"><input type="checkbox" checked={search.studentOnly} onChange={event => change({
        studentOnly: event.target.checked
      })} />{de ? 'Werkstudent / Praktikum' : 'Student / internship'}</label><label className="ui-check"><input type="checkbox" checked={search.highMatchOnly} onChange={event => change({
        highMatchOnly: event.target.checked
      })} />{de ? 'Starke Passung' : 'Strong match'}</label><label className="ui-check"><input type="checkbox" checked={search.remoteOnly} onChange={event => change({
        remoteOnly: event.target.checked
      })} />Remote / Hybrid</label></div>;
  return <div className="ui-page">
    <PageHeader title={de ? 'Jobs finden' : 'Find jobs'}><Button variant="primary" aria-label={t('addManualJob')} onClick={() => setManualOpen(true)}><Icon name="plus" /><span className="mobile-icon-label">{t('addManualJob')}</span></Button></PageHeader>
    <FeedHealth refreshKey={refresh} />
    <div className="jobs-toolbar"><div className="jobs-search-line"><label className="jobs-search"><Icon name="search" /><input aria-label={de ? 'Jobs suchen' : 'Search jobs'} placeholder={t('searchPlaceholder')} value={input} onChange={event => setInput(event.target.value)} />{input && <button type="button" aria-label={de ? 'Suche löschen' : 'Clear search'} onClick={() => {
            setInput('');
            change({
              search: ''
            });
          }}><Icon name="close" /></button>}</label><Button aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Icon name="filter" />{de ? 'Filter' : 'Filters'}{activeFilters.length ? ` (${activeFilters.length})` : ''}</Button></div><div className="jobs-controls"><Button aria-pressed={search.remoteOnly} onClick={() => change({
          remoteOnly: !search.remoteOnly
        })}>Remote</Button><SavedSearches filters={search} onApply={filters => change({
          ...filters,
          page: 1
        })} /><select className="ui-field jobs-sort" aria-label={de ? 'Sortierung' : 'Sort jobs'} value={search.sortBy} onChange={event => change({
          sortBy: event.target.value
        })}>{JOB_SORTS.map((sort, index) => <option key={sort} value={sort}>{t(['newestFirst', 'bestMatch', 'recentlyAdded', 'expiringSoon', 'titleAZ', 'companyAZ'][index])}</option>)}</select></div>{filtersOpen && !phone && filterContent}{activeFilters.length > 0 && <div className="ui-actions">{activeFilters.map(([name, value, remove]) => <span className="jobs-active-filter" key={name}>{value}<button type="button" aria-label={`${de ? 'Entfernen' : 'Remove'} ${name}: ${value}`} onClick={remove}><Icon name="close" width="14" height="14" /></button></span>)}<Button variant="quiet" onClick={clear}>{t('clearAll')}</Button></div>}</div>
    <Dialog open={filtersOpen && phone} title={de ? 'Jobs filtern' : 'Filter jobs'} onClose={() => setFiltersOpen(false)}>{filterContent}<div className="ui-form-footer"><Button onClick={clear}>{t('clearAll')}</Button><Button variant="primary" onClick={() => setFiltersOpen(false)}>{de ? 'Ergebnisse anzeigen' : 'Show results'}</Button></div></Dialog>
    <div className="jobs-tabs" aria-label={de ? 'Jobstatus' : 'Job status'}>{JOB_TABS.map(tab => <button type="button" key={tab} aria-pressed={search.tab === tab} onClick={() => change({
        tab
      })}>{t(tab)}<small>{tab === 'all' ? stats?.total : stats?.[tab]}</small></button>)}</div>
    <div className="jobs-result-count"><span role="status">{loading ? de ? 'Wird geladen…' : 'Loading…' : `${total.toLocaleString(de ? 'de-DE' : 'en-GB')} ${de ? 'Stellen' : 'jobs'}`}</span><Button variant="quiet" onClick={() => {
        invalidateJobSnapshot();
        setRefresh(value => value + 1);
      }}><Icon name="refresh" />{de ? 'Aktualisieren' : 'Refresh'}</Button></div>
    {error && <InlineError retry={() => setRefresh(value => value + 1)} label={de ? 'Erneut versuchen' : 'Retry'}>{error}</InlineError>}
    <div className="jobs-workbench"><div className="jobs-list" ref={listRoot}>{loading && !jobs.length ? <Skeleton /> : jobs.length ? jobs.map(job => <SwipeableRow key={job.id} onSave={job.status === 'new' ? () => void saveJob(job) : undefined} onHide={() => void hideJob(job)} saveLabel={t('save')} hideLabel={t('hide')}><article className="job-result" data-job-id={job.id} data-selected={wide && selectedId === job.id}><div className="job-result-main"><button type="button" className="job-result-title" onClick={() => openJob(job)} aria-current={selectedId === job.id ? 'true' : undefined}><JobResultContent job={job} /></button>{(job.status === 'new' || job.status === 'saved') && <Button className="ui-icon-button" variant="quiet" disabled={action === job.id} aria-label={`${job.status === 'new' ? t('save') : t('unsave')} ${job.title}`} aria-pressed={job.status === 'saved'} onClick={event => void saveJob(job, event.currentTarget)}><Icon name="bookmark" /></Button>}</div><div className="job-result-meta">{job.match_score != null && <span className="job-match">{job.match_score}/100 {de ? 'Relevanz' : 'relevance'}</span>}<ListingEvidence job={job} compact t={t} /><span>{job.source}</span><span>{job.posted_date && !Number.isNaN(new Date(job.posted_date).getTime()) ? new Intl.DateTimeFormat(de ? 'de-DE' : 'en-GB', {
                  dateStyle: 'medium'
                }).format(new Date(job.posted_date)) : ''}</span>{job.is_active === false && <span>{t('noLongerListed')}</span>}{job.status !== 'new' && <span>{t(job.status)}</span>}</div></article></SwipeableRow>) : <EmptyState title={de ? 'Keine passenden Jobs' : 'No matching jobs'}>{de ? 'Passe deine Suche an oder entferne einen Filter.' : 'Try changing your search or removing a filter.'}</EmptyState>}</div>{wide && selectedId && <aside className="jobs-inspector" aria-label={de ? 'Jobdetails' : 'Job details'}><Suspense fallback={<Skeleton/>}><JobDetails key={`${owner}:${selectedId}`} id={selectedId} initialJob={selected} animateSelection={userSelected.current} onChange={updateJob} /></Suspense></aside>}</div>
    {total > 50 && <div className="jobs-pagination"><Button disabled={search.page <= 1} onClick={() => change({
        page: search.page - 1
      })}>{t('prev')}</Button><span>{t('page')} {search.page} {t('of')} {Math.ceil(total / 50)}</span><Button disabled={search.page >= Math.ceil(total / 50)} onClick={() => change({
        page: search.page + 1
      })}>{t('next')}</Button></div>}
    <Dialog open={manualOpen} title={t('manualJobTitle')} onClose={() => {
      if (!manualBusy) setManualOpen(false);
    }}><form onSubmit={createManual}>{manualError && <InlineError>{manualError}</InlineError>}<div className="ui-form-grid">{(['title', 'company', 'location', 'url'] as const).map(field => <label className="ui-label" key={field}>{t({
              title: 'jobTitle',
              company: 'company',
              location: 'location',
              url: 'jobUrl'
            }[field])}<input className="ui-field" type={field === 'url' ? 'url' : 'text'} required={field === 'title' || field === 'company'} value={manual[field]} onChange={event => setManual(value => ({
              ...value,
              [field]: event.target.value
            }))} /></label>)}<label className="ui-label ui-wide">{t('description')}<textarea className="ui-field" rows={5} value={manual.description} onChange={event => setManual(value => ({
              ...value,
              description: event.target.value
            }))} /></label></div><div className="ui-form-footer"><Button disabled={manualBusy} onClick={() => setManualOpen(false)}>{t('cancel')}</Button><Button type="submit" variant="primary" busy={manualBusy}>{manualBusy ? t('adding') : t('addJob')}</Button></div></form></Dialog>
  </div>;
}
