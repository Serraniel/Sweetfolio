import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { applyImport } from './apply';
import type { Asset } from '$lib/types';
import type { ConflictReport } from './conflicts';

async function resetDB() {
  const req = indexedDB.deleteDatabase('sweetfolio');
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
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

    const report: ConflictReport = {
      assets: { newItems: [asset], conflicts: [] },
      portfolios: { newItems: [], conflicts: [] },
      currencies: { newItems: [], conflicts: [] },
      simulations: { newItems: [], conflicts: [] },
      settings: { newItems: [], conflicts: [] },
    };

    await applyImport(report);

    const all = await assetsDb.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('new-1');
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
    const report: ConflictReport = {
      assets: { newItems: [], conflicts: [{ existing, imported, resolution: 'replace' }] },
      portfolios: { newItems: [], conflicts: [] },
      currencies: { newItems: [], conflicts: [] },
      simulations: { newItems: [], conflicts: [] },
      settings: { newItems: [], conflicts: [] },
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
    const report: ConflictReport = {
      assets: { newItems: [], conflicts: [{ existing, imported, resolution: 'keep' }] },
      portfolios: { newItems: [], conflicts: [] },
      currencies: { newItems: [], conflicts: [] },
      simulations: { newItems: [], conflicts: [] },
      settings: { newItems: [], conflicts: [] },
    };

    await applyImport(report);

    const found = await assetsDb.getById('a1');
    expect(found!.name).toBe('Old');
  });

  it('writes new settings', async () => {
    const { getDB } = await import('$lib/storage/db');
    const settingsDb = await import('$lib/storage/settings');
    await getDB();

    const report: ConflictReport = {
      assets: { newItems: [], conflicts: [] },
      portfolios: { newItems: [], conflicts: [] },
      currencies: { newItems: [], conflicts: [] },
      simulations: { newItems: [], conflicts: [] },
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
