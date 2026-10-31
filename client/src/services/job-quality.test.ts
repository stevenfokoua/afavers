import { describe, expect, it } from 'vitest';
import { canonicalJobUrl, discoveryJobs, isExpiredJob } from '../../../supabase/functions/_shared/job-quality.ts';
import { freshAlertMatches } from '../../../supabase/functions/_shared/alert-matches.ts';

const now = Date.parse('2026-10-28T12:00:00Z');
const listing = (id: number, extra = {}) => ({ id, title: 'Developer', company: 'Acme', url: `https://example.com/job/${id}`, status: 'new', ...extra });

describe('listing quality without losing applications', () => {
  it('removes tracking parameters while preserving distinct vacancy identifiers', () => {
    expect(canonicalJobUrl('https://www.example.com/jobs?id=12&utm_source=feed#apply')).toBe('example.com/jobs?id=12');
    expect(canonicalJobUrl('https://example.com/jobs?id=13')).not.toBe(canonicalJobUrl('https://example.com/jobs?id=12'));
    expect(canonicalJobUrl('javascript:alert(1)')).toBeNull();
  });
  it('treats a deadline as inclusive of its day and ignores missing/invalid dates', () => {
    expect(isExpiredJob({ deadline: '2026-10-28' }, now)).toBe(false);
    expect(isExpiredJob({ deadline: '2026-10-27' }, now)).toBe(true);
    expect(isExpiredJob({ deadline: 'bad date' }, now)).toBe(false);
  });
  it('excludes expired/inactive discovery rows but keeps every tracked/manual row', () => {
    const jobs = [listing(1, { deadline: '2026-10-27' }), listing(2, { is_active: false }), listing(3, { status: 'applied', is_active: false }), listing(4, { status: 'saved', deadline: '2026-10-27' }), listing(5, { is_manual: true, deadline: '2026-10-27' })];
    expect(discoveryJobs(jobs, now).map((job) => job.id)).toEqual([3, 4, 5]);
  });
  it('deduplicates discovery destinations and keeps both saved histories', () => {
    const url = 'https://example.com/vacancy';
    const jobs = [listing(1, { url }), listing(2, { url: url + '?utm_source=other' }), listing(3, { url, status: 'saved' }), listing(4, { url, status: 'applied' })];
    expect(discoveryJobs(jobs, now).map((job) => job.id)).toEqual([3, 4]);
    expect(discoveryJobs(jobs.slice(0, 2), now)).toHaveLength(1);
  });
  it('does not collapse different roles sharing a company careers page', () => {
    const jobs = [listing(1, { url: 'https://example.com/careers', title: 'Developer' }), listing(2, { url: 'https://example.com/careers', title: 'Designer' })];
    expect(discoveryJobs(jobs, now)).toHaveLength(2);
  });
  it('keeps the same title at the same company in different cities', () => {
    const jobs = [listing(1, { url: 'https://example.com/careers', location: 'Berlin' }), listing(2, { url: 'https://example.com/careers', location: 'München' })];
    expect(discoveryJobs(jobs, now)).toHaveLength(2);
    expect(discoveryJobs([{ ...jobs[0], is_hidden: true }, jobs[1]], now).filter((job) => !('is_hidden' in job && job.is_hidden))).toEqual([jobs[1]]);
  });
  it('retains a personal note/history overlay while the job is still new and expired', () => {
    const job = listing(1, { is_tracked: true, is_active: false, deadline: '2000-01-01', notes: 'Personal note' });
    expect(discoveryJobs([job], now)).toEqual([job]);
  });
  it('does not reintroduce hidden or rejected copies as new jobs', () => {
    const jobs = [listing(1, { is_hidden: true }), listing(2, { url: 'https://example.com/job/1' })];
    expect(discoveryJobs(jobs, now).map((job) => job.id)).toEqual([1]);
  });
  it('prefers a known recent feed observation over a copy with unknown observation time', () => {
    const old = listing(1, { url: 'https://example.com/shared-vacancy', updated_at: 'invalid' });
    const current = listing(2, { url: old.url, updated_at: '2026-10-28T10:00:00Z' });
    expect(discoveryJobs([old, current], now)).toEqual([current]);
    expect(discoveryJobs([{ ...old, updated_at: undefined }, current], now)).toEqual([current]);
  });
});

describe('fresh alert selection', () => {
  it('does not let a delivery in one city suppress the same role in another city', () => {
    const berlin = listing(1, { url: 'https://example.com/careers', location: 'Berlin' });
    const munich = listing(2, { url: 'https://example.com/careers', location: 'München' });
    expect(freshAlertMatches([berlin, munich], [], new Set())).toHaveLength(2);
    expect(freshAlertMatches([munich], [{ job_id: 1, jobs: berlin }], new Set())).toEqual([munich]);
  });
  it('reaches unseen jobs after twenty delivered top matches', () => {
    const jobs = Array.from({ length: 25 }, (_, i) => listing(i + 1));
    const delivered = jobs.slice(0, 20).map((job) => ({ job_id: job.id }));
    expect(freshAlertMatches(jobs, delivered, new Set()).map((job) => job.id)).toEqual([21, 22, 23, 24, 25]);
  });
  it('suppresses a delivered destination under a different source id and duplicate digest entries', () => {
    const jobs = [listing(2, { url: 'https://example.com/job/1?utm_source=other' }), listing(3), listing(4, { url: 'https://example.com/job/3' })];
    expect(freshAlertMatches(jobs, [{ job_id: 1, jobs: listing(1) }], new Set()).map((job) => job.id)).toEqual([3]);
  });
  it('excludes touched, expired and inactive jobs before filling the digest', () => {
    const jobs = [listing(1), listing(2, { deadline: '2000-01-01' }), listing(3, { is_active: false }), listing(4)];
    expect(freshAlertMatches(jobs, [], new Set([1])).map((job) => job.id)).toEqual([4]);
  });
});
