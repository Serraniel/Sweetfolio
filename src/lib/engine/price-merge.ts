import type { PricePoint } from '$lib/types';

export interface PriceConflict {
  date: string;
  existingClose: number;
  fetchedClose: number;
}

export interface MergeResult {
  merged: PricePoint[];
  conflicts: PriceConflict[];
  addedCount: number;
}

const CONFLICT_THRESHOLD = 0.01; // 1%

export function mergePrices(existing: PricePoint[], fetched: PricePoint[]): MergeResult {
  const existingMap = new Map(existing.map((p) => [p.date, p]));
  const conflicts: PriceConflict[] = [];
  let addedCount = 0;

  for (const fp of fetched) {
    const ep = existingMap.get(fp.date);
    if (ep) {
      const deviation = Math.abs(fp.close - ep.close) / ep.close;
      if (deviation > CONFLICT_THRESHOLD) {
        conflicts.push({
          date: fp.date,
          existingClose: ep.close,
          fetchedClose: fp.close,
        });
      }
    } else {
      existingMap.set(fp.date, fp);
      addedCount++;
    }
  }

  const merged = Array.from(existingMap.values()).sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  return { merged, conflicts, addedCount };
}
