export function alertDeliveryFailure(error: unknown, attempts: number, now = Date.now()): { status: 'retryable' | 'failed' | 'uncertain'; next_attempt_at: string | null; error_code: string } {
  const info = error && typeof error === 'object' ? error as { uncertain?: unknown; retryable?: unknown } : {};
  if (info.uncertain !== false) return { status: 'uncertain', next_attempt_at: null, error_code: 'delivery_uncertain' };
  if (info.retryable === true && attempts < 3) return { status: 'retryable', next_attempt_at: new Date(now + Math.min(60, 5 * 3 ** (attempts - 1)) * 60_000).toISOString(), error_code: 'delivery_retry_pending' };
  return { status: 'failed', next_attempt_at: null, error_code: 'delivery_rejected' };
}

export function alertMessageId(batchId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) throw new Error('Invalid alert batch');
  return `job-alert.${batchId}@afavers.saintcreators.com`;
}
