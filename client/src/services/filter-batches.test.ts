import { describe, expect, it } from 'vitest';
import { filterBatches } from '../../../supabase/functions/_shared/filter-batches.ts';

describe('PostgREST filter URL budget', () => {
  it('keeps encoded international identifiers within the header budget without losing IDs', () => {
    const ids = Array.from({ length: 150 }, (_, i) => `bundesagentur_äöü-${i}-${'x'.repeat(i % 80)}`);
    const batches = filterBatches(ids);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(ids);
    for (const batch of batches) {
      expect(batch.reduce((n, id) => n + encodeURIComponent(id).length + 3, 0)).toBeLessThanOrEqual(2000);
    }
    expect(filterBatches([])).toEqual([]);
  });
});
