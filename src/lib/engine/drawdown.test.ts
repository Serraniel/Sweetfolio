import { describe, it, expect } from 'vitest';
import { maxDrawdown, drawdownSeries } from './drawdown';
import type { PricePoint } from '$lib/types';

describe('maxDrawdown', () => {
  it('returns 0 for fewer than 2 prices', () => {
    expect(maxDrawdown([])).toBe(0);
    expect(maxDrawdown([{ date: '2024-01-01', close: 100 }])).toBe(0);
  });

  it('returns 0 for a monotonically increasing series', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
      { date: '2024-01-03', close: 120 },
      { date: '2024-01-04', close: 130 },
    ];
    expect(maxDrawdown(prices)).toBe(0);
  });

  it('computes max drawdown for a simple peak-to-trough', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 120 }, // peak
      { date: '2024-01-03', close: 90 }, // trough: (90-120)/120 = -0.25
      { date: '2024-01-04', close: 110 },
    ];
    expect(maxDrawdown(prices)).toBeCloseTo(-0.25, 10);
  });

  it('finds the largest drawdown among multiple drops', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 90 }, // -10%
      { date: '2024-01-03', close: 110 }, // new peak
      { date: '2024-01-04', close: 77 }, // (77-110)/110 = -30%
      { date: '2024-01-05', close: 120 },
    ];
    expect(maxDrawdown(prices)).toBeCloseTo(-0.3, 10);
  });

  it('handles total loss', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 0 },
    ];
    expect(maxDrawdown(prices)).toBeCloseTo(-1, 10);
  });
});

describe('drawdownSeries', () => {
  it('returns empty for empty input', () => {
    expect(drawdownSeries([])).toEqual([]);
  });

  it('computes drawdown at each point', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 120 },
      { date: '2024-01-03', close: 90 },
      { date: '2024-01-04', close: 130 },
    ];
    const series = drawdownSeries(prices);
    expect(series).toHaveLength(4);

    // At 100: peak=100, dd=0
    expect(series[0].drawdown).toBeCloseTo(0, 10);
    // At 120: peak=120, dd=0
    expect(series[1].drawdown).toBeCloseTo(0, 10);
    // At 90: peak=120, dd=(90-120)/120 = -0.25
    expect(series[2].drawdown).toBeCloseTo(-0.25, 10);
    // At 130: peak=130, dd=0
    expect(series[3].drawdown).toBeCloseTo(0, 10);
  });

  it('preserves dates', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 80 },
    ];
    const series = drawdownSeries(prices);
    expect(series[0].date).toBe('2024-01-01');
    expect(series[1].date).toBe('2024-01-02');
  });
});
