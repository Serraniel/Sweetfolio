import { describe, it, expect } from 'vitest';
import {
  forwardFillPrices,
  alignPriceSeries,
  subtractYears,
  filterByDateRange,
  toISODate,
  daysBetween,
} from './dates';
import type { PricePoint } from '$lib/types';

describe('toISODate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toISODate(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(toISODate(new Date(2024, 11, 25))).toBe('2024-12-25');
  });

  it('pads single-digit month and day', () => {
    expect(toISODate(new Date(2024, 2, 3))).toBe('2024-03-03');
  });
});

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2024-01-01', '2024-01-01')).toBe(0);
  });

  it('counts calendar days correctly', () => {
    expect(daysBetween('2024-01-01', '2024-01-31')).toBe(30);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366); // 2024 is a leap year
  });

  it('handles negative spans', () => {
    expect(daysBetween('2024-01-10', '2024-01-01')).toBe(-9);
  });
});

describe('subtractYears', () => {
  it('subtracts years from a date', () => {
    expect(subtractYears('2024-06-15', 1)).toBe('2023-06-15');
    expect(subtractYears('2024-06-15', 5)).toBe('2019-06-15');
  });

  it('handles leap year edge case', () => {
    // Feb 29 minus 1 year -> Feb 28 (or Mar 1 depending on Date impl)
    const result = subtractYears('2024-02-29', 1);
    // JavaScript Date handles this by rolling to March 1
    expect(result).toBe('2023-03-01');
  });
});

describe('filterByDateRange', () => {
  const prices: PricePoint[] = [
    { date: '2024-01-01', close: 100 },
    { date: '2024-02-01', close: 110 },
    { date: '2024-03-01', close: 105 },
    { date: '2024-04-01', close: 120 },
    { date: '2024-05-01', close: 115 },
  ];

  it('filters prices within range (inclusive)', () => {
    const result = filterByDateRange(prices, '2024-02-01', '2024-04-01');
    expect(result).toHaveLength(3);
    expect(result[0].date).toBe('2024-02-01');
    expect(result[2].date).toBe('2024-04-01');
  });

  it('returns empty for range outside data', () => {
    const result = filterByDateRange(prices, '2025-01-01', '2025-12-31');
    expect(result).toHaveLength(0);
  });

  it('returns all when range covers all data', () => {
    const result = filterByDateRange(prices, '2023-01-01', '2025-01-01');
    expect(result).toHaveLength(5);
  });
});

describe('forwardFillPrices', () => {
  it('returns empty for empty input', () => {
    expect(forwardFillPrices([])).toEqual([]);
  });

  it('fills gaps with last known price', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-03', close: 110 },
    ];
    const result = forwardFillPrices(prices);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ date: '2024-01-01', close: 100 });
    expect(result[1]).toEqual({ date: '2024-01-02', close: 100 }); // forward-filled
    expect(result[2]).toEqual({ date: '2024-01-03', close: 110 });
  });

  it('handles already continuous data', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 105 },
      { date: '2024-01-03', close: 110 },
    ];
    const result = forwardFillPrices(prices);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.close)).toEqual([100, 105, 110]);
  });

  it('sorts unsorted input', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-03', close: 110 },
      { date: '2024-01-01', close: 100 },
    ];
    const result = forwardFillPrices(prices);
    expect(result[0].date).toBe('2024-01-01');
    expect(result[result.length - 1].date).toBe('2024-01-03');
  });
});

describe('alignPriceSeries', () => {
  it('returns empty for no series', () => {
    const { dates, alignedSeries } = alignPriceSeries([]);
    expect(dates).toEqual([]);
    expect(alignedSeries).toEqual([]);
  });

  it('aligns two series to common dates', () => {
    const a: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
      { date: '2024-01-03', close: 120 },
    ];
    const b: PricePoint[] = [
      { date: '2024-01-02', close: 200 },
      { date: '2024-01-03', close: 210 },
      { date: '2024-01-04', close: 220 },
    ];

    const { dates, alignedSeries } = alignPriceSeries([a, b]);
    // Common range: Jan 2 to Jan 3
    expect(dates).toEqual(['2024-01-02', '2024-01-03']);
    expect(alignedSeries[0]).toEqual([110, 120]);
    expect(alignedSeries[1]).toEqual([200, 210]);
  });

  it('forward-fills missing dates before alignment', () => {
    const a: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-03', close: 120 },
    ];
    const b: PricePoint[] = [
      { date: '2024-01-01', close: 200 },
      { date: '2024-01-02', close: 210 },
      { date: '2024-01-03', close: 220 },
    ];

    const { dates, alignedSeries } = alignPriceSeries([a, b]);
    expect(dates).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
    // Series a: Jan 2 is forward-filled from Jan 1 -> 100
    expect(alignedSeries[0]).toEqual([100, 100, 120]);
    expect(alignedSeries[1]).toEqual([200, 210, 220]);
  });
});
