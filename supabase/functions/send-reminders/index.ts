import { adminClient } from '../_shared/jobs.ts';
import { beginAutomationRun, finishAutomationRun } from '../_shared/automation-runs.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { sendSmtpEmail, SmtpDeliveryError } from '../_shared/smtp.ts';

interface Claim { delivery_id: string; user_id: number; item_id: string; generation: string; email: string }
const html = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

Deno.serve(async req => {
  const options = handleOptions(req); if (options) return options;
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return jsonResponse({ error: 'Unauthorized' }, 401, req);
  if (req.method !== 'POST') return jsonResponse({ error: 'Use POST' }, 405, req);
  let run: string | null = null;
  const counts = { claimed: 0, sent: 0, retry: 0, failed: 0, uncertain: 0, cancelled: 0 };
  try {
    const trigger = req.headers.get('x-afavers-verification') === '1' ? 'verification' : 'cron';
    run = await beginAutomationRun('send-reminders', trigger, 180);
    if (!run) return jsonResponse({ success: true, skipped: 'already_running' }, 200, req);
    const db = adminClient();
    const { data, error } = await db.rpc('claim_due_reminders', { p_limit: 3 }).abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error('reminder_claim_failed');
    const claims = (data ?? []) as Claim[]; counts.claimed = claims.length;
    for (const claim of claims) {
      let state: 'sent' | 'retry' | 'failed' | 'uncertain' | 'cancelled' = 'cancelled';
      let errorCode: string | null = null;
      // Recheck consent/completion/deletion after claim and immediately before SMTP.
      // Cancellation cannot recall a message already accepted by an SMTP server.
      const { data: item, error: readError } = await db.from('account_items').select('data,deleted,reminder_generation,email_due_at,email_armed_at').eq('user_id',claim.user_id).eq('collection','reminders').eq('item_id',claim.item_id).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if (readError) { state = 'retry'; errorCode = 'reminder_recheck_failed'; }
      else if (item && !item.deleted && item.reminder_generation === claim.generation && item.data?.emailEnabled === true && item.data?.completed !== true && item.email_due_at && new Date(item.email_due_at).getTime() >= new Date(item.email_armed_at).getTime()) {
        const body = item.data;
        const appUrl = (Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || 'https://afavers.saintcreators.com').replace(/\/$/,'');
        const subject = `Afavers reminder: ${String(body.title).slice(0,180)}`;
        const content = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#181b1f;padding:24px"><h1 style="font-size:22px">${html(String(body.title))}</h1><p>${html(String(body.date))} · ${html(String(body.time))} (${html(String(body.timezone || 'UTC'))})</p>${body.notes ? `<p>${html(String(body.notes))}</p>` : ''}<p><a href="${html(appUrl+'/reminders')}">Open your reminders</a></p><p style="font-size:12px;color:#58616c">You enabled email for this reminder. Complete, edit or delete it in Afavers to change future delivery.</p></div>`;
        try {
          await sendSmtpEmail(claim.email, subject, content, { messageId: `afavers-reminder-${claim.delivery_id}@saintcreators.com` }); state = 'sent';
        } catch (failure) {
          state = failure instanceof SmtpDeliveryError ? failure.uncertain ? 'uncertain' : failure.retryable ? 'retry' : 'failed' : 'uncertain';
          errorCode = state === 'uncertain' ? 'smtp_acceptance_unknown' : state === 'retry' ? 'smtp_temporary_failure' : 'smtp_delivery_rejected';
        }
      }
      const { data: saved, error: saveError } = await db.rpc('finish_reminder_delivery', { p_delivery_id: claim.delivery_id, p_state: state, p_error_code: errorCode }).abortSignal(AbortSignal.timeout(5000));
      if (saveError || saved !== true) throw new Error('reminder_outcome_not_recorded');
      counts[state]++;
    }
    const degraded = counts.retry + counts.failed + counts.uncertain > 0;
    await finishAutomationRun(run, degraded ? 'partial' : 'succeeded', [], counts, degraded ? 'reminder_delivery_incomplete' : null);
    return jsonResponse({ success: true, ...counts },200,req);
  } catch (error) {
    const code = error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : 'reminder_worker_failed';
    if (run) await finishAutomationRun(run,'failed',[],counts,code).catch(() => {});
    return jsonResponse({ success: false, error: code },500,req);
  }
});
