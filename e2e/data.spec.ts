import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import LZString from 'lz-string';
import { dismissHint, germanCsv, offline, uploadCsv } from './helpers.ts';

test.beforeEach(async ({ page }) => {
	await offline(page);
	await dismissHint(page);
});

test('DP-2/DP-3 backup round trip into a fresh browser', async ({ page, browser }) => {
	await uploadCsv(page, [{ name: 'Alpha.csv', content: germanCsv(300) }]);
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Export', exact: true }).first().click();
	const download = page.waitForEvent('download');
	await page.evaluate(() => {
		// Force the anchor-download fallback (no native save dialog in tests).
		delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
	});
	await page.getByRole('dialog').getByRole('button', { name: 'Export' }).click();
	const file = await (await download).path();
	const json = JSON.parse(readFileSync(file, 'utf-8'));
	expect(json).toMatchObject({ format: 'sweetfolio', version: 5 });
	expect(json.data.assets[0].name).toBe('Alpha');

	const ctx = await browser.newContext();
	const fresh = await ctx.newPage();
	await offline(fresh);
	await fresh.goto('/settings');
	await fresh.getByRole('button', { name: 'Import', exact: true }).first().click();
	await fresh.getByRole('dialog').locator('input[type=file]').setInputFiles(file);
	await fresh.getByRole('dialog').getByRole('button', { name: 'Review' }).click();
	await expect(fresh.getByRole('dialog')).toContainText('new');
	await fresh.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
	await expect(fresh.getByRole('dialog')).toContainText('Import finished');
	await fresh.goto('/assets');
	await expect(fresh.getByRole('link', { name: /Alpha/ })).toBeVisible();
	await ctx.close();
});

test('EX-2 Parqet CSV import creates a tracked portfolio', async ({ page }) => {
	await page.goto('/settings');
	await page.getByRole('button', { name: 'Import', exact: true }).first().click();
	const csv = [
		'datetime;date;time;price;shares;amount;tax;fee;realizedgains;type;broker;isin;wkn;originalcurrency;currency;fxrate;holding;holdingname;holdingnickname;exchange;avgholdingperiod',
		'2024-01-01T09:00:00.000Z;01.01.2024;09:00;0;0;1000;0;0;0;Deposit;X;;;EUR;EUR;1;;;;;',
		'2024-01-15T09:00:00.000Z;15.01.2024;09:00;80,5;10;805;0;1;0;Buy;X;IE00B4L5Y983;A0RPWH;EUR;EUR;1;h1;iShares Core MSCI World;;XETRA;'
	].join('\n');
	const d = page.getByRole('dialog');
	await d.locator('input[type=file]').setInputFiles({ name: 'parqet.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
	await expect(d).toContainText('Parqet CSV');
	await d.getByLabel('Portfolio name').fill('From Parqet');
	await d.getByRole('button', { name: 'Review' }).click();
	await d.getByRole('button', { name: 'Import' }).click();
	await expect(d).toContainText('Import finished');
	await page.goto('/portfolios');
	await page.getByRole('link', { name: /From Parqet/ }).click();
	await page.getByRole('radio', { name: 'Transactions' }).click();
	await expect(page.locator('.tx-list li')).toHaveCount(2);
});

test('P-11 data from v0.5.x (IndexedDB v2) loads and the legacy benchmark is adopted', async ({ page }) => {
	// Seed from a static file on the same origin so the app has no open connection.
	await page.goto('/config.json');
	await page.evaluate(async () => {
		await new Promise<void>((resolve, reject) => {
			const del = indexedDB.deleteDatabase('sweetfolio');
			del.onsuccess = () => resolve();
			del.onerror = () => reject(del.error);
		});
		await new Promise<void>((resolve, reject) => {
			const r = indexedDB.open('sweetfolio', 2);
			r.onupgradeneeded = () => {
				const db = r.result;
				db.createObjectStore('assets', { keyPath: 'id' }).createIndex('by-isin', 'isin');
				db.createObjectStore('portfolios', { keyPath: 'id' });
				db.createObjectStore('currencies', { keyPath: 'pair' });
				db.createObjectStore('settings', { keyPath: 'key' });
				db.createObjectStore('simulations', { keyPath: 'id' });
				const prices = Array.from({ length: 400 }, (_, i) => ({
					date: new Date(Date.UTC(2022, 0, 3) + i * 864e5).toISOString().slice(0, 10),
					close: 100 + i / 10
				}));
				const tx = r.transaction!;
				tx.objectStore('assets').put({
					id: 'legacy-a',
					name: 'Legacy Fund',
					isin: null,
					wkn: null,
					currency: 'EUR',
					classification: 'fund',
					prices,
					formatConfig: null,
					rawCSV: null,
					rawCSVStoredAt: null,
					createdAt: '2026-01-01T00:00:00Z',
					updatedAt: '2026-01-01T00:00:00Z',
					lastRefreshedAt: null
				});
				tx.objectStore('portfolios').put({
					id: 'legacy-p',
					name: 'Legacy Portfolio',
					allocations: [
						{ assetId: 'legacy-a', weight: 1 },
						{ assetId: 'legacy-a2', weight: 0 }
					],
					isBenchmark: true,
					createdAt: '2026-01-01T00:00:00Z',
					updatedAt: '2026-01-01T00:00:00Z'
				});
				tx.objectStore('settings').put({ key: 'riskFreeRate', value: 2 });
			};
			r.onsuccess = () => {
				r.result.close();
				resolve();
			};
			r.onerror = () => reject(r.error);
		});
	});
	await page.goto('/portfolios');
	await expect(page.getByRole('link', { name: /Legacy Portfolio/ })).toBeVisible();
	await expect(page.getByText('Benchmark', { exact: true }).first()).toBeVisible();
	await page.getByRole('link', { name: /Legacy Portfolio/ }).click();
	await expect(page.getByRole('heading', { name: 'Backtest' })).toBeVisible();
	await page.goto('/settings');
	await expect(page.getByLabel('Risk-free rate')).toHaveValue('2');
});

test('SH-2 share link for an asset already in the library', async ({ page }) => {
	await uploadCsv(page, [{ name: 'Alpha.csv', content: germanCsv(300) }]);
	await page.getByRole('link', { name: /Alpha/ }).first().click();
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await page.getByRole('dialog').getByLabel('ISIN').fill('IE00B4L5Y983');
	await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
	const hash = '#share=' + LZString.compressToEncodedURIComponent('p:Shared One|IE00B4L5Y983:1');
	await page.goto('/' + hash);
	const d = page.getByRole('dialog');
	await expect(d).toContainText('Shared portfolio');
	await expect(d).toContainText('In your library');
	await d.getByRole('button', { name: 'Add to my library' }).click();
	await expect(page).toHaveURL(/portfolios\/shared-one/);
});
