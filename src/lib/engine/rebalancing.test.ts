import { describe, it, expect } from 'vitest';
import { computeRebalancedPortfolioPrices } from './rebalancing';
import type { PricePoint } from '$lib/types';

function makePrices(start: string, values: number[]): PricePoint[] {
  const prices: PricePoint[] = [];
  const d = new Date(start);
  for (const v of values) {
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    prices.push({ date: d.toISOString().slice(0, 10), close: v });
    d.setDate(d.getDate() + 1);
  }
  return prices;
}

describe('computeRebalancedPortfolioPrices', () => {
  it('returns empty array for empty input', () => {
    expect(computeRebalancedPortfolioPrices([])).toEqual([]);
  });

  it('with frequency=none behaves like buy-and-hold', () => {
    const a = makePrices('2024-01-02', [100, 110, 120]);
    const b = makePrices('2024-01-02', [100, 90, 80]);
    const result = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices: a, weight: 0.5 },
        { id: 'b', prices: b, weight: 0.5 },
      ],
      'none',
    );
    expect(result.length).toBe(3);
    // Start at 100 (50 + 50)
    expect(result[0].close).toBeCloseTo(100, 5);
    // Day 2: 50*(110/100) + 50*(90/100) = 55 + 45 = 100
    expect(result[1].close).toBeCloseTo(100, 5);
  });

  it('single asset returns rebased series regardless of frequency', () => {
    const a = makePrices('2024-01-02', [50, 60, 70, 80]);
    const result = computeRebalancedPortfolioPrices(
      [{ id: 'a', prices: a, weight: 1.0 }],
      'monthly',
    );
    expect(result.length).toBe(4);
    expect(result[0].close).toBeCloseTo(100, 5);
    expect(result[3].close).toBeCloseTo(160, 5);
  });

  it('normalizes weights that do not sum to 1', () => {
    const a = makePrices('2024-01-02', [100, 200]);
    const b = makePrices('2024-01-02', [100, 200]);
    const result = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices: a, weight: 3 },
        { id: 'b', prices: b, weight: 7 },
      ],
      'none',
    );
    expect(result[0].close).toBeCloseTo(100, 5);
    expect(result[1].close).toBeCloseTo(200, 5);
  });

  it('monthly rebalancing resets weights at month boundary', () => {
    // Create prices spanning two months
    // Asset A doubles, Asset B halves by end of Jan, then reverse in Feb
    const pricesA: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-15', close: 200 },
      { date: '2024-01-31', close: 200 },
      { date: '2024-02-01', close: 200 },
      { date: '2024-02-15', close: 100 },
    ];
    const pricesB: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-15', close: 50 },
      { date: '2024-01-31', close: 50 },
      { date: '2024-02-01', close: 50 },
      { date: '2024-02-15', close: 100 },
    ];

    const rebalanced = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices: pricesA, weight: 0.5 },
        { id: 'b', prices: pricesB, weight: 0.5 },
      ],
      'monthly',
    );

    const buyAndHold = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices: pricesA, weight: 0.5 },
        { id: 'b', prices: pricesB, weight: 0.5 },
      ],
      'none',
    );

    // Rebalanced and buy-and-hold should differ because rebalancing
    // redistributes at the month boundary
    expect(rebalanced.length).toBe(buyAndHold.length);
    // The final values should differ due to rebalancing effect
    const rebalFinal = rebalanced[rebalanced.length - 1].close;
    const holdFinal = buyAndHold[buyAndHold.length - 1].close;
    // They won't be equal because rebalancing changes the allocation
    expect(rebalFinal).not.toBeCloseTo(holdFinal, 2);
  });
});
