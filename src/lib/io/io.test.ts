import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asset, tx } from '#test/fixtures.ts';
import { deleteDatabase, closeDB } from '#lib/storage/db.ts';
import { putMany, setSettings } from '#lib/storage/repo.ts';
import { normalizePortfolio } from '#lib/domain/normalize.ts';
import { parseTransactionCSV } from '#lib/parsers/transactions-csv.ts';
import { backupBlob } from './export.ts';
import { countReport, detectConflicts, itemsToWrite, stableStringify } from './conflicts.ts';
import { mapExternalImport } from './external-mapping.ts';
import { exportPortfolioPerformanceCSV } from './pp-export.ts';
import { buildAIExport } from './ai-export.ts';
import { CURRENT_VERSION, migrateExport, parseBackup } from './schema.ts';

beforeEach(() => deleteDatabase());
afterEach(() => closeDB());

const empty = { assets: [], portfolios: [], strategies: [], transactions: [], currencies: [], simulations: [], settings: {} };

describe('DP-2 backup export', () => {
	it('round-trips through parseBackup and strips private/bulky data', async () => {
		await putMany('assets', [asset({ id: 'a1', rawCSV: 'x', rawCSVStoredAt: 'y', prices: [{ date: '2024-01-02', close: 1 }] })]);
		await putMany('portfolios', [normalizePortfolio({ id: 'p1', name: 'P', allocations: [{ assetId: 'a1', weight: 1 }] })]);
		await setSettings({ mainCurrency: 'USD', parqetTokens: { accessToken: 'secret' } });
		const blob = await backupBlob(['assets', 'portfolios', 'settings', 'transactions']);
		const text = await blob.text();
		expect(text).not.toContain('secret');
		const parsed = parseBackup(text);
		expect(parsed.version).toBe(CURRENT_VERSION);
		expect(parsed.data.assets![0]).toMatchObject({ id: 'a1', rawCSV: null });
		expect(parsed.data.settings).toEqual({ mainCurrency: 'USD' });
		expect(parsed.data.transactions).toEqual([]);
	});
});

describe('DP-3 import migration', () => {
	it('upgrades v1 exports (classification, modes)', () => {
		const m = migrateExport({
			format: 'sweetfolio',
			version: 1,
			exportedAt: 'x',
			scopes: ['assets', 'portfolios'],
			data: {
				assets: [{ id: 'a', name: 'A' } as never],
				portfolios: [{ id: 'p', name: 'P', allocations: [], isBenchmark: false } as never]
			}
		});
		expect(m.data.assets![0]!.classification).toBe('unknown');
		expect(m.data.portfolios![0]!.mode).toBe('model');
	});
	it('rejects newer versions and invalid files', () => {
		expect(() => parseBackup(JSON.stringify({ format: 'sweetfolio', version: 99, data: {} }))).toThrow(/newer/);
		expect(() => parseBackup('nope')).toThrow(/JSON/);
		expect(() => parseBackup('{}')).toThrow(/not a Sweetfolio/);
	});
});

describe('DP-3 conflicts', () => {
	it('separates new, unchanged and conflicting items', () => {
		const existingAsset = asset({ id: 'a1', name: 'Old', lastRefreshedAt: '2024-01-01' });
		const report = detectConflicts(
			{
				assets: [asset({ id: 'a1', name: 'New' }), asset({ id: 'a2' })],
				portfolios: [normalizePortfolio({ id: 'p1', name: 'P', createdAt: 'c', updatedAt: 'u' })],
				settings: { mainCurrency: 'EUR', riskFreeRate: 1 }
			},
			{
				...empty,
				assets: [existingAsset],
				portfolios: [normalizePortfolio({ id: 'p1', name: 'P', createdAt: 'c', updatedAt: 'u' })],
				settings: { mainCurrency: 'USD' }
			}
		);
		expect(report.assets.added).toHaveLength(1);
		expect(report.assets.conflicts[0]!.label).toBe('New');
		expect(report.portfolios.unchanged).toBe(1);
		expect(report.settings.added).toHaveLength(1);
		expect(report.settings.conflicts).toHaveLength(1);
		expect(countReport(report)).toEqual({ added: 2, conflicts: 2, unchanged: 1 });
		report.assets.conflicts[0]!.resolution = 'replace';
		expect(itemsToWrite(report).assets).toHaveLength(2);
	});
	it('stable stringify ignores key order', () => {
		expect(stableStringify({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(stableStringify({ b: [1, { d: 3, c: 2 }], a: 1 }));
	});
});

describe('EX-4 external mapping', () => {
	const ext = parseTransactionCSV(
		'Datum;Typ;Wertpapier;ISIN;Stück;Kurs;Betrag;Gebühren\n15.01.2024;Kauf;World;IE00B4L5Y983;5;200,00;-1000;0\n15.01.2024;Kauf;Apple;US0378331005;1;100,00;-100;0\n',
		'Broker'
	);
	it('matches existing assets by ISIN and creates the rest', () => {
		const r = mapExternalImport(ext, { existingAssets: [asset({ id: 'mine', isin: 'IE00B4L5Y983' })], now: 'n' });
		expect(r.matchedAssets).toBe(1);
		expect(r.newAssets).toBe(1);
		expect(r.data.portfolios![0]).toMatchObject({ name: 'Broker', mode: 'tracked' });
		expect(r.data.transactions!.map((t) => t.assetId)).toContain('mine');
		// Deterministic ids make re-imports detectable as unchanged.
		const again = mapExternalImport(ext, { existingAssets: [asset({ id: 'mine', isin: 'IE00B4L5Y983' })], now: 'n' });
		expect(again.data.transactions!.map((t) => t.id)).toEqual(r.data.transactions!.map((t) => t.id));
	});
	it('can target an existing portfolio', () => {
		const r = mapExternalImport(ext, { existingAssets: [], targetPortfolioId: 'p9' });
		expect(r.data.portfolios).toEqual([]);
		expect(r.data.transactions!.every((t) => t.portfolioId === 'p9')).toBe(true);
	});
});

describe('EX-6 Portfolio Performance CSV export', () => {
	it('writes portfolio and account transactions with PP semantics', () => {
		const p = normalizePortfolio({ id: 'p1', name: 'Depot' });
		const a = asset({ id: 'a1', name: 'World; Inc', isin: 'IE00B4L5Y983' });
		const files = exportPortfolioPerformanceCSV(
			[p],
			[a],
			[
				tx({ portfolioId: 'p1', type: 'buy', date: '2024-01-02', assetId: 'a1', quantity: 2, price: 10.5, fee: 1 }),
				tx({ portfolioId: 'p1', type: 'dividend', date: '2024-02-02', assetId: 'a1', amount: 5, withholdingTax: 1 }),
				tx({ portfolioId: 'other', type: 'buy', date: '2024-01-02', quantity: 1, price: 1 })
			]
		);
		const buy = files.portfolioTransactions.split('\n')[1]!;
		expect(buy).toBe('2024-01-02;Buy;"World; Inc";IE00B4L5Y983;;;2;22;1;0;EUR;Depot;Depot (Cash);');
		const div = files.accountTransactions.split('\n')[1]!;
		expect(div.startsWith('2024-02-02;Dividend;4;EUR;1;0;')).toBe(true);
		expect(files.portfolioTransactions.trim().split('\n')).toHaveLength(2);
	});
});

describe('EX-7 AI export', () => {
	it('is self-describing with holdings and transactions', () => {
		const p = normalizePortfolio({ id: 'p1', name: 'Depot', mode: 'tracked' });
		const a = asset({ id: 'a1', name: 'World', prices: [{ date: '2024-01-02', close: 12 }] });
		const r = buildAIExport([p], [a], [tx({ portfolioId: 'p1', type: 'buy', date: '2024-01-02', assetId: 'a1', quantity: 2, price: 10 })]);
		expect(r.format).toBe('sweetfolio-ai');
		expect(r.data.portfolios[0]!.holdings[0]).toMatchObject({ assetName: 'World', quantity: 2, marketValue: 24 });
		expect(r.data.assets[0]).toMatchObject({ latestPrice: 12, latestPriceDate: '2024-01-02' });
		expect(r.data.assets[0]!.priceHistory).toBeUndefined();
	});
});
