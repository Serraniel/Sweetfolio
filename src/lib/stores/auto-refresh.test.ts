import { describe, it, expect } from 'vitest';
import { isAssetStale, getRefreshableAssets } from './auto-refresh';
import type { Asset } from '$lib/types';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'test-id',
    name: 'Test Asset',
    isin: null,
    wkn: null,
    currency: 'EUR',
    prices: [{ date: '2024-01-01', close: 100 }],
    formatConfig: null,
    rawCSV: null,
    rawCSVStoredAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastRefreshedAt: null,
    ...overrides,
  };
}

describe('isAssetStale', () => {
  it('returns true if lastRefreshedAt is null and asset has ISIN', () => {
    expect(isAssetStale(makeAsset({ isin: 'US0378331005' }))).toBe(true);
  });

  it('returns true if lastRefreshedAt is null and asset has WKN', () => {
    expect(isAssetStale(makeAsset({ wkn: 'A0RPWH' }))).toBe(true);
  });

  it('returns false if asset has no ISIN and no WKN', () => {
    expect(isAssetStale(makeAsset())).toBe(false);
  });

  it('returns true if lastRefreshedAt is older than 24h', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isAssetStale(makeAsset({ isin: 'US0378331005', lastRefreshedAt: old }))).toBe(true);
  });

  it('returns false if lastRefreshedAt is within 24h', () => {
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(isAssetStale(makeAsset({ isin: 'US0378331005', lastRefreshedAt: recent }))).toBe(false);
  });
});

describe('getRefreshableAssets', () => {
  it('filters to only stale assets with identifiers', () => {
    const assets: Asset[] = [
      makeAsset({ id: '1', isin: 'US0378331005' }),
      makeAsset({ id: '2', wkn: 'A0RPWH', lastRefreshedAt: new Date().toISOString() }),
      makeAsset({ id: '3' }),
    ];
    const result = getRefreshableAssets(assets);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});
