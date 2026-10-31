import { adminClient } from './jobs.ts';
import { beginAutomationRun, finishAutomationRun } from './automation-runs.ts';
import { freshAlertMatches, type DeliveredListing } from './alert-matches.ts';
import { alertDeliveryFailure } from './alert-delivery.ts';
import { jsonResponse } from './cors.ts';
import { keywordMatches, matchesJobLocation, isRemoteListing, splitMatchTerms } from './matching.ts';

interface Alert { id: number; user_id: number; name: string; keywords: string; locations: string; min_score: number; frequency: 'instant' | 'daily'; last_sent_at: string | null }
interface Listing { id: number; title: string; company: string | null; location: string | null; description: string | null; url: string | null; source: string | null; posted_date: string | null; salary: string | null; language: string | null; created_at: string; deadline: string | null }
interface Scored extends Listing { score: number; reasons: string[] }
interface Batch { id: string; job_ids: number[]; to_email: string; subject: string; html: string; status: string; attempts: number; blocked?: boolean; reason?: string }
type Operations = { scoreJob: (job: Listing, alert: Alert) => Scored; buildEmail: (alert: Alert, jobs: Scored[]) => { subject: string; html: string }; sendEmail: (to: string, subject: string, html: string, batchId: string) => Promise<void>; shouldSkip: (alert: Alert) => boolean };

/** Called only after the route's existing cron-secret authorization succeeds. */
export async function runJobAlerts(req: Request, operations: Operations): Promise<Response> {
  const supabase = adminClient();
  const started = Date.now(), deadline = started + 115_000;
  const since = new Date(started - 7 * 86400_000).toISOString();
  let runId: string | null = null;
  let checked = 0, sent = 0, matches = 0, deferred = 0, uncertain = 0, cancelled = 0;
  const errors: string[] = [];
  try {
    runId = await beginAutomationRun('job-alerts', req.headers.get('x-afavers-verification') === '1' ? 'verification' : 'cron');
    if (!runId) return jsonResponse({ success: false, code: 'alerts_running', error: 'An alert run is already active.' }, 409, req);
    const { data: alerts, error: alertsError, count } = await supabase.from('job_alerts')
      .select('id,user_id,name,keywords,locations,min_score,frequency,last_sent_at', { count: 'exact' })
      .eq('enabled', true).or('frequency.eq.instant,last_sent_at.is.null,last_sent_at.lte.' + new Date(started - 23 * 3600_000).toISOString())
      .order('last_checked_at', { ascending: true, nullsFirst: true }).limit(100);
    if (alertsError) throw new Error('alert_read_failed');
    const active = ((alerts ?? []) as Alert[]).filter(alert => !operations.shouldSkip(alert));
    let capped = (count ?? 0) > 100;
    if (!active.length) {
      await finishAutomationRun(runId, capped ? 'partial' : 'succeeded', [], { checked, sent, matches, deferred, uncertain });
      return jsonResponse({ success: !capped, run_id: runId, checked, sent, matches, capped }, capped ? 207 : 200, req);
    }
    const userIds = [...new Set(active.map(alert => alert.user_id))];
    const { data: users, error: usersError } = await supabase.from('users').select('id,email').in('id', userIds);
    if (usersError) throw new Error('recipient_read_failed');
    const usersById = new Map<number, { id: number; email: string }>((users ?? []).map((user: { id: number; email: string }) => [user.id, user] as const));
    const jobs: Listing[] = [];
    for (let from = 0; from < 5000; from += 500) {
      if (Date.now() >= deadline) { capped = true; break; }
      const { data, error } = await supabase.from('jobs')
        .select('id,title,company,location,description,url,source,posted_date,salary,language,created_at,deadline')
        .eq('is_hidden', false).is('owner_user_id', null).eq('is_manual', false).eq('is_active', true)
        .gte('created_at', since).order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + 499);
      if (error) throw new Error('candidate_read_failed');
      jobs.push(...(data ?? []) as Listing[]);
      if ((data ?? []).length < 500) break;
      if (from === 4500) capped = true;
    }
    for (const alert of active) {
      if (Date.now() >= deadline) { deferred += active.length - checked; break; }
      checked++;
      try {
        const user = usersById.get(alert.user_id);
        if (!user?.email) { errors.push('recipient_unavailable'); continue; }
        const keywords = splitMatchTerms(alert.keywords), locations = splitMatchTerms(alert.locations);
        const scored = jobs.map(job => operations.scoreJob(job, alert)).filter(job =>
          job.score >= alert.min_score && (!keywords.length || keywordMatches(`${job.title} ${job.company ?? ''} ${job.description ?? ''}`, keywords).length > 0)
          && (!locations.length || locations.some(term => matchesJobLocation(job.location, term)) || isRemoteListing(job)))
          .sort((a, b) => b.score - a.score || Date.parse(b.created_at) - Date.parse(a.created_at));
        const deliveries: DeliveredListing[] = [];
        for (let from = 0; ; from += 1000) {
          if (Date.now() >= deadline) throw new Error('alert_budget_exhausted');
          const { data, error } = await supabase.from('job_alert_deliveries').select('job_id,jobs(id,title,company,location,url)')
            .eq('alert_id', alert.id).gte('sent_at', since).order('id').range(from, from + 999);
          if (error) throw new Error('delivery_history_unavailable');
          deliveries.push(...(data ?? []) as unknown as DeliveredListing[]);
          if ((data ?? []).length < 1000) break;
        }
        const touched = new Set<number>();
        for (let from = 0; from < scored.length; from += 150) {
          if (Date.now() >= deadline) throw new Error('alert_budget_exhausted');
          const ids = scored.slice(from, from + 150).map(job => job.id);
          const [personal, prior] = await Promise.all([
            supabase.from('user_jobs').select('job_id,status,is_hidden').eq('user_id', alert.user_id).in('job_id', ids),
            supabase.from('job_alert_deliveries').select('job_id').eq('alert_id', alert.id).in('job_id', ids),
          ]);
          if (personal.error || prior.error) throw new Error('delivery_history_unavailable');
          for (const row of personal.data ?? []) if (row.is_hidden || (row.status && row.status !== 'new')) touched.add(row.job_id);
          deliveries.push(...(prior.data ?? []));
        }
        const eligible = freshAlertMatches(scored, deliveries, touched, Number.MAX_SAFE_INTEGER), fresh = eligible.slice(0, 10);
        const email = operations.buildEmail(alert, fresh);
        const { data, error } = await supabase.rpc('claim_job_alert_batch', { p_alert_id: alert.id, p_user_id: alert.user_id, p_job_ids: fresh.map(job => job.id), p_to_email: user.email, p_subject: email.subject, p_html: email.html, p_configuration: { keywords: alert.keywords, locations: alert.locations, min_score: alert.min_score, frequency: alert.frequency } });
        if (error) throw new Error('delivery_claim_failed');
        const batch = data as Batch;
        if (batch.blocked) {
          if (batch.reason === 'no_candidates') continue;
          if (batch.reason === 'configuration_changed' || batch.reason === 'recipient_changed' || batch.reason === 'alert_unavailable') { cancelled++; continue; }
          deferred++;
          if (batch.reason === 'delivery_uncertain') uncertain++;
          if (batch.reason !== 'retry_pending' && batch.reason !== 'delivery_running') errors.push(batch.reason || 'delivery_blocked');
          continue;
        }
        if (batch.status !== 'accepted') {
          const eligibleIds = new Set(eligible.map(job => job.id));
          if (!batch.job_ids.every(id => eligibleIds.has(id))) {
            const { error } = await supabase.from('job_alert_batches').update({ status: 'cancelled', updated_at: new Date().toISOString(), error_code: 'candidates_changed' }).eq('id', batch.id).eq('status', 'sending');
            if (error) throw new Error('delivery_cancel_failed');
            cancelled++; continue;
          }
          try { await operations.sendEmail(batch.to_email, batch.subject, batch.html, batch.id); }
          catch (sendError) {
            const failure = alertDeliveryFailure(sendError, batch.attempts);
            const { error } = await supabase.from('job_alert_batches').update({ ...failure, updated_at: new Date().toISOString() }).eq('id', batch.id).eq('status', 'sending');
            if (error) throw new Error('delivery_state_unavailable');
            if (failure.status === 'uncertain') uncertain++;
            errors.push(failure.error_code); continue;
          }
          const { error: acceptanceError } = await supabase.from('job_alert_batches').update({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', batch.id).eq('status', 'sending');
          if (acceptanceError) throw new Error('delivery_receipt_pending');
        }
        // Acceptance and history are separate: this transaction is safe to retry,
        // while the SMTP handoff is never repeated after known acceptance.
        const { data: finalized, error: finalizeError } = await supabase.rpc('finalize_job_alert_batch', { p_batch_id: batch.id });
        if (finalizeError || finalized !== true) throw new Error('delivery_receipt_pending');
        sent++; matches += batch.job_ids.length;
      } catch (error) {
        const code = error instanceof Error && /^[a-z_]{3,60}$/.test(error.message) ? error.message : 'alert_processing_failed';
        errors.push(code);
      } finally {
        const { error } = await supabase.from('job_alerts').update({ last_checked_at: new Date().toISOString() }).eq('id', alert.id);
        if (error) errors.push('alert_check_unrecorded');
      }
    }
    const partial = capped || deferred > 0 || errors.length > 0;
    await finishAutomationRun(runId, partial ? (errors.length && !sent && !deferred && !capped ? 'failed' : 'partial') : 'succeeded', [], { checked, sent, matches, deferred, uncertain, cancelled, candidates: jobs.length, capped }, errors.length ? [...new Set(errors)].slice(0, 3).join(',').slice(0, 80) : null);
    return jsonResponse({ success: !partial, run_id: runId, checked, sent, matches, deferred, uncertain, capped, errors: [...new Set(errors)].slice(0, 5) }, partial ? 207 : 200, req);
  } catch (error) {
    const code = error instanceof Error && /^[a-z_]{3,60}$/.test(error.message) ? error.message : 'alert_run_failed';
    if (runId) {
      try { await finishAutomationRun(runId, 'failed', [], { checked, sent, matches, deferred, uncertain }, code); }
      catch { console.error('Alert outcome could not be recorded; the lease will expire.'); }
    }
    return jsonResponse({ success: false, error: 'The alert run could not finish.', code, run_id: runId }, 500, req);
  }
}
