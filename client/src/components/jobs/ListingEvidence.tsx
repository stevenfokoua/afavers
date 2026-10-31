import type { Job } from '../../types';
import { listingLimitations } from '../../../../supabase/functions/_shared/matching';

/** Source-data limits stay separate from the person's saved search criteria. */
export function ListingEvidence({ job, compact = false, t }: { job: Job; compact?: boolean; t: (key: string) => string }) {
  const limitations = job.match_limitations ?? listingLimitations(job);
  if (compact) return limitations.includes('requirements_unavailable')
    ? <span className="ui-muted">{t('summaryOnly')}</span> : null;
  if (!limitations.length) return null;
  return <div className="ui-muted text-sm" aria-label={t('listingInformation')}>
    {limitations.includes('requirements_unavailable') && <p>{t('requirementsUnavailable')}</p>}
    {limitations.includes('working_language_unknown') && <p>{t('workingLanguageUnconfirmed')}</p>}
  </div>;
}
