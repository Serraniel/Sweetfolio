import { describe, it, expect } from 'vitest';
import { computePortfolioPrices } from './portfolio';
import type { PricePoint } from '$lib/types';

describe('computePortfolioPrices', () => {
  it('returns empty for no assets', () => {
    expect(computePortfolioPrices([])).toEqual([]);
  });

  it('computes weighted portfolio from a single asset (weight=1)', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 50 },
      { date: '2024-01-02', close: 55 },
      { date: '2024-01-03', close: 60 },
    ];
    const result = computePortfolioPrices([{ id: 'a', prices, weight: 1 }]);
    expect(result).toHaveLength(3);
    // Rebased to 100, then weighted by 1
    expect(result[0].close).toBeCloseTo(100, 5);
    expect(result[1].close).toBeCloseTo(110, 5); // 55/50 * 100
    expect(result[2].close).toBeCloseTo(120, 5); // 60/50 * 100
  });

  it('computes 50/50 split of two assets', () => {
    const pricesA: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 120 }, // +20%
    ];
    const pricesB: PricePoint[] = [
      { date: '2024-01-01', close: 200 },
      { date: '2024-01-02', close: 200 }, // 0%
    ];

    const result = computePortfolioPrices([
      { id: 'a', prices: pricesA, weight: 0.5 },
      { id: 'b', prices: pricesB, weight: 0.5 },
    ]);

    expect(result).toHaveLength(2);
    // Day 1: 0.5*100 + 0.5*100 = 100
    expect(result[0].close).toBeCloseTo(100, 5);
    // Day 2: 0.5*(120/100*100) + 0.5*(200/200*100) = 0.5*120 + 0.5*100 = 110
    expect(result[1].close).toBeCloseTo(110, 5);
  });

  it('computes 70/30 split', () => {
    const pricesA: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 }, // +10%
    ];
    const pricesB: PricePoint[] = [
      { date: '2024-01-01', close: 50 },
      { date: '2024-01-02', close: 60 }, // +20%
    ];

    const result = computePortfolioPrices([
      { id: 'a', prices: pricesA, weight: 0.7 },
      { id: 'b', prices: pricesB, weight: 0.3 },
    ]);

    // Day 2: 0.7*(110/100*100) + 0.3*(60/50*100) = 0.7*110 + 0.3*120 = 77+36 = 113
    expect(result[1].close).toBeCloseTo(113, 5);
  });

  it('aligns assets with different date ranges', () => {
    const pricesA: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
      { date: '2024-01-03', close: 120 },
    ];
    const pricesB: PricePoint[] = [
      { date: '2024-01-02', close: 200 },
      { date: '2024-01-03', close: 210 },
    ];

    const result = computePortfolioPrices([
      { id: 'a', prices: pricesA, weight: 0.5 },
      { id: 'b', prices: pricesB, weight: 0.5 },
    ]);

    // Common dates: Jan 2, Jan 3
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2024-01-02');
    expect(result[1].date).toBe('2024-01-03');
  });
});
