import { describe, it, expect } from 'vitest';
import { computeAssetHealth } from './data-quality';
import type { PricePoint } from '$lib/types';

function makePrices(closes: number[], startDate = '2020-01-01'): PricePoint[] {
  const start = new Date(startDate);
  return closes.map((close, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

describe('computeAssetHealth', () => {
  it('returns early with warning for empty array', () => {
    const result = computeAssetHealth([]);
    expect(result.dataPoints).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('few_data_points');
  });

  it('returns early with warning for single data point', () => {
    const result = computeAssetHealth([{ date: '2024-01-01', close: 100 }]);
    expect(result.dataPoints).toBe(1);
    expect(result.annualizedReturn).toBe(0);
    expect(result.volatility).toBe(0);
    expect(result.maxDailyMove).toBe(0);
    expect(result.historyDays).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe('few_data_points');
  });

  it('flags few data points when under 50', () => {
    const prices = makePrices(
      Array.from({ length: 30 }, (_, i) => 100 + i * 0.1)
    );
    const result = computeAssetHealth(prices);
    expect(result.dataPoints).toBe(30);
    const warning = result.warnings.find((w) => w.type === 'few_data_points');
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('30');
  });

  it('flags short history when under 365 days', () => {
    const prices = makePrices(
      Array.from({ length: 60 }, (_, i) => 100 + i * 0.05)
    );
    const result = computeAssetHealth(prices);
    const warning = result.warnings.find((w) => w.type === 'short_history');
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('days');
  });

  it('does not flag short history for 2+ years of data', () => {
    const prices = makePrices(
      Array.from({ length: 600 }, (_, i) => 100 + i * 0.01)
    );
    const result = computeAssetHealth(prices);
    const warning = result.warnings.find((w) => w.type === 'short_history');
    expect(warning).toBeUndefined();
  });

  it('flags negative annualized return', () => {
    // Steadily declining price over a year
    const prices = makePrices(
      Array.from({ length: 400 }, (_, i) => 100 * Math.exp(-0.001 * i))
    );
    const result = computeAssetHealth(prices);
    expect(result.annualizedReturn).toBeLessThan(-0.1);
    const warning = result.warnings.find((w) => w.type === 'negative_return');
    expect(warning).toBeDefined();
  });

  it('flags large daily moves', () => {
    // Stable prices with one huge jump
    const closes = Array.from({ length: 100 }, () => 100);
    closes[50] = 200; // 100% jump
    const prices = makePrices(closes);
    const result = computeAssetHealth(prices);
    expect(result.maxDailyMove).toBeGreaterThan(0.2);
    const warning = result.warnings.find((w) => w.type === 'large_daily_move');
    expect(warning).toBeDefined();
  });

  it('flags high volatility', () => {
    // Create wildly oscillating prices
    const closes = Array.from({ length: 500 }, (_, i) =>
      i % 2 === 0 ? 100 : 50
    );
    const prices = makePrices(closes);
    const result = computeAssetHealth(prices);
    expect(result.volatility).toBeGreaterThan(0.8);
    const warning = result.warnings.find((w) => w.type === 'high_volatility');
    expect(warning).toBeDefined();
  });

  it('returns clean health for normal data', () => {
    // Steady growth over 2 years, no extreme moves
    const prices = makePrices(
      Array.from({ length: 600 }, (_, i) => 100 * Math.exp(0.0003 * i))
    );
    const result = computeAssetHealth(prices);
    expect(result.dataPoints).toBe(600);
    expect(result.historyDays).toBeGreaterThanOrEqual(598);
    expect(result.annualizedReturn).toBeGreaterThan(0);
    expect(result.volatility).toBeLessThan(0.8);
    expect(result.maxDailyMove).toBeLessThan(0.2);
    // Should only have no warnings (plenty of data, long history, no extremes)
    expect(result.warnings).toHaveLength(0);
  });

  it('computes maxDailyMove correctly', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 }, // ~9.5% log return
      { date: '2024-01-03', close: 105 },
    ];
    const result = computeAssetHealth(prices);
    expect(result.maxDailyMove).toBeCloseTo(Math.log(110 / 100), 5);
  });

  it('sorts prices by date before computing', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-03', close: 105 },
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
    ];
    const result = computeAssetHealth(prices);
    expect(result.historyDays).toBe(2);
    expect(result.dataPoints).toBe(3);
  });
});
