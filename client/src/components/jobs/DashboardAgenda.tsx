import { useState } from 'react';
import { useLanguage } from '../../store/languageStore';
import type { DashboardStats, FollowUpAlert, Job } from '../../types';
import { Button } from '../ui';
import { ActionCard } from './ActionCard';

type Props = { stats: DashboardStats; followUps: FollowUpAlert[]; upcomingInterviews: Job[]; interviewsFirst?: boolean; onReviewJobs: () => void; onFollowUps: (id: number) => void; onInterviews: (id: number) => void; onTracker: () => void; onHotPicks: () => void };

export function DashboardAgenda({ stats, followUps, upcomingInterviews, interviewsFirst = false, onReviewJobs, onFollowUps, onInterviews, onTracker, onHotPicks }: Props) {
  const { lang } = useLanguage(), de = lang === 'de';
  const [expanded, setExpanded] = useState(false);
  const preparing = stats.saved + stats.preparing;
  const followRows = (expanded ? followUps : followUps.slice(0, 3)).map(job => <ActionCard key={`follow-${job.id}`} date={job.follow_up_date} title={job.company} description={job.title} kind={de ? 'Nachfassen' : 'Follow-up'} action={de ? 'Bewerbung öffnen' : 'Review application'} de={de} onClick={() => onFollowUps(job.id)} />);
  const interviewRows = (expanded ? upcomingInterviews : upcomingInterviews.slice(0, 3)).filter(job => job.interview_date).map(job => <ActionCard key={`interview-${job.id}`} date={job.interview_date!} title={job.company} description={job.title} kind={de ? 'Vorstellungsgespräch' : 'Interview'} action={de ? 'Gespräch vorbereiten' : 'Prepare interview'} de={de} onClick={() => onInterviews(job.id)} />);
  return <section className="dashboard-agenda mb-6">
    <div className="flex items-center justify-between gap-4 mb-4"><h2 className="text-lg">{de ? 'Anstehend' : 'Upcoming'}</h2><Button onClick={onTracker}>{de ? 'Bewerbungen öffnen' : 'Open applications'}</Button></div>
    {followRows.length + interviewRows.length > 0 ? <div className="agenda-cards">{interviewsFirst ? [interviewRows, followRows] : [followRows, interviewRows]}</div> : <p className="py-4 ui-muted text-sm">{de ? 'Keine anstehenden Einträge in den gewählten Dashboard-Bereichen.' : 'No upcoming items in your selected dashboard sections.'}</p>}
    {(followUps.length > 3 || upcomingInterviews.length > 3) && <Button className="mt-3" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? (de ? 'Weniger anzeigen' : 'Show fewer') : (de ? 'Alle Termine anzeigen' : 'Show all scheduled items')}</Button>}
    {preparing > 0 && <div className="agenda-continue"><div><strong>{de ? 'Bewerbungen fortsetzen' : 'Continue applications'}</strong><p>{preparing} {de ? 'gespeicherte und vorbereitete Stellen' : 'saved and preparing opportunities'}</p></div><Button onClick={onTracker}>{de ? 'Öffnen' : 'Open'}</Button></div>}
    <div className="ui-actions mt-4"><Button variant="primary" onClick={onReviewJobs}>{de ? 'Neue Jobs prüfen' : 'Review new jobs'}</Button><Button onClick={onHotPicks}>Hot Picks</Button></div>
  </section>;
}
