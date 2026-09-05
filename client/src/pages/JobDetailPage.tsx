import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { APPLICATION_CHECKLIST, jobsService } from '../services/jobs.service';
import type { Job } from '../types';
import { useLanguage } from '../store/languageStore';
import DOMPurify from 'dompurify';

const STATUS_OPTIONS: { value: Job['status']; labelKey: string; color: string; dot: string }[] = [
  { value: 'new',          labelKey: 'statusNew',          color: 'bg-blue-50 text-blue-700 border-blue-200',      dot: 'bg-blue-400' },
  { value: 'saved',        labelKey: 'statusSaved',        color: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  { value: 'preparing',    labelKey: 'statusPreparing',    color: 'bg-blue-50 text-blue-700 border-blue-200',      dot: 'bg-blue-500' },
  { value: 'applied',      labelKey: 'statusApplied',      color: 'bg-green-50 text-green-700 border-green-200',   dot: 'bg-green-500' },
  { value: 'followup',     labelKey: 'statusFollowup',     color: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  { value: 'interviewing', labelKey: 'statusInterviewing', color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  { value: 'offered',      labelKey: 'statusOffered',      color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { value: 'rejected',     labelKey: 'statusRejected',     color: 'bg-red-50 text-red-600 border-red-200',         dot: 'bg-red-400' },
  { value: 'archived',     labelKey: 'statusArchived',     color: 'bg-gray-50 text-gray-600 border-gray-200',      dot: 'bg-gray-400' },
];

const isHtml = (str: string) => /<[a-z][\s\S]*>/i.test(str);

export const JobDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [savingCoverLetter, setSavingCoverLetter] = useState(false);
  const [coverLetterSaved, setCoverLetterSaved] = useState(false);
  const [interviewDate, setInterviewDate] = useState('');
  const [savingInterviewDate, setSavingInterviewDate] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingChecklist, setUpdatingChecklist] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  useEffect(() => {
    if (id) fetchJob();
  }, [id]);

  const fetchJob = async () => {
    try {
      setLoading(true);
      const data = await jobsService.getJob(Number(id));
      setJob(data);
      setNotes(data.notes || '');
      setCoverLetter(data.cover_letter || '');
      setInterviewDate(data.interview_date ? data.interview_date.slice(0, 10) : '');
    } catch (error) {
      console.error('Failed to fetch job:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: Job['status']) => {
    if (!job) return;
    try {
      setUpdatingStatus(true);
      const updated = await jobsService.updateStatus(job.id, newStatus);
      setJob(updated);
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!job) return;
    try {
      setSavingNotes(true);
      const updated = await jobsService.updateNotes(job.id, notes);
      setJob(updated);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save notes:', error);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveCoverLetter = async () => {
    if (!job) return;
    setSavingCoverLetter(true);
    try {
      const updated = await jobsService.updateCoverLetter(job.id, coverLetter);
      setJob(updated);
      setCoverLetterSaved(true);
      setTimeout(() => setCoverLetterSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save cover letter:', error);
    } finally {
      setSavingCoverLetter(false);
    }
  };

  const handleSaveInterviewDate = async (date: string) => {
    if (!job) return;
    setSavingInterviewDate(true);
    try {
      const updated = await jobsService.updateInterviewDate(job.id, date || null);
      setJob(updated);
      setInterviewDate(date);
    } catch (error) {
      console.error('Failed to save interview date:', error);
    } finally {
      setSavingInterviewDate(false);
    }
  };

  const handleChecklistToggle = async (item: string) => {
    if (!job) return;
    const checklist = { ...(job.checklist ?? {}), [item]: !(job.checklist ?? {})[item] };
    setJob({ ...job, checklist });
    setUpdatingChecklist(true);
    try {
      const updated = await jobsService.updateChecklist(job.id, checklist);
      setJob(updated);
    } catch (error) {
      console.error('Failed to update checklist:', error);
      fetchJob();
    } finally {
      setUpdatingChecklist(false);
    }
  };

  const handleHide = async () => {
    if (!job) return;
    await jobsService.toggleHidden(job.id, !job.is_hidden);
    navigate('/jobs');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-3">{t('jobNotFound')}</p>
          <button onClick={() => navigate('/jobs')} className="text-blue-600 hover:underline text-sm">
            {t('backToJobs')}
          </button>
        </div>
      </div>
    );
  }

  const currentStatus = STATUS_OPTIONS.find(s => s.value === job.status);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Compact sticky header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 px-6 py-3">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <button
            onClick={() => navigate('/jobs')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('backToJobs')}
          </button>
          <div className="flex items-center gap-2">
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition"
              >
                {t('applyNow')}
              </a>
            )}
            {job.status === 'saved' && (
              <button
                onClick={() => handleStatusChange('new')}
                disabled={updatingStatus}
                className="px-3 py-2 border border-yellow-200 text-yellow-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 text-sm rounded-lg transition disabled:opacity-50"
                title={t('unsaveJob')}
              >
                {t('unsave')}
              </button>
            )}
            {job.status === 'applied' && (
              <button
                onClick={() => handleStatusChange('saved')}
                disabled={updatingStatus}
                className="px-3 py-2 border border-gray-200 text-gray-500 hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-200 text-sm rounded-lg transition disabled:opacity-50"
                title={t('revertToSavedJob')}
              >
                {t('revertToSaved')}
              </button>
            )}
            <button
              onClick={handleHide}
              className="px-3 py-2 border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 text-sm rounded-lg transition"
            >
              {job.is_hidden ? t('unhide') : t('hide')}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* LEFT: Job info + description */}
          <div className="lg:col-span-2 space-y-4">

            {/* Title card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h1 className="text-xl font-bold text-gray-900 leading-tight">{job.title}</h1>
                  {job.is_active === false && (
                    <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                      {t('noLongerListed')}
                    </span>
                  )}
                  <p className="text-base text-gray-700 mt-1 font-medium">{job.company}</p>
                  {job.location && (
                    <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {job.location}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border ${currentStatus?.color}`}>
                  {t(currentStatus?.labelKey ?? 'statusNew')}
                </span>
              </div>

              <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-100 text-sm">
                {job.posted_date && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-xs">{t('posted')}</span>
                    <span className="font-medium text-gray-700">{new Date(job.posted_date).toLocaleDateString(locale)}</span>
                  </div>
                )}
                {job.deadline && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-xs">{t('deadline')}</span>
                    <span className="font-semibold text-red-600">{new Date(job.deadline).toLocaleDateString(locale)}</span>
                  </div>
                )}
                {job.salary && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-xs">{t('salary')}</span>
                    <span className="font-semibold text-green-700">{job.salary}</span>
                  </div>
                )}
                {job.applied_date && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-xs">{t('applied')}</span>
                    <span className="font-medium text-blue-700">{new Date(job.applied_date).toLocaleDateString(locale)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{t('jobDescription')}</h2>
              {job.description ? (
                isHtml(job.description) ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.description, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'iframe', 'script', 'object', 'embed'], FORBID_ATTR: ['style', 'formaction', 'form', 'onerror', 'onload'] }) }}
                  />
                ) : (
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">{job.description}</p>
                )
              ) : (
                <p className="text-gray-400 text-sm">{t('noDescriptionAvailable')}</p>
              )}
            </div>

            {/* Apply CTA */}
            {job.url && (
            <div className="flex justify-center">
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition"
              >
                {t('applyOnSite')}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            )}
          </div>

          {/* RIGHT: Status + Notes + Cover Letter */}
          <div className="space-y-4">

            {/* Status */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('trackStatus')}</h2>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleStatusChange(option.value)}
                    disabled={updatingStatus || job.status === option.value}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition text-center ${
                      job.status === option.value
                        ? option.color
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                    } disabled:cursor-not-allowed`}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Checklist */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('applicationChecklist')}</h2>
                {updatingChecklist && <span className="text-xs text-gray-400">{t('saving')}</span>}
              </div>
              <div className="space-y-2">
                {APPLICATION_CHECKLIST.map(item => {
                  const checked = Boolean(job.checklist?.[item]);
                  return (
                    <button
                      key={item}
                      onClick={() => handleChecklistToggle(item)}
                      className={`w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg border transition ${
                        checked
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs font-black ${
                        checked ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 text-transparent'
                      }`}>
                        ✓
                      </span>
                      <span className="text-sm font-medium">{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Match explanation */}
            {job.match_score && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Why this job</h2>
                  <span className={`text-sm font-black ${job.match_score >= 70 ? 'text-green-700' : job.match_score >= 50 ? 'text-blue-700' : 'text-gray-500'}`}>
                    {job.match_score}% match
                  </span>
                </div>
                <div className="space-y-2">
                  {(job.match_reasons ?? []).map(reason => (
                    <div key={reason} className="flex items-center gap-2 text-sm text-green-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {reason}
                    </div>
                  ))}
                  {(job.match_gaps ?? []).map(gap => (
                    <div key={gap} className="flex items-center gap-2 text-sm text-amber-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Missing: {gap}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interview date */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('interviewDate')}</h2>
              <input
                type="date"
                value={interviewDate}
                onChange={e => handleSaveInterviewDate(e.target.value)}
                disabled={savingInterviewDate}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:border-transparent outline-none text-sm text-gray-700 disabled:opacity-50"
              />
              {interviewDate && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-purple-700 font-medium">
                    📞 {new Date(interviewDate).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={() => handleSaveInterviewDate('')}
                    className="text-xs text-gray-400 hover:text-red-500 transition"
                  >
                    {t('clear')}
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('myNotes')}</h2>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('notesPlaceholder')}
                rows={5}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none transition resize-none text-sm text-gray-700 placeholder-gray-300"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-xs transition ${notesSaved ? 'text-green-600' : 'text-transparent'}`}>
                  {t('savedConfirm')}
                </span>
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                >
                  {savingNotes ? t('saving') : t('saveNotes')}
                </button>
              </div>
            </div>

            {/* Cover Letter */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('coverLetterDraft')}</h2>
              <textarea
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                placeholder={t('coverLetterPlaceholder')}
                rows={8}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none transition resize-none text-sm text-gray-700 placeholder-gray-300"
              />
              <div className="flex justify-between items-center mt-2">
                <span className={`text-xs transition ${coverLetterSaved ? 'text-green-600' : 'text-transparent'}`}>
                  {t('savedConfirm')}
                </span>
                <button
                  onClick={handleSaveCoverLetter}
                  disabled={savingCoverLetter}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                >
                  {savingCoverLetter ? t('saving') : t('saveDraft')}
                </button>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{t('applicationTimeline')}</h2>
              {job.history?.length ? (
                <div className="space-y-3">
                  {[...job.history].reverse().slice(0, 10).map((event, index) => (
                    <div key={`${event.at}-${index}`} className="flex gap-3">
                      <span className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{event.label}</p>
                        <p className="text-xs text-gray-400">{new Date(event.at).toLocaleString('de-DE')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">{t('noTimelineYet')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
