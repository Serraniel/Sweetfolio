import { test, expect } from '@playwright/test';

/**
 * Visual demo test for the Asset Comparison feature.
 *
 * This test walks through the entire comparison workflow while capturing
 * named screenshots at each step. It also records a video of the full flow
 * (enabled in playwright.config.ts).
 *
 * Artifacts are saved to:
 *   - Screenshots: test-results/  (PNG files)
 *   - Videos:      test-results/  (WebM files)
 *
 * Run with:
 *   npx playwright test e2e/compare-screenshots.spec.ts
 */

const TEST_ASSETS = [
	{
		id: 'demo-asset-1',
		name: 'MSCI World ETF',
		isin: 'IE00BJ0KDQ92',
		wkn: 'A1XB5U',
		currency: 'EUR',
		classification: 'etf',
		prices: generatePrices('2022-01-03', 780, 80, 0.0003, 0.012),
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: '2022-01-01T00:00:00Z',
		updatedAt: '2025-01-02T00:00:00Z',
		lastRefreshedAt: null
	},
	{
		id: 'demo-asset-2',
		name: 'S&P 500 ETF',
		isin: 'IE00B5BMR087',
		wkn: 'A0YEDG',
		currency: 'USD',
		classification: 'etf',
		prices: generatePrices('2022-01-03', 780, 100, 0.0004, 0.015),
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: '2022-01-01T00:00:00Z',
		updatedAt: '2025-01-02T00:00:00Z',
		lastRefreshedAt: null
	},
	{
		id: 'demo-asset-3',
		name: 'Euro Govt Bond ETF',
		isin: 'LU0290355717',
		wkn: 'DBX0AC',
		currency: 'EUR',
		classification: 'bond',
		prices: generatePrices('2022-01-03', 780, 200, 0.0001, 0.004),
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: '2022-01-01T00:00:00Z',
		updatedAt: '2025-01-02T00:00:00Z',
		lastRefreshedAt: null
	}
];

/**
 * Generate realistic-looking daily price data with trend and volatility.
 */
function generatePrices(
	startDate: string,
	days: number,
	startPrice: number,
	dailyDrift: number,
	dailyVol: number
) {
	const prices: { date: string; close: number }[] = [];
	const start = new Date(startDate);
	let price = startPrice;

	// Simple seeded pseudo-random for reproducibility
	let seed = startPrice * 1000 + days;
	function random() {
		seed = (seed * 16807 + 0) % 2147483647;
		return seed / 2147483647;
	}

	for (let i = 0; i < days; i++) {
		const d = new Date(start);
		d.setDate(d.getDate() + i);
		// Skip weekends
		if (d.getDay() === 0 || d.getDay() === 6) continue;

		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');

		prices.push({ date: `${year}-${month}-${day}`, close: Math.round(price * 100) / 100 });

		// Geometric Brownian motion step
		const shock = (random() - 0.5) * 2 * dailyVol;
		price *= 1 + dailyDrift + shock;
	}
	return prices;
}

async function seedAssets(page: import('@playwright/test').Page) {
	await page.evaluate((assets) => {
		return new Promise<void>((resolve, reject) => {
			const request = indexedDB.open('sweetfolio', 2);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains('assets')) {
					const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
					assetStore.createIndex('by-isin', 'isin', { unique: false });
					assetStore.createIndex('by-name', 'name', { unique: false });
					assetStore.createIndex('by-classification', 'classification', { unique: false });
				}
				if (!db.objectStoreNames.contains('portfolios')) {
					const portfolioStore = db.createObjectStore('portfolios', { keyPath: 'id' });
					portfolioStore.createIndex('by-name', 'name', { unique: false });
				}
				if (!db.objectStoreNames.contains('currencies')) {
					db.createObjectStore('currencies', { keyPath: 'pair' });
				}
				if (!db.objectStoreNames.contains('settings')) {
					db.createObjectStore('settings', { keyPath: 'key' });
				}
				if (!db.objectStoreNames.contains('simulations')) {
					db.createObjectStore('simulations', { keyPath: 'id' });
				}
			};
			request.onsuccess = () => {
				const db = request.result;
				const tx = db.transaction('assets', 'readwrite');
				const store = tx.objectStore('assets');
				for (const asset of assets) {
					store.put(asset);
				}
				tx.oncomplete = () => {
					db.close();
					resolve();
				};
				tx.onerror = () => reject(tx.error);
			};
			request.onerror = () => reject(request.error);
		});
	}, TEST_ASSETS);
}

test.describe('Comparison Feature — Visual Demo', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await seedAssets(page);
		await page.reload();
		await page.waitForLoadState('networkidle');
	});

	test('full comparison workflow', async ({ page }) => {
		// ── Step 1: Assets page with comparison checkboxes ──
		await page.goto('/assets');
		await page.waitForSelector('.asset-table');
		await page.screenshot({ path: 'test-results/screenshots/01-assets-list.png', fullPage: true });

		// ── Step 2: Select two assets for comparison ──
		const checkboxes = page.locator('.compare-checkbox');
		await checkboxes.nth(0).check();
		await checkboxes.nth(1).check();
		await page.screenshot({ path: 'test-results/screenshots/02-assets-selected.png', fullPage: true });

		// ── Step 3: Click "Compare 2 Assets" button ──
		const compareBtn = page.getByRole('button', { name: /Compare 2 Assets/ });
		await compareBtn.click();
		await expect(page).toHaveURL(/\/compare\?ids=/);

		// Wait for metrics to load
		await page.waitForSelector('.comparison-table');
		// Give charts a moment to render
		await page.waitForTimeout(1000);
		await page.screenshot({ path: 'test-results/screenshots/03-compare-overview.png', fullPage: true });

		// ── Step 4: Metrics table close-up ──
		const metricsSection = page.locator('.comparison-table').first();
		await metricsSection.screenshot({ path: 'test-results/screenshots/04-metrics-table.png' });

		// ── Step 5: Switch period tab to 1Y ──
		await page.locator('.period-tab', { hasText: '1Y' }).click();
		await page.waitForTimeout(500);
		await page.locator('.comparison-table').first().screenshot({
			path: 'test-results/screenshots/05-metrics-1y-period.png'
		});

		// ── Step 6: Price chart section ──
		const priceSection = page.locator('.chart-section').first();
		if (await priceSection.isVisible()) {
			await priceSection.screenshot({ path: 'test-results/screenshots/06-price-chart.png' });
		}

		// ── Step 7: Add a third asset ──
		const select = page.locator('.add-asset-select');
		if (await select.isVisible()) {
			await select.selectOption({ label: 'Euro Govt Bond ETF' });
			await page.getByRole('button', { name: 'Add' }).click();
			await page.waitForTimeout(1000);
			await page.screenshot({ path: 'test-results/screenshots/07-three-assets.png', fullPage: true });
		}

		// ── Step 8: Drawdown section ──
		const drawdownSection = page.locator('.drawdown-grid');
		if (await drawdownSection.isVisible()) {
			await drawdownSection.screenshot({ path: 'test-results/screenshots/08-drawdowns.png' });
		}

		// ── Step 9: Asset details table ──
		const detailsTable = page.locator('.comparison-table').nth(1);
		if (await detailsTable.isVisible()) {
			await detailsTable.screenshot({ path: 'test-results/screenshots/09-asset-details.png' });
		}

		// ── Step 10: Remove an asset ──
		await page.locator('.chip-remove').first().click();
		await page.waitForTimeout(500);
		await page.screenshot({ path: 'test-results/screenshots/10-after-remove.png', fullPage: true });
	});

	test('empty comparison state', async ({ page }) => {
		await page.goto('/compare');
		await page.waitForLoadState('networkidle');
		await page.screenshot({ path: 'test-results/screenshots/11-empty-state.png', fullPage: true });
	});

	test('navigation via sidebar', async ({ page }) => {
		await page.goto('/');
		const compareLink = page.locator('.nav-link', { hasText: 'Compare' });
		await expect(compareLink).toBeVisible();
		await page.screenshot({ path: 'test-results/screenshots/12-sidebar-nav.png' });
	});
});
