import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsService } from '../services/jobs.service';
import type { AnalyticsData, Job } from '../types';
import { useLanguage } from '../store/languageStore';
import { GermanyJobMap } from '../components/common/GermanyJobMap';
import { formatDate, escapeCsv, downloadBlob, isWithinDateRange } from '../utils/exportFormat';

const SOURCE_LABELS: Record<string, string> = {
  bundesagentur: 'Bundesagentur',
  stepstone: 'StepStone',
  adzuna: 'Adzuna',
  manual: 'Manual / extension',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-400',
  saved: 'bg-yellow-400',
  preparing: 'bg-blue-500',
  applied: 'bg-green-400',
  followup: 'bg-orange-400',
  interviewing: 'bg-purple-400',
  offered: 'bg-emerald-400',
  rejected: 'bg-red-400',
  archived: 'bg-gray-400',
};

const STATUS_OPTIONS: Job['status'][] = [
  'saved',
  'preparing',
  'applied',
  'followup',
  'interviewing',
  'offered',
  'rejected',
  'archived',
];

const APPLICATION_STATUSES = new Set<Job['status']>(['applied', 'followup', 'interviewing', 'offered', 'rejected']);

const Bar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
    <div
      className={`h-full rounded-full transition-all ${color}`}
      style={{ width: max > 0 ? `${Math.round((value / max) * 100)}%` : '0%' }}
    />
  </div>
);

const getActivityDate = (job: Job) => job.applied_date ?? job.updated_at ?? job.created_at;

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const checklistText = (job: Job) => {
  const entries = Object.entries(job.checklist ?? {});
  if (entries.length === 0) return '';
  return entries.map(([label, done]) => `${done ? 'Done' : 'Open'}: ${label}`).join('; ');
};

const timelineText = (job: Job) => (job.history ?? [])
  .map((event) => `${formatDate(event.at)} - ${event.label}`)
  .join('; ');

const exportRows = (jobs: Job[]) => {
  const headers = [
    'Tracker ID',
    'Date added',
    'Last updated',
    'Applied date',
    'Follow-up date',
    'Interview date',
    'Status',
    'Job title',
    'Company',
    'Location',
    'Source',
    'Salary',
    'Deadline',
    'Job URL',
    'Notes',
    'Checklist',
    'Timeline',
  ];

  const rows = jobs.map((job) => [
    job.id,
    formatDate(job.created_at),
    formatDate(job.updated_at),
    formatDate(job.applied_date),
    formatDate(job.follow_up_date),
    formatDate(job.interview_date),
    job.status,
    job.title,
    job.company,
    job.location,
    SOURCE_LABELS[job.source?.toLowerCase()] ?? job.source,
    job.salary,
    formatDate(job.deadline),
    job.url,
    job.notes,
    checklistText(job),
    timelineText(job),
  ]);

  return { headers, rows };
};

const exportCsv = (jobs: Job[], filename: string) => {
  const { headers, rows } = exportRows(jobs);
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n');
  downloadBlob(csv, 'text/csv;charset=utf-8', filename);
};

const exportExcel = (jobs: Job[], filename: string, title: string) => {
  const { headers, rows } = exportRows(jobs);
  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
          th { background: #0f5132; color: #fff; text-align: left; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
          caption { font-size: 18px; font-weight: bold; margin: 0 0 12px; text-align: left; }
        </style>
      </head>
      <body>
        <table>
          <caption>${escapeHtml(title)}</caption>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </body>
    </html>
  `;
  downloadBlob(html, 'application/vnd.ms-excel;charset=utf-8', filename);
};

const buildPrintableReport = (jobs: Job[], title: string, summary: Record<string, number | string>) => {
  const { headers, rows } = exportRows(jobs);
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { color: #111827; font-family: Arial, sans-serif; font-size: 11px; }
          h1 { font-size: 22px; margin: 0 0 4px; }
          p { margin: 0; }
          .muted { color: #6b7280; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
          .metric { border: 1px solid #d1d5db; padding: 8px; }
          .metric strong { display: block; font-size: 16px; margin-top: 4px; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #0f5132; color: white; text-align: left; }
          th, td { border: 1px solid #d1d5db; padding: 5px; vertical-align: top; }
          td:nth-child(14), th:nth-child(14) { max-width: 180px; word-break: break-word; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">Generated by afavers on ${formatDate(new Date().toISOString())}</p>
        <p class="muted">Use this as a personal job-search record. Confirm exact requirements with the relevant office before submission.</p>
        <section class="summary">
          ${Object.entries(summary).map(([label, value]) => `<div class="metric">${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`).join('')}
        </section>
        <table>
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </body>
    </html>
  `;
};

export const AnalyticsPage = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | Job['status']>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [officialOnly, setOfficialOnly] = useState(true);
  const { t, lang } = useLanguage();
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  useEffect(() => {
    jobsService.getAnalytics()
      .then(setData)
      .catch((err) => {
        console.error(err);
        setError(err?.response?.data?.error || err?.message || 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, []);

  const trackedJobs = data?.jobs ?? [];
  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    return trackedJobs.filter((job) => {
      if (officialOnly && !APPLICATION_STATUSES.has(job.status)) return false;
      if (statusFilter !== 'all' && job.status !== statusFilter) return false;
      if (!isWithinDateRange(getActivityDate(job), dateFrom, dateTo)) return false;
      if (!term) return true;
      return `${job.title} ${job.company} ${job.location} ${job.source} ${job.notes ?? ''}`.toLowerCase().includes(term);
    });
  }, [trackedJobs, officialOnly, statusFilter, dateFrom, dateTo, search]);

  const totals = useMemo(() => {
    const applied = filteredJobs.filter((job) => job.applied_date || APPLICATION_STATUSES.has(job.status)).length;
    const interviews = filteredJobs.filter((job) => job.status === 'interviewing' || job.interview_date).length;
    const followUps = filteredJobs.filter((job) => job.status === 'followup' || job.follow_up_date).length;
    const offers = filteredJobs.filter((job) => job.status === 'offered').length;
    const responseRate = applied > 0 ? Math.round(((interviews + offers) / applied) * 100) : 0;
    return { applied, interviews, followUps, offers, responseRate };
  }, [filteredJobs]);

  const handleExport = (format: 'csv' | 'excel' | 'pdf') => {
    setExporting(format);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const title = officialOnly ? 'afavers Job Search Report' : 'afavers Full Job Tracker';
    const fileBase = officialOnly ? `afavers-job-search-report-${dateStamp}` : `afavers-full-tracker-${dateStamp}`;

    try {
      if (filteredJobs.length === 0) {
        alert('No jobs match the current report filters.');
        return;
      }

      if (format === 'csv') exportCsv(filteredJobs, `${fileBase}.csv`);
      if (format === 'excel') exportExcel(filteredJobs, `${fileBase}.xls`, title);
      if (format === 'pdf') {
        const report = buildPrintableReport(filteredJobs, title, {
          'Jobs in report': filteredJobs.length,
          'Submitted applications': totals.applied,
          'Follow-ups planned/sent': totals.followUps,
          'Interviews / offers': `${totals.interviews} / ${totals.offers}`,
        });
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('Your browser blocked the PDF window. Allow pop-ups for afavers, then try again.');
          return;
        }
        // print() has to wait for layout. A fixed timer is a guess, and a long
        // report can still be blank when it fires; onload is the real signal.
        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
        printWindow.document.open();
        printWindow.document.write(report);
        printWindow.document.close();
      }
    } catch {
      alert(t('exportFailed'));
    } finally {
      setExporting(null);
    }
  };

  const maxSource = Math.max(...(data?.bySource.map(s => s.count) ?? [1]));
  const maxWeek = Math.max(...(data?.byWeek.map(w => w.count) ?? [1]));
  const maxStatus = Math.max(...(data?.byStatus.map(s => s.count) ?? [1]));
  const maxLocation = Math.max(...(data?.byLocation?.map(l => l.count) ?? [1]));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Export a clean job-search record for appointments, proof of applications, or your own spreadsheet.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleExport('pdf')}
              disabled={!!exporting}
              className="text-sm text-white bg-gray-900 hover:bg-gray-800 px-4 py-2 rounded-lg transition disabled:opacity-50 font-medium"
            >
              {exporting === 'pdf' ? t('exporting') : 'Export PDF'}
            </button>
            <button
              onClick={() => handleExport('excel')}
              disabled={!!exporting}
              className="text-sm text-green-700 hover:text-green-900 border border-green-300 hover:border-green-500 bg-green-50 hover:bg-green-100 px-4 py-2 rounded-lg transition disabled:opacity-50 font-medium"
            >
              {exporting === 'excel' ? t('exporting') : 'Export Excel'}
            </button>
            <button
              onClick={() => handleExport('csv')}
              disabled={!!exporting}
              className="text-sm text-blue-700 hover:text-blue-900 border border-blue-300 hover:border-blue-500 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition disabled:opacity-50 font-medium"
            >
              {exporting === 'csv' ? t('exporting') : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-300 rounded-xl p-6 text-center">
            <p className="text-red-700 font-semibold mb-1">{t('failedToLoadAnalytics')}</p>
            <p className="text-red-500 text-sm font-mono">{error}</p>
          </div>
        ) : (
          <>
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-green-700 font-semibold">Foreign office ready</p>
                  <h2 className="text-xl font-bold text-gray-900 mt-1">Job search proof packet</h2>
                  <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                    Keep applied jobs, follow-ups, interviews, notes, links, and timestamps in one place. Export only submitted applications for appointments, or include every tracked job when you want a full Excel replacement.
                  </p>
                </div>
                <label className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={officialOnly}
                    onChange={(event) => setOfficialOnly(event.target.checked)}
                    className="w-4 h-4 accent-green-600"
                  />
                  Only submitted applications
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, company, location..."
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | Job['status'])}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                >
                  <option value="all">All statuses</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{t(status)}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  aria-label="From date"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  aria-label="To date"
                />
              </div>
            </section>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Jobs in report', value: filteredJobs.length, color: 'text-gray-900', bg: 'bg-white border-gray-200' },
                { label: 'Applications', value: totals.applied, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
                { label: 'Follow-ups', value: totals.followUps, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
                { label: 'Interviews', value: totals.interviews, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
                { label: 'Response rate', value: `${totals.responseRate}%`, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
              ].map(card => (
                <div key={card.label} className={`rounded-xl border ${card.bg} p-4`}>
                  <p className={`text-xs font-medium ${card.color}`}>{card.label}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
                </div>
              ))}
            </div>

            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-gray-900">Spreadsheet tracker</h2>
                  <p className="text-sm text-gray-500">Everything important from your job search, without maintaining a separate Excel sheet.</p>
                </div>
                <span className="text-xs font-semibold text-gray-500">{filteredJobs.length} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Job</th>
                      <th className="text-left px-4 py-3">Company</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-left px-4 py-3">Follow-up</th>
                      <th className="text-left px-4 py-3">Interview</th>
                      <th className="text-left px-4 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredJobs.slice(0, 15).map((job) => (
                      <tr key={job.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(job.applied_date ?? job.created_at)}</td>
                        <td className="px-4 py-3 min-w-56">
                          <button onClick={() => navigate(`/jobs/${job.id}`)} className="font-semibold text-gray-900 hover:text-green-700 text-left">
                            {job.title}
                          </button>
                          <p className="text-xs text-gray-500 truncate max-w-72">{job.location}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{job.company}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium capitalize">
                            {t(job.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(job.follow_up_date) || '-'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(job.interview_date) || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-72 truncate">{job.notes || checklistText(job) || '-'}</td>
                      </tr>
                    ))}
                    {filteredJobs.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-gray-400">No jobs match these filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredJobs.length > 15 && (
                <div className="px-5 py-3 bg-gray-50 text-xs text-gray-500">
                  Showing 15 rows here. Exports include all {filteredJobs.length} matching rows.
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{t('applicationsPerWeek')}</h2>
                {data?.byWeek.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('noApplicationData')}</p>
                ) : (
                  <div className="space-y-3">
                    {data?.byWeek.slice(0, 10).map(w => (
                      <div key={w.week} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-24 shrink-0">
                          {new Date(w.week).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                        </span>
                        <Bar value={w.count} max={maxWeek} color="bg-green-400" />
                        <span className="text-sm font-semibold text-gray-700 w-6 text-right">{w.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{t('jobsBySource')}</h2>
                <div className="space-y-3">
                  {data?.bySource.map(s => (
                    <div key={s.source} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-28 shrink-0">
                        {SOURCE_LABELS[s.source.toLowerCase()] ?? s.source}
                      </span>
                      <Bar value={s.count} max={maxSource} color="bg-blue-400" />
                      <span className="text-sm font-semibold text-gray-700 w-10 text-right">{s.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(data?.byLocation?.length ?? 0) > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Jobs by Region</h2>
                <div className="flex flex-col lg:flex-row gap-6 items-start">
                  <div className="flex-1 min-w-0">
                    <GermanyJobMap
                      byLocation={data!.byLocation}
                      onCityClick={loc => navigate(`/jobs?search=${encodeURIComponent(loc.split(/[,/(]/)[0].trim())}`)}
                    />
                  </div>
                  <div className="w-full lg:w-48 space-y-2.5 shrink-0">
                    {data!.byLocation.slice(0, 10).map(loc => (
                      <div key={loc.location} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-28 truncate shrink-0">{loc.location}</span>
                        <Bar value={loc.count} max={maxLocation} color="bg-green-400" />
                        <span className="text-xs font-semibold text-gray-700 w-8 text-right shrink-0">{loc.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{t('statusBreakdown')}</h2>
              <div className="space-y-3">
                {data?.byStatus
                  .sort((a, b) => b.count - a.count)
                  .map(s => (
                    <div key={s.status} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-24 shrink-0 capitalize">{t(s.status)}</span>
                      <Bar value={s.count} max={maxStatus} color={STATUS_COLORS[s.status] ?? 'bg-gray-400'} />
                      <span className="text-sm font-semibold text-gray-700 w-10 text-right">{s.count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
