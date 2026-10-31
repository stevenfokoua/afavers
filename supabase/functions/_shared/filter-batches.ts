/** PostgREST echoes filters in Content-Location; bound encoded URLs as well as row count. */
export function filterBatches(ids: string[], budget = 2000): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let length = 0;
  for (const id of ids) {
    const size = encodeURIComponent(id).length + 3;
    if (batch.length && length + size > budget) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(id);
    length += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
