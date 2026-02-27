import { describe, it, expect } from 'vitest';
import { annualizedVolatility } from './volatility';
import type { PricePoint } from '$lib/types';

describe('annualizedVolatility', () => {
  it('returns 0 for fewer than 3 prices (less than 2 returns)', () => {
    expect(annualizedVolatility([])).toBe(0);
    expect(annualizedVolatility([{ date: '2024-01-01', close: 100 }])).toBe(0);
    expect(
      annualizedVolatility([
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 110 },
      ]),
    ).toBe(0);
  });

  it('returns 0 for constant prices', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-03', close: 100 },
      { date: '2024-01-04', close: 100 },
    ];
    expect(annualizedVolatility(prices)).toBe(0);
  });

  it('computes annualized volatility as stddev * sqrt(252)', () => {
    // Known prices: 100, 102, 98, 101, 103
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 102 },
      { date: '2024-01-03', close: 98 },
      { date: '2024-01-04', close: 101 },
      { date: '2024-01-05', close: 103 },
    ];

    // Log returns
    const lr = [
      Math.log(102 / 100),
      Math.log(98 / 102),
      Math.log(101 / 98),
      Math.log(103 / 101),
    ];

    // Sample std dev (N-1)
    const m = lr.reduce((a, b) => a + b, 0) / lr.length;
    const sumSq = lr.reduce((a, b) => a + (b - m) ** 2, 0);
    const sampleStd = Math.sqrt(sumSq / (lr.length - 1));
    const expectedVol = sampleStd * Math.sqrt(252);

    expect(annualizedVolatility(prices)).toBeCloseTo(expectedVol, 10);
  });

  it('produces a higher volatility for more volatile prices', () => {
    const stable: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 },
      { date: '2024-01-03', close: 100 },
      { date: '2024-01-04', close: 101 },
    ];
    const volatile: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 120 },
      { date: '2024-01-03', close: 80 },
      { date: '2024-01-04', close: 110 },
    ];
    expect(annualizedVolatility(volatile)).toBeGreaterThan(annualizedVolatility(stable));
  });
});
