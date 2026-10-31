import { useEffect, useId, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { APPLICATION_CHECKLIST, jobsService } from '../../services/jobs.service';
import type { Job } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useLanguage } from '../../store/languageStore';
import { ListingEvidence } from './ListingEvidence';
import { useToastStore } from '../../store/toastStore';
import { useDirtyNavigation } from '../../hooks/useDirtyNavigation';
import { Button, EmptyState, Icon, InlineError, Skeleton } from '../ui';
import { StatusSelect } from './StatusSelect';
import { clearDraft, readDraft, resetDrafts, writeDraft } from './jobDrafts';
import { confirmSaved, settleDetails } from '../../utils/uiMotion';
type Props = {
  id: number;
  initialJob?: Job;
  onChange?: (job: Job) => void;
  onBack?: () => void;
  animateSelection?: boolean;
};
const checklistDE: Record<string, string> = {
  'CV tailored': 'Lebenslauf angepasst',
  'Cover letter ready': 'Anschreiben vorbereitet',
  'Portfolio attached': 'Portfolio beigefügt',
  'Certificates attached': 'Zeugnisse beigefügt',
  'Application submitted': 'Bewerbung eingereicht',
  'Follow-up sent': 'Nachfrage gesendet'
};
export function JobDetails({
  id,
  initialJob,
  onChange,
  onBack,
  animateSelection = false
}: Props) {
  const {
      lang,
      t
    } = useLanguage(),
    de = lang === 'de',
    locale = de ? 'de-DE' : 'en-GB',
    owner = useAuthStore(s => s.user?.id ?? null);
  const [job, setJob] = useState<Job | null>(initialJob ?? null),
    [loading, setLoading] = useState(!initialJob),
    [error, setError] = useState(''),
    [tab, setTab] = useState<'overview' | 'preparation' | 'activity'>('overview');
  const [notes, setNotes] = useState(() => readDraft(owner, id)?.notes ?? initialJob?.notes ?? ''),
    [letter, setLetter] = useState(() => readDraft(owner, id)?.coverLetter ?? initialJob?.cover_letter ?? ''),
    [busy, setBusy] = useState(''),
    [saved, setSaved] = useState('');
  const [dateDraft, setDateDraft] = useState({
    applied: '',
    followup: '',
    interview: ''
  });
  const dirtySetter = useDirtyNavigation(),
    sequence = useRef(0),
    content = useRef<HTMLDivElement>(null),
    saveButton = useRef<HTMLButtonElement>(null),
    statusId = useId();
  const dirty = !!job && (notes !== (job.notes ?? '') || letter !== (job.cover_letter ?? ''));
  const showToast = useToastStore(s => s.show);
  const validOwner = () => useAuthStore.getState().user?.id === owner;
  const accept = (value: Job) => {
    setJob(value);
    onChange?.(value);
  };
  const load = async () => {
    const current = ++sequence.current;
    setError('');
    setLoading(!initialJob);
    try {
      const value = initialJob?.id === id ? initialJob : await jobsService.getJob(id);
      if (current !== sequence.current || !validOwner()) return;
      resetDrafts(owner);
      const draft = readDraft(owner, id);
      setJob(value);
      setNotes(draft?.notes ?? value.notes ?? '');
      setLetter(draft?.coverLetter ?? value.cover_letter ?? '');
      setDateDraft({
        applied: value.applied_date?.slice(0, 10) ?? '',
        followup: value.follow_up_date?.slice(0, 10) ?? '',
        interview: value.interview_date?.slice(0, 10) ?? ''
      });
    } catch {
      if (current === sequence.current) setError(de ? 'Dieser Job konnte nicht geladen werden.' : 'This job could not be loaded.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [id, owner]);
  useEffect(() => {
    if (initialJob?.id === id && !dirty && !busy) {
      setJob(initialJob);
      setNotes(initialJob.notes ?? '');
      setLetter(initialJob.cover_letter ?? '');
    }
  }, [initialJob]);
  useEffect(() => {
    dirtySetter(dirty);
    return () => dirtySetter(false);
  }, [dirty, dirtySetter]);
  useEffect(() => {
    if (loading || !job) return;
    if (dirty) writeDraft(owner, id, {
      notes,
      coverLetter: letter
    });else clearDraft(owner, id);
  }, [dirty, notes, letter, id, owner, loading, job]);
  useEffect(() => {
    if (!loading && job && animateSelection) settleDetails(content.current);
  }, [loading, id]);
  const mutate = async (key: string, operation: () => Promise<Job>) => {
    if (busy) return;
    const request = sequence.current;
    setBusy(key);
    setError('');
    setSaved('');
    try {
      const value = await operation();
      if (sequence.current !== request || !validOwner()) return;
      accept(value);
      setSaved(key);
      if (key === 'notes' || key === 'letter') confirmSaved(saveButton.current);
    } catch {
      if (sequence.current === request) setError(de ? 'Nicht gespeichert. Dein Entwurf bleibt erhalten. Bitte erneut versuchen.' : 'Not saved. Your draft is retained. Please try again.');
    } finally {
      if (sequence.current === request) setBusy('');
    }
  };
  const changeStatus = (status: Job['status']) => {
    if (!job) return;
    void mutate('status', () => jobsService.updateStatus(job.id, status));
  };
  const toggleHidden = async () => {
    if (!job || busy) return;
    const original = job;
    setBusy('hidden');
    setError('');
    try {
      const updated = await jobsService.toggleHidden(id, !job.is_hidden);
      if (!validOwner()) return;
      accept(updated);
      showToast(updated.is_hidden ? t('toastJobHidden') : t('unhide'), 'info', {
        label: de ? 'Rückgängig' : 'Undo',
        onClick: () => {
          if (!validOwner()) return;
          void jobsService.toggleHidden(id, original.is_hidden).then(value => {
            if (validOwner()) accept(value);
          }).catch(() => setError(de ? 'Wiederherstellen fehlgeschlagen.' : 'Unable to restore this job.'));
        }
      });
    } catch {
      setError(de ? 'Sichtbarkeit konnte nicht geändert werden.' : 'Could not change visibility.');
    } finally {
      setBusy('');
    }
  };
  const format = (date: string | null | undefined) => date && !Number.isNaN(new Date(date).getTime()) ? new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium'
  }).format(new Date(date)) : '—';
  if (loading) return <Skeleton />;
  if (!job) return <div className="job-details"><EmptyState title={t('jobNotFound')} action={<Button onClick={() => void load()}>{de ? 'Erneut versuchen' : 'Retry'}</Button>} />{error && <InlineError>{error}</InlineError>}</div>;
  const tabs = [['overview', de ? 'Übersicht' : 'Overview'], ['preparation', de ? 'Vorbereitung' : 'Preparation'], ['activity', de ? 'Verlauf' : 'Activity']] as const;
  return <div ref={content} className="job-details">
    {onBack && <Button variant="quiet" onClick={onBack}><Icon name="back" />{t('backToJobs')}</Button>}
    <h1 className="job-detail-title">{job.title}</h1><p className="job-detail-company">{job.company}</p>
    {job.is_active === false && <p className="ui-muted text-sm mt-2">{t('noLongerListed')}</p>}
    <div className="job-detail-meta"><span>{job.location || '—'}</span>{job.salary && <span>{job.salary}</span>}<span>{job.source}</span></div>
    <div className="ui-actions">{job.url && <a className="ui-button ui-button--primary" href={/^https?:\/\//i.test(job.url) ? job.url : undefined} target="_blank" rel="noopener noreferrer">{de?'Stellenanzeige öffnen':'Open listing'}<Icon name="external" /></a>}{job.status === 'new' && <Button onClick={() => changeStatus('saved')} busy={!!busy}><Icon name="bookmark" />{t('save')}</Button>}{job.status === 'saved' && <Button onClick={() => changeStatus('new')} busy={!!busy}>{t('unsave')}</Button>}{job.status === 'applied' && <Button onClick={() => changeStatus('saved')} busy={!!busy}>{t('revertToSaved')}</Button>}<Button onClick={() => void toggleHidden()} busy={!!busy}><Icon name="eyeOff" />{job.is_hidden ? t('unhide') : t('hide')}</Button></div>
    <div className="job-status"><label htmlFor={statusId}>{de ? 'Bewerbungsstatus' : 'Application status'}</label><div><StatusSelect id={statusId} label={de ? 'Bewerbungsstatus ändern' : 'Change application status'} value={job.status} onChange={changeStatus} disabled={!!busy} /></div><span role="status" className="ui-muted text-xs">{busy === 'status' ? de ? 'Wird gespeichert…' : 'Saving…' : saved === 'status' ? de ? 'Gespeichert' : 'Saved' : ''}</span></div>
    {error && <InlineError>{error}</InlineError>}
    <div className="job-tabs" role="tablist" aria-label={de ? 'Jobbereiche' : 'Job sections'}>{tabs.map(([key, label]) => <button type="button" key={key} role="tab" id={`${statusId}-${key}`} aria-controls={`${statusId}-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onKeyDown={event => {
        const index = tabs.findIndex(([value]) => value === tab);
        if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
          setTab(tabs[next][0]);
          document.getElementById(`${statusId}-${tabs[next][0]}`)?.focus();
        }
      }} onClick={() => setTab(key)}>{label}</button>)}</div>
    <section role="tabpanel" id={`${statusId}-panel-overview`} aria-labelledby={`${statusId}-overview`} hidden={tab !== 'overview'}>
      {job.match_score != null && <details className="job-match-details"><summary>{de ? 'Relevanz dieser Anzeige' : 'Listing relevance'} <span className="job-match">{job.match_score}/100</span></summary><p className="ui-muted text-sm">{de ? 'Vergleicht Suchbegriffe und Standort. Bitte prüfe die Anforderungen selbst.' : 'Compares search terms and location. Check the requirements before applying.'}</p><ul>{job.match_reasons?.map(reason => <li key={reason}>{reason}</li>)}{job.match_gaps?.map(gap => <li key={gap}>{de ? 'Fehlt' : 'Missing'}: {gap}</li>)}</ul></details>}
      <ListingEvidence job={job} t={t} />
      <div className="job-prose" dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(job.description?.includes('<') ? job.description : job.description?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') || '')
      }} />
      <dl className="ui-form-grid mt-6"><div><dt className="ui-muted text-sm">{t('applied')}</dt><dd>{format(job.applied_date)}</dd></div><div><dt className="ui-muted text-sm">{t('followup')}</dt><dd>{format(job.follow_up_date)}</dd></div></dl><label className="ui-label mt-5">{t('interviewDate')}<input type="date" className="ui-field" value={dateDraft.interview} disabled={!!busy} onChange={event => {
          const value = event.target.value;
          setDateDraft(previous => ({
            ...previous,
            interview: value
          }));
          void mutate('interview', () => jobsService.updateInterviewDate(id, value || null));
        }} /></label>
      <div className="job-freshness">{t('posted')}: {format(job.posted_date)}{job.deadline && <> · {t('deadline')}: {format(job.deadline)}</>}<br />{de ? 'Zuletzt im Feed gesehen' : 'Last seen in feed'}: {format(job.last_seen_at)}</div>
    </section>
    <section role="tabpanel" id={`${statusId}-panel-preparation`} aria-labelledby={`${statusId}-preparation`} hidden={tab !== 'preparation'} className="job-preparation">
      <div><h2 className="text-lg mb-2">{de ? 'Checkliste' : 'Checklist'}</h2>{APPLICATION_CHECKLIST.map(item => <label className="ui-check" key={item}><input type="checkbox" checked={!!job.checklist?.[item]} disabled={!!busy} onChange={() => void mutate('checklist', () => jobsService.updateChecklist(id, {
            ...job.checklist,
            [item]: !job.checklist?.[item]
          }))} />{de ? checklistDE[item] ?? item : item}</label>)}</div>
      <label className="ui-label">{t('notes')}<textarea className="ui-field" value={notes} onChange={event => {
          setNotes(event.target.value);
          setSaved('');
        }} /></label><div className="ui-actions"><Button ref={saveButton} variant="primary" busy={!!busy} onClick={() => void mutate('notes', () => jobsService.updateNotes(id, notes))}>{t('saveNotes')}</Button><span className="ui-muted text-sm" role="status">{saved === 'notes' ? de ? 'Gespeichert' : 'Saved' : dirty ? de ? 'Ungespeicherter Entwurf' : 'Unsaved draft' : ''}</span></div>
      <label className="ui-label">{t('coverLetterDraft')}<textarea className="ui-field" value={letter} onChange={event => {
          setLetter(event.target.value);
          setSaved('');
        }} /></label><div className="ui-actions"><Button busy={!!busy} onClick={() => void mutate('letter', () => jobsService.updateCoverLetter(id, letter))}>{de ? 'Anschreiben speichern' : 'Save cover letter'}</Button><span className="ui-muted text-sm" role="status">{saved === 'letter' ? de ? 'Gespeichert' : 'Saved' : ''}</span></div>
    </section>
    <section role="tabpanel" id={`${statusId}-panel-activity`} aria-labelledby={`${statusId}-activity`} hidden={tab !== 'activity'}><ol className="job-activity">{job.history?.length ? [...job.history].reverse().map((event, index) => <li key={`${event.at}-${index}`}><span>{event.label}</span><time dateTime={event.at}>{format(event.at)}</time></li>) : <li className="ui-muted">{de ? 'Noch keine Aktivitäten.' : 'No activity yet.'}</li>}</ol></section>
  </div>;
}
