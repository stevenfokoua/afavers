import type { ReactNode } from 'react';
import type { Job } from '../../types';
import { cardDate, isOverdue, nextApplicationStep } from './cardDetails';

export function ApplicationCard({ job, de, onOpen, controls, showNotes = true }: { job: Job; de: boolean; onOpen: () => void; controls: ReactNode; showNotes?: boolean }) {
  const locale = de ? 'de-DE' : 'en-GB';
  const next = nextApplicationStep(job, de);
  const format = (value: string | null | undefined) => cardDate(value)?.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const activity = format(job.history?.at(-1)?.at ?? job.updated_at);
  return <article className="board-card application-card" data-job-id={job.id}>
    <p className="application-company">{job.company}</p>
    <button type="button" className="board-card-title" onClick={onOpen}>{job.title}</button>
    {job.location && <p className="application-location">{job.location}</p>}
    {job.is_active === false && <p className="card-notice">{de ? 'Nicht mehr ausgeschrieben' : 'No longer listed'}</p>}
    {job.notes && showNotes && <p className="application-notes line-clamp-2">{job.notes}</p>}
    <div className="application-next"><span>{de ? 'Nächster Schritt' : 'Next step'}</span><strong>{next.label}</strong>{format(next.date) && <p><time dateTime={next.date!}>{format(next.date)}</time>{isOverdue(next.date) && <span className="card-overdue">{de ? 'Überfällig' : 'Overdue'}</span>}</p>}</div>
    <dl className="application-dates">{format(job.applied_date) && <div><dt>{de ? 'Beworben' : 'Applied'}</dt><dd>{format(job.applied_date)}</dd></div>}{format(job.interview_date) && job.status !== 'interviewing' && <div><dt>{de ? 'Gespräch' : 'Interview'}</dt><dd>{format(job.interview_date)}</dd></div>}{activity && <div><dt>{de ? 'Aktualisiert' : 'Updated'}</dt><dd>{activity}</dd></div>}</dl>
    <div className="application-controls">{controls}</div>
  </article>;
}
