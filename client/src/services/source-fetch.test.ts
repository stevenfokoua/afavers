import { describe, expect, it, vi } from 'vitest';
import { fetchSearchPages, importOutcome } from '../../../supabase/functions/_shared/source-fetch';

type Item = { id: string };
const json = (items: Item[], hasMore = false) => new Response(JSON.stringify({ items, hasMore }));
const options = () => ({ source: 'test-source', queries: ['a'], concurrency: 1, deadlineAt: 99999, now: () => 0, makeUrl: (query: string, page: number) => `https://example.invalid/${query}/${page}?private-key=never-log`, parse: (payload: unknown) => payload as { items: Item[]; hasMore: boolean }, key: (item: Item) => item.id, pause: async () => {} });

describe('bounded source import and honest outcomes', () => {
  it('distinguishes an unconfigured provider from a successful empty search', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const disabled = await fetchSearchPages({ ...options(), configured: false, fetcher });
    expect(fetcher).not.toHaveBeenCalled(); expect(disabled.complete).toBe(true); expect(disabled.report.status).toBe('disabled');
    const empty = await fetchSearchPages({ ...options(), fetcher: vi.fn<typeof fetch>().mockResolvedValue(json([])) });
    expect(empty.complete).toBe(true); expect(empty.report.status).toBe('succeeded'); expect(empty.report.queries_completed).toBe(1);
    expect(importOutcome([disabled.report])).toBe('failed');
  });
  it('covers initial queries before paginating and deduplicates repeated ids', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json([{ id: '1' }], true)).mockResolvedValueOnce(json([{ id: '2' }])).mockResolvedValueOnce(json([{ id: '1' }, { id: '3' }]));
    const result = await fetchSearchPages({ ...options(), queries: ['a', 'b'], fetcher });
    expect(fetcher.mock.calls.map(call => String(call[0]).split('?')[0])).toEqual(['https://example.invalid/a/1', 'https://example.invalid/b/1', 'https://example.invalid/a/2']);
    expect(result.jobs.map(item => item.id)).toEqual(['1', '2', '3']); expect(result.complete).toBe(true);
    expect(result.report).toMatchObject({ queries_attempted: 2, queries_completed: 2, requests_attempted: 3, pages_fetched: 3, jobs_returned: 3 });
  });
  it('retries transient provider failures once and records the recovered request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('upstream error', { status: 503 })).mockResolvedValueOnce(json([{ id: 'ok' }]));
    const result = await fetchSearchPages({ ...options(), fetcher });
    expect(result.complete).toBe(true); expect(result.report).toMatchObject({ retries: 1, requests_attempted: 2, failed_queries: 0, errors: ['http_503'] });
  });
  it('bounds Retry-After and never retries nontransient rejections', async () => {
    const pause = vi.fn(async () => {});
    await fetchSearchPages({ ...options(), pause, fetcher: vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } })).mockResolvedValueOnce(json([])) });
    expect(pause).toHaveBeenCalledWith(2000);
    const coolingDown = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '600' } }));
    const cooldown = await fetchSearchPages({ ...options(), fetcher: coolingDown });
    expect(coolingDown).toHaveBeenCalledOnce(); expect(cooldown.report.errors).toContain('provider_cooldown'); expect(cooldown.complete).toBe(false);
    const rejected = vi.fn<typeof fetch>().mockResolvedValue(new Response('private details', { status: 403 }));
    const result = await fetchSearchPages({ ...options(), fetcher: rejected });
    expect(rejected).toHaveBeenCalledOnce(); expect(result.report.status).toBe('failed'); expect(result.report.failed_queries).toBe(1);
    expect(JSON.stringify(result.report)).not.toMatch(/private-key|private details|example\.invalid/);
  });
  it('marks a response parsing failure incomplete without exposing raw error text', async () => {
    const result = await fetchSearchPages({ ...options(), parse: () => { throw new Error('secret provider payload'); }, fetcher: vi.fn<typeof fetch>().mockResolvedValue(json([])) });
    expect(result.complete).toBe(false); expect(result.report.errors).toEqual(['unexpected_response']);
  });
  it('records invalid JSON and request timeouts distinctly', async () => {
    const malformed = await fetchSearchPages({ ...options(), fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('not json')) });
    expect(malformed.report.errors).toEqual(['invalid_json']); expect(malformed.report.retries).toBe(0);
    const timedOut = await fetchSearchPages({ ...options(), fetcher: vi.fn<typeof fetch>().mockRejectedValue(new DOMException('Do not expose connection details', 'TimeoutError')) });
    expect(timedOut.report).toMatchObject({ timed_out_requests: 2, failed_queries: 1, status: 'failed' });
  });
  it('keeps fetched jobs on budget exhaustion and never treats the run as complete', async () => {
    let clock = 0;
    const result = await fetchSearchPages({ ...options(), now: () => clock, deadlineAt: 10, fetcher: vi.fn<typeof fetch>().mockImplementation(async () => { clock = 20; return json([{ id: 'keep' }], true); }) });
    expect(result.jobs).toEqual([{ id: 'keep' }]); expect(result.complete).toBe(false); expect(result.report.budget_exhausted).toBe(true); expect(importOutcome([result.report])).toBe('partial');
  });
  it('reports page/configuration/result caps instead of advertising full coverage', async () => {
    const pages = await fetchSearchPages({ ...options(), maxPages: 2, fetcher: vi.fn<typeof fetch>().mockImplementation(async () => json([{ id: 'same' }], true)) });
    expect(pages.report).toMatchObject({ capped_queries: 1, pages_fetched: 2, status: 'partial' }); expect(pages.complete).toBe(false);
    const configured = await fetchSearchPages({ ...options(), configurationCapped: true, fetcher: vi.fn<typeof fetch>().mockResolvedValue(json([])) });
    expect(configured.complete).toBe(false);
    const capped = await fetchSearchPages({ ...options(), maxJobs: 1, fetcher: vi.fn<typeof fetch>().mockResolvedValue(json([{ id: '1' }, { id: '2' }, { id: '3' }])) });
    expect(capped.jobs).toHaveLength(1); expect(capped.report.errors).toContain('job_limit'); expect(capped.complete).toBe(false);
  });
  it('does not claim successful coverage for empty configuration or failed persistence', async () => {
    const result = await fetchSearchPages({ ...options(), queries: [], fetcher: vi.fn<typeof fetch>() });
    expect(result.complete).toBe(false); expect(importOutcome([result.report])).toBe('failed');
    const successful = await fetchSearchPages({ ...options(), fetcher: vi.fn<typeof fetch>().mockResolvedValue(json([])) });
    expect(importOutcome([successful.report], true)).toBe('failed');
  });
});
