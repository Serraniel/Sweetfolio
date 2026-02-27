import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import type { Asset, Portfolio, CurrencyRate, StoredSimulation } from '$lib/types';

// We must reset the indexedDB between tests.
// fake-indexeddb/auto patches the global indexedDB.
// We need to re-import modules fresh each test to reset the singleton db.

// Since the storage modules cache the db instance, we use dynamic imports
// and reset indexedDB state between tests.

async function resetDB() {
  // Delete the database between tests
  const deleteRequest = indexedDB.deleteDatabase('sweetfolio');
  await new Promise<void>((resolve, reject) => {
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
}

describe('Storage: assets', () => {
  beforeEach(async () => {
    await resetDB();
    // Reset the cached db instance by re-importing
    const dbModule = await import('./db');
    // Access the internal state - we need to reset the cached instance
    // Since we can't easily reset the module, we work around it
    // by just deleting and recreating
  });

  it('CRUD operations on assets', async () => {
    // Dynamic import to get fresh module references after DB reset
    const { getDB } = await import('./db');
    const assetsModule = await import('./assets');

    // Force a new DB connection by getting the DB
    await getDB();

    const asset: Asset = {
      id: 'test-1',
      name: 'Test Asset',
      isin: 'US1234567890',
      wkn: null,
      currency: 'USD',
      prices: [
        { date: '2024-01-01', close: 100 },
        { date: '2024-01-02', close: 110 },
      ],
      formatConfig: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    // Put
    await assetsModule.put(asset);

    // GetAll
    const all = await assetsModule.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Test Asset');

    // GetById
    const found = await assetsModule.getById('test-1');
    expect(found).toBeDefined();
    expect(found!.id).toBe('test-1');

    // Update (put again)
    const updated = { ...asset, name: 'Updated Asset' };
    await assetsModule.put(updated);
    const afterUpdate = await assetsModule.getById('test-1');
    expect(afterUpdate!.name).toBe('Updated Asset');

    // Remove
    await assetsModule.remove('test-1');
    const afterRemove = await assetsModule.getById('test-1');
    expect(afterRemove).toBeUndefined();
  });
});

describe('Storage: portfolios', () => {
  it('CRUD operations on portfolios', async () => {
    const { getDB } = await import('./db');
    const portfolioModule = await import('./portfolios');
    await getDB();

    const portfolio: Portfolio = {
      id: 'port-1',
      name: 'My Portfolio',
      allocations: [
        { assetId: 'a1', weight: 0.6 },
        { assetId: 'a2', weight: 0.4 },
      ],
      isBenchmark: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    await portfolioModule.put(portfolio);
    const all = await portfolioModule.getAll();
    expect(all.length).toBeGreaterThanOrEqual(1);

    const found = await portfolioModule.getById('port-1');
    expect(found).toBeDefined();
    expect(found!.allocations).toHaveLength(2);

    await portfolioModule.remove('port-1');
    const afterRemove = await portfolioModule.getById('port-1');
    expect(afterRemove).toBeUndefined();
  });
});

describe('Storage: currencies', () => {
  it('CRUD operations on currencies', async () => {
    const { getDB } = await import('./db');
    const currModule = await import('./currencies');
    await getDB();

    const rate: CurrencyRate = {
      pair: 'USDEUR',
      rates: [
        { date: '2024-01-01', rate: 0.9 },
        { date: '2024-01-02', rate: 0.92 },
      ],
    };

    await currModule.put(rate);
    const all = await currModule.getAll();
    expect(all.length).toBeGreaterThanOrEqual(1);

    const found = await currModule.getByPair('USDEUR');
    expect(found).toBeDefined();
    expect(found!.rates).toHaveLength(2);

    await currModule.remove('USDEUR');
    const afterRemove = await currModule.getByPair('USDEUR');
    expect(afterRemove).toBeUndefined();
  });
});

describe('Storage: settings', () => {
  it('CRUD operations on settings', async () => {
    const { getDB } = await import('./db');
    const settingsModule = await import('./settings');
    await getDB();

    await settingsModule.set('mainCurrency', 'EUR');
    const val = await settingsModule.get('mainCurrency');
    expect(val).toBe('EUR');

    const all = await settingsModule.getAll();
    expect(all['mainCurrency']).toBe('EUR');

    await settingsModule.set('mainCurrency', 'USD');
    const updated = await settingsModule.get('mainCurrency');
    expect(updated).toBe('USD');

    await settingsModule.remove('mainCurrency');
    const afterRemove = await settingsModule.get('mainCurrency');
    expect(afterRemove).toBeUndefined();
  });
});

describe('Storage: simulations', () => {
  it('CRUD operations on simulations', async () => {
    const { getDB } = await import('./db');
    const simModule = await import('./simulations');
    await getDB();

    const sim: StoredSimulation = {
      id: 'sim-1',
      config: {
        simulationCount: 1000,
        assetIds: ['a1', 'a2'],
        riskFreeRate: 0,
        benchmarkPortfolioId: null,
      },
      results: {
        portfolios: [],
        efficientFrontier: [],
      },
      createdAt: '2024-01-01T00:00:00Z',
    };

    await simModule.put(sim);
    const all = await simModule.getAll();
    expect(all.length).toBeGreaterThanOrEqual(1);

    const found = await simModule.getById('sim-1');
    expect(found).toBeDefined();
    expect(found!.config.simulationCount).toBe(1000);

    await simModule.remove('sim-1');
    const afterRemove = await simModule.getById('sim-1');
    expect(afterRemove).toBeUndefined();
  });
});
