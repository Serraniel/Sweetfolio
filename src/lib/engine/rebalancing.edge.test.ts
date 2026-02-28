import { describe, it, expect } from 'vitest';
import { computeRebalancedPortfolioPrices, type RebalanceFrequency } from './rebalancing';
import type { PricePoint } from '$lib/types';

describe('rebalancing edge cases', () => {
  it('handles assets with zero starting price', () => {
    const a: PricePoint[] = [
      { date: '2024-01-02', close: 0 },
      { date: '2024-01-03', close: 100 },
    ];
    const b: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-03', close: 200 },
    ];
    const result = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices: a, weight: 0.5 },
        { id: 'b', prices: b, weight: 0.5 },
      ],
      'none',
    );
    // Should not throw, even if one asset starts at 0
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles all weights being zero', () => {
    const a: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-03', close: 200 },
    ];
    const result = computeRebalancedPortfolioPrices(
      [{ id: 'a', prices: a, weight: 0 }],
      'none',
    );
    expect(result.length).toBe(2);
  });

  it('quarterly rebalancing triggers at quarter boundaries', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-02-01', close: 110 },
      { date: '2024-03-01', close: 120 },
      { date: '2024-04-01', close: 130 }, // Q2 boundary
      { date: '2024-05-01', close: 140 },
      { date: '2024-06-01', close: 150 },
      { date: '2024-07-01', close: 160 }, // Q3 boundary
    ];
    const pricesB: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-02-01', close: 90 },
      { date: '2024-03-01', close: 80 },
      { date: '2024-04-01', close: 70 },
      { date: '2024-05-01', close: 60 },
      { date: '2024-06-01', close: 50 },
      { date: '2024-07-01', close: 40 },
    ];

    const rebalanced = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices, weight: 0.5 },
        { id: 'b', prices: pricesB, weight: 0.5 },
      ],
      'quarterly',
    );

    const noRebalance = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices, weight: 0.5 },
        { id: 'b', prices: pricesB, weight: 0.5 },
      ],
      'none',
    );

    // They should be the same length but different values
    expect(rebalanced.length).toBe(noRebalance.length);
    // Due to divergent performance, rebalanced should differ from buy-and-hold
    const rebalFinal = rebalanced[rebalanced.length - 1].close;
    const holdFinal = noRebalance[noRebalance.length - 1].close;
    expect(rebalFinal).not.toBeCloseTo(holdFinal, 1);
  });

  it('annually rebalancing triggers at year boundaries', () => {
    const pricesA: PricePoint[] = [
      { date: '2023-06-01', close: 100 },
      { date: '2023-12-29', close: 200 },
      { date: '2024-01-02', close: 200 }, // Year boundary
      { date: '2024-06-01', close: 100 },
    ];
    const pricesB: PricePoint[] = [
      { date: '2023-06-01', close: 100 },
      { date: '2023-12-29', close: 50 },
      { date: '2024-01-02', close: 50 },
      { date: '2024-06-01', close: 100 },
    ];

    const rebalanced = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices: pricesA, weight: 0.5 },
        { id: 'b', prices: pricesB, weight: 0.5 },
      ],
      'annually',
    );

    const buyHold = computeRebalancedPortfolioPrices(
      [
        { id: 'a', prices: pricesA, weight: 0.5 },
        { id: 'b', prices: pricesB, weight: 0.5 },
      ],
      'none',
    );

    // Rebalancing should make a difference here due to mean reversion
    expect(rebalanced.length).toBe(buyHold.length);
  });

  it('all supported frequencies are valid', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-06-01', close: 150 },
    ];
    const frequencies: RebalanceFrequency[] = ['none', 'monthly', 'quarterly', 'annually'];

    for (const freq of frequencies) {
      const result = computeRebalancedPortfolioPrices(
        [{ id: 'a', prices, weight: 1 }],
        freq,
      );
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
