import { describe, it, expect } from 'vitest';
import { computeLogReturns, cumulativeReturn, annualizedReturn } from './returns';
import type { PricePoint } from '$lib/types';

describe('computeLogReturns', () => {
  it('returns empty array for fewer than 2 prices', () => {
    expect(computeLogReturns([])).toEqual([]);
    expect(computeLogReturns([{ date: '2024-01-01', close: 100 }])).toEqual([]);
  });

  it('computes log returns correctly', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
      { date: '2024-01-03', close: 105 },
    ];
    const returns = computeLogReturns(prices);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(Math.log(110 / 100), 10);
    expect(returns[1]).toBeCloseTo(Math.log(105 / 110), 10);
  });

  it('skips non-positive prices', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 0 },
      { date: '2024-01-03', close: 50 },
    ];
    const returns = computeLogReturns(prices);
    // Non-positive prices are skipped
    expect(returns).toHaveLength(0);
  });
});

describe('cumulativeReturn', () => {
  it('returns 0 for fewer than 2 data points', () => {
    expect(cumulativeReturn([])).toBe(0);
    expect(cumulativeReturn([{ date: '2024-01-01', close: 100 }])).toBe(0);
  });

  it('computes (end/start) - 1', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-06-01', close: 150 },
    ];
    expect(cumulativeReturn(prices)).toBeCloseTo(0.5, 10);
  });

  it('handles negative cumulative return', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 200 },
      { date: '2024-06-01', close: 100 },
    ];
    expect(cumulativeReturn(prices)).toBeCloseTo(-0.5, 10);
  });

  it('returns 0 if start price is 0', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 0 },
      { date: '2024-06-01', close: 100 },
    ];
    expect(cumulativeReturn(prices)).toBe(0);
  });

  it('handles no change', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-06-01', close: 100 },
    ];
    expect(cumulativeReturn(prices)).toBe(0);
  });
});

describe('annualizedReturn', () => {
  it('returns 0 for fewer than 2 data points', () => {
    expect(annualizedReturn([])).toBe(0);
    expect(annualizedReturn([{ date: '2024-01-01', close: 100 }])).toBe(0);
  });

  it('computes annualized return for a 1-year 10% gain', () => {
    const prices: PricePoint[] = [
      { date: '2023-01-01', close: 100 },
      { date: '2024-01-01', close: 110 },
    ];
    const result = annualizedReturn(prices);
    // Should be close to 10% annualized
    expect(result).toBeCloseTo(0.1, 2);
    // Verify the formula: (1+cumRet)^(365.25/days) - 1
    expect(result).toBeGreaterThan(0.09);
    expect(result).toBeLessThan(0.11);
  });

  it('computes annualized return for a 2-year 50% gain', () => {
    const prices: PricePoint[] = [
      { date: '2022-01-01', close: 100 },
      { date: '2024-01-01', close: 150 },
    ];
    const result = annualizedReturn(prices);
    // ~22.5% annualized for 50% over 2 years
    expect(result).toBeGreaterThan(0.20);
    expect(result).toBeLessThan(0.25);
  });

  it('returns -1 for total loss', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-06-01', close: 0 },
    ];
    expect(annualizedReturn(prices)).toBe(-1);
  });

  it('returns 0 for same-day prices', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-01', close: 110 },
    ];
    expect(annualizedReturn(prices)).toBe(0);
  });
});
