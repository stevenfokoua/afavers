import { describe, expect, it } from 'vitest';
import { alertDeliveryFailure, alertMessageId } from '../../../supabase/functions/_shared/alert-delivery';

describe('durable alert delivery policy', () => {
  it('retries only a definite transient rejection with a bounded delay', () => {
    const result = alertDeliveryFailure({ uncertain: false, retryable: true }, 1, 0);
    expect(result).toEqual({ status: 'retryable', next_attempt_at: '1970-01-01T00:05:00.000Z', error_code: 'delivery_retry_pending' });
    expect(alertDeliveryFailure({ uncertain: false, retryable: true }, 3, 0).status).toBe('failed');
  });
  it('does not automatically resend an ambiguous handoff or an unclassified failure', () => {
    expect(alertDeliveryFailure({ uncertain: true, retryable: true }, 1).status).toBe('uncertain');
    expect(alertDeliveryFailure(new Error('raw server details'), 1)).toEqual({ status: 'uncertain', next_attempt_at: null, error_code: 'delivery_uncertain' });
  });
  it('holds permanent address/recipient rejections without retrying', () => {
    expect(alertDeliveryFailure({ uncertain: false, retryable: false }, 1).status).toBe('failed');
  });
  it('keeps one stable, header-safe identifier for every batch retry', () => {
    const id = 'a0691c0e-51ef-41c1-972b-43e7e4609d2d';
    expect(alertMessageId(id)).toBe(alertMessageId(id));
    expect(alertMessageId(id)).toMatch(/^[a-z0-9.-]+@afavers\.saintcreators\.com$/);
    expect(() => alertMessageId('bad\r\nBcc: test@example.com')).toThrow();
  });
});
