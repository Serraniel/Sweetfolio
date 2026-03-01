import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNeededPairs } from './currency-auto-fetch';
import type { Asset, CurrencyRate } from '$lib/types';

function makeAsset(currency: string): Asset {
  return {
    id: crypto.randomUUID(),
    name: 'Test',
    isin: null,
    wkn: null,
    currency,
    classification: 'unknown',
    prices: [{ date: '2024-01-01', close: 100 }],
    formatConfig: null,
    rawCSV: null,
    rawCSVStoredAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastRefreshedAt: null,
  };
}

describe('getNeededPairs', () => {
  it('returns pairs for foreign currencies when mainCurrency is EUR', () => {
    const assets = [makeAsset('USD'), makeAsset('GBP'), makeAsset('EUR')];
    const existing: CurrencyRate[] = [];
    const pairs = getNeededPairs(assets, 'EUR', existing);
    expect(pairs).toContain('USDEUR');
    expect(pairs).toContain('GBPEUR');
    expect(pairs).not.toContain('EUREUR');
  });

  it('returns EUR-based pairs needed for cross-rate when mainCurrency is USD', () => {
    const assets = [makeAsset('GBP'), makeAsset('USD')];
    const existing: CurrencyRate[] = [];
    const pairs = getNeededPairs(assets, 'USD', existing);
    expect(pairs).toContain('GBPEUR');
    expect(pairs).toContain('USDEUR');
  });

  it('deduplicates pairs', () => {
    const assets = [makeAsset('USD'), makeAsset('USD'), makeAsset('USD')];
    const pairs = getNeededPairs(assets, 'EUR', []);
    expect(pairs).toEqual(['USDEUR']);
  });

  it('skips pairs that already have fresh rates', () => {
    const assets = [makeAsset('USD')];
    const existing: CurrencyRate[] = [
      { pair: 'USDEUR', rates: [{ date: '2025-01-02', rate: 1.04 }] },
    ];
    const pairs = getNeededPairs(assets, 'EUR', existing);
    expect(pairs).toContain('USDEUR');
  });

  it('returns empty when all assets match mainCurrency', () => {
    const assets = [makeAsset('EUR'), makeAsset('EUR')];
    const pairs = getNeededPairs(assets, 'EUR', []);
    expect(pairs).toEqual([]);
  });
});
