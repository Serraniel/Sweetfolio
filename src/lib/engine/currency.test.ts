import { describe, it, expect } from 'vitest';
import { convertPrices } from './currency';
import type { CurrencyRate, PricePoint } from '$lib/types';

describe('convertPrices', () => {
  const usdPrices: PricePoint[] = [
    { date: '2024-01-01', close: 100 },
    { date: '2024-01-02', close: 110 },
    { date: '2024-01-03', close: 105 },
  ];

  const usdeurRate: CurrencyRate = {
    pair: 'USDEUR',
    rates: [
      { date: '2024-01-01', rate: 0.9 },
      { date: '2024-01-02', rate: 0.92 },
      { date: '2024-01-03', rate: 0.91 },
    ],
  };

  it('returns original prices when source and target are the same', () => {
    const result = convertPrices(usdPrices, usdeurRate, 'USD', 'USD');
    expect(result).toBe(usdPrices);
  });

  it('converts prices using direct pair', () => {
    const result = convertPrices(usdPrices, usdeurRate, 'USD', 'EUR');
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(3);
    expect(result![0].close).toBeCloseTo(100 * 0.9, 10);
    expect(result![1].close).toBeCloseTo(110 * 0.92, 10);
    expect(result![2].close).toBeCloseTo(105 * 0.91, 10);
  });

  it('converts prices using inverse pair', () => {
    // We have USDEUR but need EUR->USD
    const eurPrices: PricePoint[] = [
      { date: '2024-01-01', close: 90 },
      { date: '2024-01-02', close: 95 },
    ];
    const result = convertPrices(eurPrices, usdeurRate, 'EUR', 'USD');
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(2);
    // Invert: rate = 1/0.9 for Jan 1
    expect(result![0].close).toBeCloseTo(90 * (1 / 0.9), 10);
    expect(result![1].close).toBeCloseTo(95 * (1 / 0.92), 10);
  });

  it('returns null for unmatched currency pair', () => {
    const gbpRate: CurrencyRate = {
      pair: 'GBPJPY',
      rates: [{ date: '2024-01-01', rate: 180 }],
    };
    const result = convertPrices(usdPrices, gbpRate, 'USD', 'EUR');
    expect(result).toBeNull();
  });

  it('returns null when rate data is empty', () => {
    const emptyRate: CurrencyRate = { pair: 'USDEUR', rates: [] };
    const result = convertPrices(usdPrices, emptyRate, 'USD', 'EUR');
    expect(result).toBeNull();
  });

  it('forward-fills missing rate dates', () => {
    const rateWithGap: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2024-01-01', rate: 0.9 },
        // No rate for Jan 2
        { date: '2024-01-03', rate: 0.91 },
      ],
    };
    const result = convertPrices(usdPrices, rateWithGap, 'USD', 'EUR');
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(3);
    // Jan 2 should use Jan 1 rate (forward-fill)
    expect(result![1].close).toBeCloseTo(110 * 0.9, 10);
    // Jan 3 has its own rate
    expect(result![2].close).toBeCloseTo(105 * 0.91, 10);
  });

  it('uses earliest rate for dates before any rate data', () => {
    const laterRate: CurrencyRate = {
      pair: 'USDEUR',
      rates: [{ date: '2024-01-03', rate: 0.91 }],
    };
    const result = convertPrices(usdPrices, laterRate, 'USD', 'EUR');
    expect(result).not.toBeNull();
    // All dates before Jan 3 fall back to the earliest rate (0.91)
    expect(result![0].close).toBeCloseTo(100 * 0.91, 10);
    expect(result![1].close).toBeCloseTo(110 * 0.91, 10);
  });
});
