import { adminClient } from '../_shared/jobs.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

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

interface UserRow {
  id: number;
  email: string;
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
}

interface ScoredJob extends JobRow {
  score: number;
  reasons: string[];
}

const REMOTE_TERMS = ['remote', 'homeoffice', 'home office', 'hybrid', 'mobiles arbeiten'];
const STUDENT_TERMS = ['werkstudent', 'working student', 'studentische', 'student assistant', 'praktikum', 'internship'];
const SENIOR_TERMS = ['senior', 'lead', 'leiter', 'leitung', 'principal', 'head of'];

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

function splitTerms(value: string): string[] {
  return value
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
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
  const keywords = splitTerms(alert.keywords);
  const locations = splitTerms(alert.locations);
  const text = `${job.title} ${job.company ?? ''} ${job.location ?? ''} ${job.description ?? ''}`.toLowerCase();
  const jobLocation = (job.location ?? '').toLowerCase();
  const reasons: string[] = [];
  let score = 20;

  const keywordHits = keywords.filter((term) => text.includes(term));
  if (keywordHits.length > 0) {
    score += Math.min(40, keywordHits.length * 14);
    reasons.push(`Keyword: ${keywordHits.slice(0, 3).join(', ')}`);
  }

  const locationHits = locations.filter((term) => jobLocation.includes(term) || (term === 'nrw' && /nrw|nordrhein|düsseldorf|duesseldorf|köln|koeln|essen|dortmund|bochum|bonn|wuppertal|duisburg|münster|muenster/.test(jobLocation)));
  if (locationHits.length > 0) {
    score += 22;
    reasons.push(`Location: ${locationHits[0]}`);
  } else if (containsAny(text, REMOTE_TERMS)) {
    score += 10;
    reasons.push('Remote-friendly');
  }

  if (containsAny(text, STUDENT_TERMS)) {
    score += 12;
    reasons.push('Werkstudent');
  }

  if (job.language === 'en') {
    score += 8;
    reasons.push('English-friendly');
  }

  if (job.posted_date) {
    const ageDays = Math.floor((Date.now() - new Date(job.posted_date).getTime()) / 86400000);
    if (ageDays <= 7) {
      score += 10;
      reasons.push('Fresh');
    } else if (ageDays <= 30) {
      score += 5;
    }
  }

  if (containsAny(text, SENIOR_TERMS) && keywords.some((term) => ['junior', 'entry', 'werkstudent', 'praktikum', 'internship'].includes(term))) {
    score -= 10;
  }

  return {
    ...job,
    score: Math.max(0, Math.min(100, score)),
    reasons: reasons.slice(0, 5),
  };
}

function shouldSkipForFrequency(alert: JobAlert): boolean {
  if (alert.frequency !== 'daily' || !alert.last_sent_at) return false;
  return Date.now() - new Date(alert.last_sent_at).getTime() < 23 * 60 * 60 * 1000;
}

function buildEmail(alert: JobAlert, jobs: ScoredJob[]) {
  const preview = jobs.slice(0, 10);
  const title = preview.length === 1
    ? `1 high-priority job matched your Afavers alert`
    : `${preview.length} high-priority jobs matched your Afavers alert`;
  const appUrl = env('APP_URL') || env('SITE_URL') || 'https://afavers.online';

  const rows = preview.map((job) => {
    const company = escapeHtml(job.company || 'Company not listed');
    const location = escapeHtml(job.location || 'Location not listed');
    const salary = job.salary ? `<p style="margin:6px 0 0;color:#047857;font-weight:700;">${escapeHtml(job.salary)}</p>` : '';
    const reasons = job.reasons.length
      ? `<p style="margin:8px 0 0;color:#475569;font-size:13px;">${escapeHtml(job.reasons.join(' - '))}</p>`
      : '';
    const href = job.url || `${appUrl}/jobs/${job.id}`;

    return `
      <tr>
        <td style="padding:18px 0;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 6px;color:#0f172a;font-size:16px;font-weight:800;line-height:1.35;">${escapeHtml(job.title)}</p>
          <p style="margin:0;color:#334155;font-size:14px;">${company} - ${location}</p>
          ${salary}
          ${reasons}
          <p style="margin:12px 0 0;">
            <a href="${escapeHtml(href)}" style="color:#2563eb;font-weight:700;text-decoration:none;">Open job &rarr;</a>
            <span style="color:#94a3b8;font-size:13px;"> ${job.score}% match</span>
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

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const from = env('ALERT_EMAIL_FROM') || 'Afavers <notifications@afavers.online>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email send failed (${response.status}): ${body.slice(0, 300)}`);
  }
}

async function getCandidateJobsForAlert(
  supabase: ReturnType<typeof adminClient>,
  alert: JobAlert,
  since: string,
): Promise<JobRow[]> {
  const filters = [
    ...splitTerms(alert.keywords).slice(0, 6).flatMap((term) => [`title.ilike.%${term}%`, `description.ilike.%${term}%`]),
    ...splitTerms(alert.locations).slice(0, 4).map((term) => `location.ilike.%${term}%`),
  ];

  let query = supabase
    .from('jobs')
    .select('id,title,company,location,description,url,source,posted_date,salary,language,created_at')
    .eq('is_hidden', false)
    .is('owner_user_id', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(150);

  if (filters.length) {
    query = query.or(filters.join(','));
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as JobRow[];
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return jsonResponse({ error: 'CRON_SECRET is not configured' }, 401, req);
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401, req);
  }

  const supabase = adminClient();
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: alerts, error: alertsError } = await supabase
      .from('job_alerts')
      .select('id,user_id,name,keywords,locations,min_score,frequency,last_sent_at')
      .eq('enabled', true);
    if (alertsError) throw alertsError;

    const activeAlerts = (alerts ?? []).filter((alert: JobAlert) => !shouldSkipForFrequency(alert));
    if (!activeAlerts.length) {
      return jsonResponse({ success: true, checked: 0, sent: 0, matches: 0 }, 200, req);
    }

    const userIds = [...new Set(activeAlerts.map((alert: JobAlert) => alert.user_id))];
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id,email')
      .in('id', userIds);
    if (usersError) throw usersError;
    const usersById = new Map((users ?? []).map((user: UserRow) => [user.id, user]));

    let sent = 0;
    let matches = 0;
    const errors: string[] = [];

    for (const alert of activeAlerts as JobAlert[]) {
      const user = usersById.get(alert.user_id);
      if (!user?.email) continue;

      const scored = (await getCandidateJobsForAlert(supabase, alert, since))
        .map((job) => scoreJob(job, alert))
        .filter((job) => job.score >= alert.min_score)
        .sort((a, b) => b.score - a.score || Date.parse(b.created_at) - Date.parse(a.created_at))
        .slice(0, 20);
      if (!scored.length) {
        await supabase.from('job_alerts').update({ last_sent_at: now.toISOString() }).eq('id', alert.id);
        continue;
      }

      const jobIds = scored.map((job) => job.id);
      const [{ data: deliveries, error: deliveriesError }, { data: overlays, error: overlaysError }] = await Promise.all([
        supabase.from('job_alert_deliveries').select('job_id').eq('alert_id', alert.id).in('job_id', jobIds),
        supabase.from('user_jobs').select('job_id,status,is_hidden').eq('user_id', alert.user_id).in('job_id', jobIds),
      ]);
      if (deliveriesError) throw deliveriesError;
      if (overlaysError) throw overlaysError;

      const delivered = new Set((deliveries ?? []).map((row: { job_id: number }) => row.job_id));
      const touched = new Set((overlays ?? [])
        .filter((row: { status: string | null; is_hidden: boolean | null }) => row.is_hidden || (row.status && row.status !== 'new'))
        .map((row: { job_id: number }) => row.job_id));
      const freshMatches = scored.filter((job) => !delivered.has(job.id) && !touched.has(job.id)).slice(0, 10);
      if (!freshMatches.length) {
        await supabase.from('job_alerts').update({ last_sent_at: now.toISOString() }).eq('id', alert.id);
        continue;
      }

      const email = buildEmail(alert, freshMatches);
      try {
        await sendEmail(user.email, email.subject, email.html);
        const { error: insertError } = await supabase.from('job_alert_deliveries').insert(
          freshMatches.map((job) => ({ alert_id: alert.id, user_id: alert.user_id, job_id: job.id, sent_at: now.toISOString() })),
        );
        if (insertError) throw insertError;
        await supabase.from('job_alerts').update({ last_sent_at: now.toISOString() }).eq('id', alert.id);
        sent += 1;
        matches += freshMatches.length;
      } catch (error) {
        errors.push(`user_id=${alert.user_id}: ${error instanceof Error ? error.message : 'Unknown email error'}`);
      }
    }

    return jsonResponse({
      success: errors.length === 0,
      checked: activeAlerts.length,
      sent,
      matches,
      errors: errors.slice(0, 5),
    }, errors.length ? 207 : 200, req);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Job alert run failed' }, 500, req);
  }
});
