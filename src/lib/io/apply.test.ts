import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { applyImport } from './apply';
import type { Asset, Strategy } from '$lib/types';
import type { ConflictReport } from './conflicts';

async function resetDB() {
  const req = indexedDB.deleteDatabase('sweetfolio');
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function emptyReport(): ConflictReport {
  return {
    assets: { newItems: [], conflicts: [] },
    portfolios: { newItems: [], conflicts: [] },
    strategies: { newItems: [], conflicts: [] },
    currencies: { newItems: [], conflicts: [] },
    simulations: { newItems: [], conflicts: [] },
    settings: { newItems: [], conflicts: [] },
  };
}

describe('applyImport', () => {
  beforeEach(async () => {
    await resetDB();
  });

  it('writes new assets to IndexedDB', async () => {
    const { getDB } = await import('$lib/storage/db');
    const assetsDb = await import('$lib/storage/assets');
    await getDB();

    const asset: Asset = {
      id: 'new-1',
      name: 'Imported',
      isin: null,
      wkn: null,
      currency: 'EUR',
      prices: [],
      formatConfig: null,
      rawCSV: null,
      rawCSVStoredAt: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastRefreshedAt: null,
    };

    const report = { ...emptyReport(), assets: { newItems: [asset], conflicts: [] } };
    await applyImport(report);

    const all = await assetsDb.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('new-1');
  });

  it('writes new strategies to IndexedDB', async () => {
    const { getDB } = await import('$lib/storage/db');
    const strategiesDb = await import('$lib/storage/strategies');
    await getDB();

    const strategy: Strategy = {
      id: 's1',
      name: 'Imported Strategy',
      root: {
        type: 'group',
        id: 'root',
        label: 'Root',
        weight: 1,
        children: [
          { type: 'leaf', id: 'l1', assetId: 'a1', weight: 0.5 },
          { type: 'leaf', id: 'l2', assetId: 'a2', weight: 0.5 },
        ],
      },
      generatedPortfolioIds: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    const report = { ...emptyReport(), strategies: { newItems: [strategy], conflicts: [] } };
    await applyImport(report);

    const all = await strategiesDb.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Imported Strategy');
    expect(all[0].root.children).toHaveLength(2);
  });

  it('writes replaced conflicts to IndexedDB', async () => {
    const { getDB } = await import('$lib/storage/db');
    const assetsDb = await import('$lib/storage/assets');
    await getDB();

    const existing: Asset = {
      id: 'a1',
      name: 'Old',
      isin: null,
      wkn: null,
      currency: 'EUR',
      prices: [],
      formatConfig: null,
      rawCSV: null,
      rawCSVStoredAt: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastRefreshedAt: null,
    };
    await assetsDb.put(existing);

    const imported: Asset = { ...existing, name: 'New' };
    const report = {
      ...emptyReport(),
      assets: { newItems: [], conflicts: [{ existing, imported, resolution: 'replace' as const }] },
    };

    await applyImport(report);

    const found = await assetsDb.getById('a1');
    expect(found!.name).toBe('New');
  });

  it('skips conflicts with keep or skip resolution', async () => {
    const { getDB } = await import('$lib/storage/db');
    const assetsDb = await import('$lib/storage/assets');
    await getDB();

    const existing: Asset = {
      id: 'a1',
      name: 'Old',
      isin: null,
      wkn: null,
      currency: 'EUR',
      prices: [],
      formatConfig: null,
      rawCSV: null,
      rawCSVStoredAt: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastRefreshedAt: null,
    };
    await assetsDb.put(existing);

    const imported: Asset = { ...existing, name: 'New' };
    const report = {
      ...emptyReport(),
      assets: { newItems: [], conflicts: [{ existing, imported, resolution: 'keep' as const }] },
    };

    await applyImport(report);

    const found = await assetsDb.getById('a1');
    expect(found!.name).toBe('Old');
  });

  it('writes new settings', async () => {
    const { getDB } = await import('$lib/storage/db');
    const settingsDb = await import('$lib/storage/settings');
    await getDB();

    const report = {
      ...emptyReport(),
      settings: {
        newItems: [{ key: 'mainCurrency', value: 'USD' }],
        conflicts: [],
      },
    };

    await applyImport(report);

    const val = await settingsDb.get('mainCurrency');
    expect(val).toBe('USD');
  });
});
