import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));
import { supabase } from '../lib/supabase';
import { getPublicJobs } from './publicJobs.service';

beforeEach(() => vi.clearAllMocks());
describe('public discovery', () => {
  it('returns unique current listings and never an expired copy', async () => {
    const row = { id: 1, title: 'Developer', company: 'Acme', location: 'Berlin', url: 'https://example.com/job/1', source: 'bundesagentur', salary: null, posted_date: null };
    const chain = { order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [row, { ...row, id: 2, url: row.url + '?utm_source=other' }, { ...row, id: 3, url: 'https://example.com/job/3', deadline: '2000-01-01' }], error: null }) };
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof supabase.from>);
    expect((await getPublicJobs(10)).map((job) => job.id)).toEqual([1]);
    expect(chain.limit).toHaveBeenCalledWith(30);
  });
  it('keeps the compatibility fallback restricted to public fetched jobs', async () => {
    const main = { order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'public_jobs unavailable' } }) };
    const fallback = { is: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    vi.mocked(supabase.from).mockImplementation((table) => ({ select: vi.fn().mockReturnValue(table === 'public_jobs' ? main : fallback) }) as unknown as ReturnType<typeof supabase.from>);
    await getPublicJobs();
    expect(fallback.is).toHaveBeenCalledWith('owner_user_id', null);
    expect(fallback.eq.mock.calls).toEqual(expect.arrayContaining([['is_manual', false], ['is_active', true], ['is_hidden', false]]));
  });
});
