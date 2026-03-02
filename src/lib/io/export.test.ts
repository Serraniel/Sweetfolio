import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { buildExport } from './export';
import { CURRENT_VERSION } from './schema';
import type { Asset, Strategy } from '$lib/types';

async function resetDB() {
  const req = indexedDB.deleteDatabase('sweetfolio');
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe('buildExport', () => {
  beforeEach(async () => {
    await resetDB();
  });

  it('exports selected scopes only', async () => {
    const { getDB } = await import('$lib/storage/db');
    const assetsDb = await import('$lib/storage/assets');
    await getDB();

    const asset: Asset = {
      id: 'a1',
      name: 'Test',
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
    };
    await assetsDb.put(asset);

    const result = await buildExport(['assets']);
    expect(result.format).toBe('sweetfolio');
    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.scopes).toEqual(['assets']);
    expect(result.data.assets).toHaveLength(1);
    expect(result.data.portfolios).toBeUndefined();
    expect(result.data.strategies).toBeUndefined();
    expect(result.data.settings).toBeUndefined();
    expect(result.data.currencies).toBeUndefined();
    expect(result.data.simulations).toBeUndefined();
    expect(result.data.transactions).toBeUndefined();
  });

  it('exports multiple scopes', async () => {
    const { getDB } = await import('$lib/storage/db');
    await getDB();

    const result = await buildExport(['assets', 'portfolios', 'strategies', 'settings']);
    expect(result.scopes).toEqual(['assets', 'portfolios', 'strategies', 'settings']);
    expect(result.data.assets).toBeDefined();
    expect(result.data.portfolios).toBeDefined();
    expect(result.data.strategies).toBeDefined();
    expect(result.data.settings).toBeDefined();
  });

  it('exports strategies scope', async () => {
    const { getDB } = await import('$lib/storage/db');
    const strategiesDb = await import('$lib/storage/strategies');
    await getDB();

    const strategy: Strategy = {
      id: 's1',
      name: 'Test Strategy',
      root: {
        type: 'group',
        id: 'root',
        label: 'Root',
        weight: 1,
        children: [
          { type: 'leaf', id: 'l1', assetId: 'a1', weight: 0.6 },
          { type: 'leaf', id: 'l2', assetId: 'a2', weight: 0.4 },
        ],
      },
      generatedPortfolioIds: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    await strategiesDb.put(strategy);

    const result = await buildExport(['strategies']);
    expect(result.scopes).toEqual(['strategies']);
    expect(result.data.strategies).toHaveLength(1);
    expect(result.data.strategies![0].name).toBe('Test Strategy');
    expect(result.data.strategies![0].root.children).toHaveLength(2);
  });

  it('sets exportedAt to a valid ISO string', async () => {
    const { getDB } = await import('$lib/storage/db');
    await getDB();

    const result = await buildExport(['assets']);
    expect(new Date(result.exportedAt).toISOString()).toBe(result.exportedAt);
  });
});
