import type { Job } from '../../types';

export function JobResultContent({ job }: { job: Pick<Job, 'title' | 'company' | 'location' | 'salary'> }) {
  return <span className="job-row-content">
    <span className="job-row-copy"><strong className="job-row-heading">{job.title}</strong><span className="job-row-company">{job.company}</span></span>
    <span className="job-row-facts"><span>{job.location || '—'}</span>{job.salary && <span className="job-row-salary">{job.salary}</span>}</span>
  </span>;
}
