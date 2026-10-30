import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeAsset, normalizePortfolio, normalizeSettings } from '#lib/domain/normalize.ts';
import { closeDB, DB_NAME, deleteDatabase, req } from './db.ts';
import { batch, clearAll, getAll, getSettings, put, remove, setSettings } from './repo.ts';

async function createLegacyDB(version: number, setup: (db: IDBDatabase) => void, seed: (tx: IDBTransaction) => void) {
	await new Promise<void>((resolve, reject) => {
		const r = indexedDB.open(DB_NAME, version);
		r.onupgradeneeded = () => {
			setup(r.result);
			seed(r.transaction!);
		};
		r.onsuccess = () => {
			r.result.close();
			resolve();
		};
		r.onerror = () => reject(r.error);
	});
}

beforeEach(async () => {
	await deleteDatabase();
});
afterEach(async () => {
	await closeDB();
});

describe('DP-1 upgrade from v0.5.x (IndexedDB v2)', () => {
	it('keeps data, adds new stores and back-fills portfolio fields', async () => {
		await createLegacyDB(
			2,
			(db) => {
				const a = db.createObjectStore('assets', { keyPath: 'id' });
				a.createIndex('by-isin', 'isin');
				a.createIndex('by-name', 'name');
				db.createObjectStore('portfolios', { keyPath: 'id' }).createIndex('by-name', 'name');
				db.createObjectStore('currencies', { keyPath: 'pair' });
				db.createObjectStore('settings', { keyPath: 'key' });
				db.createObjectStore('simulations', { keyPath: 'id' });
			},
			(tx) => {
				tx.objectStore('assets').put({
					id: 'a1',
					name: 'World',
					isin: 'IE00B4L5Y983',
					wkn: null,
					currency: 'EUR',
					prices: [{ date: '2024-01-02', close: 1 }],
					formatConfig: null,
					createdAt: 'x',
					updatedAt: 'x'
				});
				tx.objectStore('portfolios').put({
					id: 'p1',
					name: 'P',
					allocations: [{ assetId: 'a1', weight: 1 }],
					isBenchmark: true,
					createdAt: 'x',
					updatedAt: 'x'
				});
				tx.objectStore('settings').put({ key: 'mainCurrency', value: 'USD' });
				tx.objectStore('settings').put({ key: 'riskFreeRate', value: 2 });
			}
		);
		const assets = await getAll('assets');
		expect(assets[0]!.classification).toBe('unknown');
		const portfolios = await getAll('portfolios');
		expect(portfolios[0]).toMatchObject({ mode: 'model', trackCash: false, cashCurrency: 'EUR', isBenchmark: true });
		expect(await getAll('transactions')).toEqual([]);
		expect(await getAll('strategies')).toEqual([]);
		const s = normalizeSettings(await getSettings());
		expect(s).toMatchObject({ mainCurrency: 'USD', riskFreeRate: 2, autoRefreshAssets: true });
	});

	it('upgrades from the epic branch (v4) without data loss', async () => {
		await createLegacyDB(
			4,
			(db) => {
				for (const n of ['assets', 'portfolios', 'strategies', 'transactions', 'simulations']) db.createObjectStore(n, { keyPath: 'id' });
				db.createObjectStore('currencies', { keyPath: 'pair' });
				db.createObjectStore('settings', { keyPath: 'key' });
			},
			(tx) => {
				tx.objectStore('transactions').put({
					id: 't1',
					portfolioId: 'p1',
					type: 'buy',
					assetId: 'a1',
					date: '2024-01-01',
					quantity: 1,
					price: 1,
					fee: 0,
					amount: null,
					withholdingTax: 0,
					currency: 'EUR',
					notes: '',
					createdAt: 'x',
					updatedAt: 'x'
				});
				tx.objectStore('strategies').put({
					id: 's1',
					name: 'S',
					root: { type: 'group', id: 'r', label: 'R', weight: 1, children: [] },
					generatedPortfolioIds: [],
					createdAt: 'x',
					updatedAt: 'x'
				});
			}
		);
		expect(await getAll('transactions')).toHaveLength(1);
		expect(await getAll('strategies')).toHaveLength(1);
		const db = await (await import('./db.ts')).openDB();
		expect(Array.from(db.transaction('transactions').objectStore('transactions').indexNames)).toContain('by-portfolioId');
	});
});

describe('repo', () => {
	it('CRUD, batch and settings', async () => {
		await put('portfolios', normalizePortfolio({ id: 'p1', name: 'A' }));
		await batch([
			{ store: 'assets', put: [normalizeAsset({ id: 'a1' })] },
			{ store: 'portfolios', delete: ['p1'] }
		]);
		expect(await getAll('portfolios')).toEqual([]);
		expect(await getAll('assets')).toHaveLength(1);
		await setSettings({ mainCurrency: 'CHF' });
		expect((await getSettings()).mainCurrency).toBe('CHF');
		await remove('assets', 'a1');
		expect(await getAll('assets')).toEqual([]);
		await setSettings({ x: 1 });
		await clearAll();
		expect(await getSettings()).toEqual({});
	});
});

describe('P-11 normalization', () => {
	it('fills defaults for legacy records', () => {
		const a = normalizeAsset({
			id: 'a',
			name: 'X',
			prices: [
				{ date: '2024-01-03', close: 2 },
				{ date: '2024-01-02', close: 1 },
				{ date: 'bad', close: 1 }
			]
		});
		expect(a.prices.map((p) => p.date)).toEqual(['2024-01-02', '2024-01-03']);
		expect(a).toMatchObject({ classification: 'unknown', rawCSV: null, lastRefreshedAt: null });
		const p = normalizePortfolio({
			id: 'p',
			allocations: [
				{ assetId: 'a', weight: 0 },
				{ assetId: 'b', weight: 0.5 }
			]
		});
		expect(p.allocations).toEqual([{ assetId: 'b', weight: 0.5 }]);
		expect(normalizeSettings({ riskFreeRate: '2.5', benchmark: { type: 'x', id: 1 } })).toMatchObject({
			riskFreeRate: 2.5,
			benchmark: null
		});
	});
});
