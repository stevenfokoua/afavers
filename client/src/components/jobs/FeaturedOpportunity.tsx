import type { ReactNode } from 'react';
import type { Job } from '../../types';

export function FeaturedOpportunity({ job, source, t, children }: { job: Job; source: string; t: (key: string) => string; children: ReactNode }) {
  const reasons = (job.match_reasons ?? []).filter(Boolean).slice(0, 4);
  const gaps = (job.match_gaps ?? []).filter(Boolean).slice(0, 2);
  return <>
    <header className="opportunity-header"><div className="opportunity-meta"><span>{source}</span>{job.match_score != null && <span className="job-match">{job.match_score}% {t('match')}</span>}</div><h2>{job.title}</h2><p className="opportunity-company">{job.company}</p><p className="opportunity-location">{job.location || '—'}</p>{job.salary && <p className="opportunity-salary">{job.salary}</p>}</header>
    <div className="opportunity-body">{(reasons.length > 0 || gaps.length > 0) && <section className="opportunity-reasons"><h3>{t('whyThisPick')}</h3><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}{gaps.map(gap => <li className="ui-muted" key={gap}>{t('missing')}: {gap}</li>)}</ul></section>}
      {job.description && <section className="opportunity-description"><h3>{t('jobSummary')}</h3><p>{job.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</p></section>}
      <div className="opportunity-links">{children}</div>
    </div>
  </>;
}
