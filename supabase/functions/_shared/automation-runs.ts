import { adminClient } from './jobs.ts';
import type { SourceReport } from './source-fetch.ts';

export type AutomationTask = 'fetch-jobs' | 'job-alerts' | 'send-reminders';
export async function beginAutomationRun(task: AutomationTask, trigger: 'cron' | 'manual' | 'verification' = 'cron', leaseSeconds = 180): Promise<string | null> {
  const { data, error } = await adminClient().rpc('begin_automation_run', { p_task: task, p_trigger: trigger, p_lease_seconds: leaseSeconds }).abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error('automation_lease_unavailable');
  if (!data?.acquired) return null;
  if (typeof data.run_id !== 'string') throw new Error('automation_lease_invalid');
  return data.run_id;
}

export async function finishAutomationRun(id: string, status: 'succeeded' | 'partial' | 'failed', sources: SourceReport[] = [], counts: Record<string, number | boolean> = {}, errorCode: string | null = null): Promise<void> {
  const { data, error } = await adminClient().rpc('finish_automation_run', { p_run_id: id, p_status: status, p_sources: sources, p_counts: counts, p_error_code: errorCode }).abortSignal(AbortSignal.timeout(5000));
  if (error || data !== true) throw new Error('automation_outcome_not_recorded');
}
