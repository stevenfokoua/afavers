import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: { id: 1 } }));
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: mocks.user }) } }));
import { describeFeedHealth, feedHealthService, type FeedHealth } from './feedHealth.service';

const now = Date.parse('2026-10-31T12:00:00Z');
const health = (status: 'succeeded' | 'partial' | 'failed' | 'timed_out' | 'running' = 'succeeded'): FeedHealth => ({ checked_at: '2026-10-31T12:00:00Z', expected_interval_minutes: 120, last_successful_at: '2026-10-31T10:00:00Z', last_usable_at: '2026-10-31T10:00:00Z', latest: { id: 'test', status, started_at: '2026-10-31T10:00:00Z', finished_at: '2026-10-31T10:01:00Z', sources: [], counts: {}, error_code: null }, alerts: null });
describe('feed health is independent of listing writes', () => {
  it('shows unavailable initial telemetry honestly', () => {
    expect(describeFeedHealth({ ...health(), latest: null }, false, now).state).toBe('unknown');
  });
  it('distinguishes partial source coverage, worker failure and a running refresh', () => {
    expect(describeFeedHealth(health('partial'), false, now).message).toContain('incomplete');
    expect(describeFeedHealth(health('failed'), false, now).state).toBe('warning');
    expect(describeFeedHealth(health('timed_out'), true, now).message).toContain('nicht abgeschlossen');
    expect(describeFeedHealth(health('running'), false, now).message).toContain('fetched now');
  });
  it('warns when usable results are old without mistaking fresh partial results for a full refresh', () => {
    expect(describeFeedHealth({ ...health(), last_usable_at: '2026-10-31T00:00:00Z' }, false, now).message).toContain('out of date');
    expect(describeFeedHealth({ ...health('partial'), last_successful_at: '2026-10-01T00:00:00Z' }, false, now).message).toContain('incomplete');
  });
  it('coalesces navigation reads, supports explicit refresh and retries failed reads', async () => {
    mocks.rpc.mockResolvedValue({ data: health(), error: null });
    const a = feedHealthService.get(true), b = feedHealthService.get();
    expect(a).toBe(b); await a; expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await feedHealthService.get(true); expect(mocks.rpc).toHaveBeenCalledTimes(2);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(feedHealthService.get(true)).rejects.toThrow('unavailable');
    await feedHealthService.get(); expect(mocks.rpc).toHaveBeenCalledTimes(4);
  });
});
