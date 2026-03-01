import { describe, it, expect } from 'vitest';
import { deriveCrossRate, mergeRates } from './cross-rate';
import type { CurrencyRate } from '$lib/types';

describe('deriveCrossRate', () => {
  it('computes cross-rate from two EUR-based rates', () => {
    const gbpEur: CurrencyRate = {
      pair: 'GBPEUR',
      rates: [
        { date: '2025-01-02', rate: 0.84 },
        { date: '2025-01-03', rate: 0.85 },
      ],
    };
    const usdEur: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2025-01-02', rate: 1.04 },
        { date: '2025-01-03', rate: 1.05 },
      ],
    };

    const result = deriveCrossRate(gbpEur, usdEur, 'GBPUSD');

    expect(result.pair).toBe('GBPUSD');
    expect(result.rates).toHaveLength(2);
    expect(result.rates[0].rate).toBeCloseTo(0.84 / 1.04, 8);
    expect(result.rates[1].rate).toBeCloseTo(0.85 / 1.05, 8);
  });

  it('only includes dates present in both rate series', () => {
    const gbpEur: CurrencyRate = {
      pair: 'GBPEUR',
      rates: [
        { date: '2025-01-02', rate: 0.84 },
        { date: '2025-01-03', rate: 0.85 },
        { date: '2025-01-06', rate: 0.86 },
      ],
    };
    const usdEur: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2025-01-02', rate: 1.04 },
        { date: '2025-01-06', rate: 1.06 },
      ],
    };

    const result = deriveCrossRate(gbpEur, usdEur, 'GBPUSD');
    expect(result.rates).toHaveLength(2);
    expect(result.rates[0].date).toBe('2025-01-02');
    expect(result.rates[1].date).toBe('2025-01-06');
  });

  it('returns empty rates when no dates overlap', () => {
    const a: CurrencyRate = { pair: 'GBPEUR', rates: [{ date: '2025-01-02', rate: 0.84 }] };
    const b: CurrencyRate = { pair: 'USDEUR', rates: [{ date: '2025-01-06', rate: 1.06 }] };
    const result = deriveCrossRate(a, b, 'GBPUSD');
    expect(result.rates).toHaveLength(0);
  });
});

describe('mergeRates', () => {
  it('merges two rate arrays, existing rates take priority on overlapping dates', () => {
    const existing: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2025-01-02', rate: 1.04 },
        { date: '2025-01-03', rate: 1.05 },
      ],
    };
    const fetched: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2025-01-03', rate: 9.99 },
        { date: '2025-01-06', rate: 1.06 },
      ],
    };

    const result = mergeRates(existing, fetched);
    expect(result.pair).toBe('USDEUR');
    expect(result.rates).toHaveLength(3);
    expect(result.rates.find((r) => r.date === '2025-01-03')?.rate).toBe(1.05);
    expect(result.rates.find((r) => r.date === '2025-01-06')?.rate).toBe(1.06);
  });

  it('returns all fetched rates when existing is empty', () => {
    const existing: CurrencyRate = { pair: 'USDEUR', rates: [] };
    const fetched: CurrencyRate = {
      pair: 'USDEUR',
      rates: [{ date: '2025-01-02', rate: 1.04 }],
    };
    const result = mergeRates(existing, fetched);
    expect(result.rates).toHaveLength(1);
  });

  it('sorts merged rates by date', () => {
    const existing: CurrencyRate = {
      pair: 'USDEUR',
      rates: [{ date: '2025-01-06', rate: 1.06 }],
    };
    const fetched: CurrencyRate = {
      pair: 'USDEUR',
      rates: [{ date: '2025-01-02', rate: 1.04 }],
    };
    const result = mergeRates(existing, fetched);
    expect(result.rates[0].date).toBe('2025-01-02');
    expect(result.rates[1].date).toBe('2025-01-06');
  });
});
