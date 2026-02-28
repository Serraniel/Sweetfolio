import { describe, it, expect } from 'vitest';
import { mergePrices, type MergeResult } from './price-merge';
import type { PricePoint } from '$lib/types';

describe('mergePrices', () => {
  it('appends new dates not in existing data', () => {
    const existing: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
    ];
    const fetched: PricePoint[] = [
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-03', close: 102 },
      { date: '2024-01-04', close: 103 },
    ];
    const result = mergePrices(existing, fetched);
    expect(result.merged).toHaveLength(4);
    expect(result.merged[2]).toEqual({ date: '2024-01-03', close: 102 });
    expect(result.merged[3]).toEqual({ date: '2024-01-04', close: 103 });
    expect(result.conflicts).toHaveLength(0);
    expect(result.addedCount).toBe(2);
  });

  it('keeps existing data for overlapping dates with small deviation', () => {
    const existing: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
    ];
    const fetched: PricePoint[] = [
      { date: '2024-01-01', close: 100.5 },
    ];
    const result = mergePrices(existing, fetched);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].close).toBe(100);
    expect(result.conflicts).toHaveLength(0);
  });

  it('flags conflicts for overlapping dates with >1% deviation', () => {
    const existing: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
    ];
    const fetched: PricePoint[] = [
      { date: '2024-01-01', close: 105 },
    ];
    const result = mergePrices(existing, fetched);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].close).toBe(100);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toEqual({
      date: '2024-01-01',
      existingClose: 100,
      fetchedClose: 105,
    });
  });

  it('returns sorted results by date', () => {
    const existing: PricePoint[] = [
      { date: '2024-01-03', close: 103 },
      { date: '2024-01-01', close: 100 },
    ];
    const fetched: PricePoint[] = [
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-04', close: 104 },
    ];
    const result = mergePrices(existing, fetched);
    expect(result.merged.map((p) => p.date)).toEqual([
      '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04',
    ]);
  });

  it('handles empty existing data', () => {
    const result = mergePrices([], [{ date: '2024-01-01', close: 100 }]);
    expect(result.merged).toHaveLength(1);
    expect(result.addedCount).toBe(1);
  });

  it('handles empty fetched data', () => {
    const existing: PricePoint[] = [{ date: '2024-01-01', close: 100 }];
    const result = mergePrices(existing, []);
    expect(result.merged).toHaveLength(1);
    expect(result.addedCount).toBe(0);
  });
});
