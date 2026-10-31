import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { JobDetails } from '../components/jobs/JobDetails';
import { EmptyState } from '../components/ui';
import { useLanguage } from '../store/languageStore';
import { useAuthStore } from '../store/authStore';
export function JobDetailPage() {
  const {
      id
    } = useParams(),
    location = useLocation(),
    navigate = useNavigate(),
    {
      t
    } = useLanguage();
  const owner = useAuthStore(s => s.user?.id ?? null),
    jobId = Number(id);
  if (!Number.isSafeInteger(jobId) || jobId <= 0) return <EmptyState title={t('jobNotFound')} />;
  const state = location.state as {
    fromJobs?: string;
    selection?: boolean;
  } | null;
  return <div className="job-details-full"><JobDetails key={`${owner}:${jobId}`} id={jobId} animateSelection={!!state?.selection} onBack={() => {
      if (state?.fromJobs && (state.fromJobs==='/jobs'||state.fromJobs.startsWith('/jobs?'))) navigate(-1);else navigate('/jobs');
    }} /></div>;
}
