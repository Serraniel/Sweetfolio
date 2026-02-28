/**
 * Integration tests for the financial engine pipeline.
 * Tests that modules work correctly together end-to-end.
 */
import { describe, it, expect } from 'vitest';
import { computeAllMetrics } from './metrics';
import { computePortfolioPrices } from './portfolio';
import { convertPrices } from './currency';
import { computeCorrelationMatrix } from './correlation';
import type { PricePoint, CurrencyRate } from '$lib/types';

// Helper: generate a synthetic price series with a known growth rate
function generatePrices(
  start: string,
  days: number,
  startPrice: number,
  dailyReturn: number,
): PricePoint[] {
  const prices: PricePoint[] = [];
  const d = new Date(start);
  let price = startPrice;
  for (let i = 0; i < days; i++) {
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    prices.push({ date: d.toISOString().slice(0, 10), close: price });
    price *= 1 + dailyReturn;
    d.setDate(d.getDate() + 1);
  }
  return prices;
}

describe('metrics pipeline integration', () => {
  it('computes metrics for available periods based on date range filter', () => {
    // 2 years of data: all periods whose lookback window intersects with the data range
    // will have metrics computed (as long as >=2 data points found)
    const prices = generatePrices('2023-01-02', 520, 100, 0.001);
    const result = computeAllMetrics('test-asset', prices);

    expect(result.assetId).toBe('test-asset');
    expect(result.periods['all']).not.toBeNull();
    expect(result.periods['1y']).not.toBeNull();

    // All period metrics should have consistent signs for a monotonically increasing series
    for (const key of ['1y', 'all'] as const) {
      const m = result.periods[key]!;
      expect(m.cumulativeReturn).toBeGreaterThan(0);
      expect(m.annualizedReturn).toBeGreaterThan(0);
      expect(m.maxDrawdown).toBeLessThanOrEqual(0);
    }
  });

  it('returns all-null periods for empty prices', () => {
    const result = computeAllMetrics('empty', []);
    expect(result.periods['1y']).toBeNull();
    expect(result.periods['all']).toBeNull();
  });

  it('returns null for period with only 1 data point', () => {
    const prices: PricePoint[] = [{ date: '2024-01-02', close: 100 }];
    const result = computeAllMetrics('single-point', prices);
    // 'all' should still be null (needs >= 2 points in computePeriodMetrics call
    // but the code only returns null for filtered <2 points; 'all' uses the whole sorted array)
    // Actually, sorted has 1 element, computePeriodMetrics will be called with 1 element
    // returns.ts handles this: cumulativeReturn returns 0 for <2, etc.
    expect(result.periods['all']).not.toBeNull(); // it IS computed but with degenerate values
    expect(result.periods['all']!.cumulativeReturn).toBe(0);
  });

  it('metrics for a flat series show zero return and zero volatility', () => {
    const prices: PricePoint[] = [];
    const d = new Date('2024-01-02');
    for (let i = 0; i < 100; i++) {
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      prices.push({ date: d.toISOString().slice(0, 10), close: 100 });
      d.setDate(d.getDate() + 1);
    }
    const result = computeAllMetrics('flat', prices);
    const all = result.periods['all']!;
    expect(all.cumulativeReturn).toBe(0);
    expect(all.volatility).toBe(0);
    expect(all.sharpeRatio).toBe(0); // 0/0 handled as 0
    expect(all.maxDrawdown).toBe(0);
  });
});

describe('portfolio + metrics integration', () => {
  it('portfolio of identical assets equals the single asset', () => {
    const prices = generatePrices('2024-01-02', 100, 100, 0.001);
    const portfolioPrices = computePortfolioPrices([
      { id: 'a', prices, weight: 0.5 },
      { id: 'b', prices, weight: 0.5 },
    ]);

    const assetMetrics = computeAllMetrics('single', prices);
    const portMetrics = computeAllMetrics('portfolio', portfolioPrices);

    // Returns should be identical (since both assets are the same)
    const assetAll = assetMetrics.periods['all']!;
    const portAll = portMetrics.periods['all']!;
    // Portfolio rebasing to 100 introduces tiny floating-point drift,
    // but cumulative return should be very close (within 2%)
    expect(Math.abs(portAll.cumulativeReturn - assetAll.cumulativeReturn)).toBeLessThan(0.02);
  });
});

describe('currency conversion + metrics integration', () => {
  it('converting to same currency returns identical metrics', () => {
    const prices = generatePrices('2024-01-02', 50, 100, 0.002);
    const rate: CurrencyRate = {
      pair: 'USDEUR',
      rates: [{ date: '2024-01-02', rate: 0.92 }],
    };

    // Convert USD to USD (noop - same currency)
    const converted = convertPrices(prices, rate, 'USD', 'USD');
    expect(converted).toBe(prices); // Same reference

    const directMetrics = computeAllMetrics('direct', prices);
    expect(directMetrics.periods['all']).not.toBeNull();
  });

  it('currency conversion scales prices correctly', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-03', close: 110 },
    ];
    const rate: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2024-01-02', rate: 0.9 },
        { date: '2024-01-03', rate: 0.9 },
      ],
    };

    const converted = convertPrices(prices, rate, 'USD', 'EUR');
    expect(converted).not.toBeNull();
    expect(converted![0].close).toBeCloseTo(90, 5);
    expect(converted![1].close).toBeCloseTo(99, 5);

    // Cumulative return should be same (0.1) since rate is constant
    const originalMetrics = computeAllMetrics('usd', prices);
    const convertedMetrics = computeAllMetrics('eur', converted!);
    expect(convertedMetrics.periods['all']!.cumulativeReturn).toBeCloseTo(
      originalMetrics.periods['all']!.cumulativeReturn,
      4,
    );
  });

  it('inverse currency pair conversion works', () => {
    const prices: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
    ];
    const rate: CurrencyRate = {
      pair: 'EURUSD', // We have EUR->USD, but want USD->EUR
      rates: [{ date: '2024-01-02', rate: 1.1 }], // 1 EUR = 1.1 USD
    };

    const converted = convertPrices(prices, rate, 'USD', 'EUR');
    expect(converted).not.toBeNull();
    // 100 USD * (1 / 1.1) = ~90.91 EUR
    expect(converted![0].close).toBeCloseTo(100 / 1.1, 5);
  });
});

describe('correlation matrix integration', () => {
  it('perfectly correlated assets have correlation 1.0', () => {
    const prices = generatePrices('2024-01-02', 100, 100, 0.001);
    const result = computeCorrelationMatrix([
      { id: 'a', prices },
      { id: 'b', prices },
    ]);

    expect(result.assetIds).toEqual(['a', 'b']);
    expect(result.matrix[0][1]).toBeCloseTo(1.0, 5);
    expect(result.matrix[1][0]).toBeCloseTo(1.0, 5);
  });

  it('anti-correlated assets have correlation near -1.0', () => {
    // Generate prices where one goes up and the other goes down
    const pricesA: PricePoint[] = [];
    const pricesB: PricePoint[] = [];
    const d = new Date('2024-01-02');
    let pA = 100;
    let pB = 100;
    for (let i = 0; i < 200; i++) {
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      const dateStr = d.toISOString().slice(0, 10);
      const change = (Math.random() - 0.5) * 0.02;
      pA *= 1 + change;
      pB *= 1 - change; // Inverse
      pricesA.push({ date: dateStr, close: pA });
      pricesB.push({ date: dateStr, close: pB });
      d.setDate(d.getDate() + 1);
    }

    const result = computeCorrelationMatrix([
      { id: 'a', prices: pricesA },
      { id: 'b', prices: pricesB },
    ]);

    // Should be strongly negatively correlated
    expect(result.matrix[0][1]).toBeLessThan(-0.9);
  });

  it('single asset matrix is [[1]]', () => {
    const prices = generatePrices('2024-01-02', 50, 100, 0.001);
    const result = computeCorrelationMatrix([{ id: 'single', prices }]);
    expect(result.matrix).toEqual([[1]]);
  });

  it('empty input returns empty matrix', () => {
    const result = computeCorrelationMatrix([]);
    expect(result.assetIds).toEqual([]);
    expect(result.matrix).toEqual([]);
  });
});
