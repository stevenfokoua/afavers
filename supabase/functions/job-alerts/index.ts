import { listingLimitations, scoreListing, splitMatchTerms } from '../_shared/matching.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { sendSmtpEmail } from '../_shared/smtp.ts';
import { runJobAlerts } from '../_shared/job-alert-runner.ts';
import { alertMessageId } from '../_shared/alert-delivery.ts';

type Frequency = 'instant' | 'daily';

interface JobAlert {
  id: number;
  user_id: number;
  name: string;
  keywords: string;
  locations: string;
  min_score: number;
  frequency: Frequency;
  last_sent_at: string | null;
}

interface JobRow {
  id: number;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  url: string | null;
  source: string | null;
  posted_date: string | null;
  salary: string | null;
  language: string | null;
  created_at: string;
  deadline: string | null;
}

interface ScoredJob extends JobRow {
  score: number;
  reasons: string[];
}

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function scoreJob(job: JobRow, alert: JobAlert): ScoredJob {
  const match = scoreListing(job, splitMatchTerms(alert.keywords), splitMatchTerms(alert.locations));
  return { ...job, score: match.score, reasons: match.reasons };
}

function shouldSkipForFrequency(alert: JobAlert): boolean {
  if (alert.frequency !== 'daily' || !alert.last_sent_at) return false;
  return Date.now() - new Date(alert.last_sent_at).getTime() < 23 * 60 * 60 * 1000;
}

function buildEmail(alert: JobAlert, jobs: ScoredJob[]) {
  const preview = jobs.slice(0, 10);
  const title = preview.length === 1
    ? `1 job listing matched your Afavers alert`
    : `${preview.length} job listings matched your Afavers alert`;
  const appUrl = env('APP_URL') || env('SITE_URL') || 'https://afavers.online';

  const rows = preview.map((job) => {
    const company = escapeHtml(job.company || 'Company not listed');
    const location = escapeHtml(job.location || 'Location not listed');
    const salary = job.salary ? `<p style="margin:6px 0 0;color:#047857;font-weight:700;">${escapeHtml(job.salary)}</p>` : '';
    const reasons = job.reasons.length
      ? `<p style="margin:8px 0 0;color:#475569;font-size:13px;">${escapeHtml(job.reasons.join(' - '))}</p>`
      : '';
    const href = job.url || `${appUrl}/jobs/${job.id}`;
    const limitations = listingLimitations(job);
    const evidence = limitations.length ? `<p style="margin:8px 0 0;color:#475569;font-size:13px;">${limitations.includes('requirements_unavailable') ? 'Requirements are unavailable in this feed. Check the original listing. ' : ''}${limitations.includes('working_language_unknown') ? 'Working language is unconfirmed.' : ''}</p>` : '';

    return `
      <tr>
        <td style="padding:18px 0;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 6px;color:#0f172a;font-size:16px;font-weight:800;line-height:1.35;">${escapeHtml(job.title)}</p>
          <p style="margin:0;color:#334155;font-size:14px;">${company} - ${location}</p>
          ${salary}
          ${reasons}
          ${evidence}
          <p style="margin:12px 0 0;">
            <a href="${escapeHtml(href)}" style="color:#2563eb;font-weight:700;text-decoration:none;">Open job &rarr;</a>
            <span style="color:#94a3b8;font-size:13px;"> ${job.score}/100 listing relevance</span>
          </p>
        </td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#0f172a;">
      <p style="margin:0 0 8px;color:#f97316;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;">Afavers priority alert</p>
      <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
        These matched what you are currently looking for: ${escapeHtml(alert.keywords || 'your saved keywords')} in ${escapeHtml(alert.locations || 'your saved locations')}.
        Relevance compares listing terms and location; it does not establish that you meet the requirements.
      </p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows}</table>
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(`${appUrl}/jobs`)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 16px;font-weight:800;">Review jobs in Afavers</a>
      </p>
      <p style="margin:22px 0 0;color:#64748b;font-size:12px;line-height:1.5;">
        You can change or turn off priority email alerts in Afavers settings.
      </p>
    </div>
  `;

  return { subject: title, html };
}

async function sendEmail(to: string, subject: string, html: string, batchId: string) {
  if (env('SMTP_HOST')) return sendSmtpEmail(to, subject, html, { messageId: alertMessageId(batchId) });
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const from = env('ALERT_EMAIL_FROM') || 'Afavers <notifications@afavers.online>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': batchId,
    },
    body: JSON.stringify({ from, to, subject, html }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw Object.assign(new Error('Email delivery rejected'), { uncertain: false, retryable: response.status === 429 || response.status >= 500 });
  }
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) return jsonResponse({ error: 'CRON_SECRET is not configured' }, 401, req);
  if (req.headers.get('x-cron-secret') !== cronSecret) return jsonResponse({ error: 'Unauthorized' }, 401, req);
  return runJobAlerts(req, { scoreJob, buildEmail, sendEmail, shouldSkip: shouldSkipForFrequency });
});
