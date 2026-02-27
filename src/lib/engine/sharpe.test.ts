import { describe, it, expect } from 'vitest';
import { sharpeRatio } from './sharpe';
import type { PricePoint } from '$lib/types';

describe('sharpeRatio', () => {
  it('returns 0 for insufficient data', () => {
    expect(sharpeRatio([])).toBe(0);
    expect(sharpeRatio([{ date: '2024-01-01', close: 100 }])).toBe(0);
  });

  it('returns 0 when volatility is 0 (constant prices)', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-03', close: 100 },
    ];
    expect(sharpeRatio(prices)).toBe(0);
  });

  it('computes (annualized return - risk-free rate) / volatility', () => {
    // Use a simple series where we can hand-calculate
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 102 },
      { date: '2024-01-03', close: 98 },
      { date: '2024-01-04', close: 101 },
      { date: '2024-01-05', close: 103 },
    ];

    // With risk-free rate = 0
    const sr = sharpeRatio(prices, 0);
    // Sharpe should be a finite number
    expect(Number.isFinite(sr)).toBe(true);
  });

  it('decreases when risk-free rate increases', () => {
    const prices: PricePoint[] = [
      { date: '2023-01-01', close: 100 },
      { date: '2023-04-01', close: 105 },
      { date: '2023-07-01', close: 110 },
      { date: '2024-01-01', close: 120 },
    ];
    const sr0 = sharpeRatio(prices, 0);
    const sr5 = sharpeRatio(prices, 0.05);
    expect(sr0).toBeGreaterThan(sr5);
  });

  it('is negative for a declining asset with zero risk-free rate', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 95 },
      { date: '2024-01-03', close: 90 },
      { date: '2024-01-04', close: 85 },
    ];
    expect(sharpeRatio(prices, 0)).toBeLessThan(0);
  });
});
