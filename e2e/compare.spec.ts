import { test, expect } from '@playwright/test';
import { slugify } from '../src/lib/utils/slug';

/**
 * E2E tests for the Asset Comparison feature.
 *
 * These tests rely on IndexedDB state in the browser. Since Sweetfolio is a
 * fully client-side app with no backend, we inject test assets directly into
 * IndexedDB via page.evaluate() before navigating.
 */

const TEST_ASSETS = [
	{
		id: 'test-asset-1',
		name: 'Test Stock Alpha',
		isin: 'DE0001234567',
		wkn: '123456',
		currency: 'EUR',
		classification: 'stock',
		prices: [
			{ date: '2023-01-02', close: 100 },
			{ date: '2023-06-01', close: 115 },
			{ date: '2024-01-02', close: 130 },
			{ date: '2024-06-01', close: 125 },
			{ date: '2025-01-02', close: 145 }
		],
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: '2023-01-01T00:00:00Z',
		updatedAt: '2025-01-02T00:00:00Z',
		lastRefreshedAt: null
	},
	{
		id: 'test-asset-2',
		name: 'Test ETF Beta',
		isin: 'IE00B1234567',
		wkn: '654321',
		currency: 'EUR',
		classification: 'etf',
		prices: [
			{ date: '2023-01-02', close: 50 },
			{ date: '2023-06-01', close: 55 },
			{ date: '2024-01-02', close: 60 },
			{ date: '2024-06-01', close: 58 },
			{ date: '2025-01-02', close: 65 }
		],
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: '2023-01-01T00:00:00Z',
		updatedAt: '2025-01-02T00:00:00Z',
		lastRefreshedAt: null
	},
	{
		id: 'test-asset-3',
		name: 'Test Bond Gamma',
		isin: null,
		wkn: null,
		currency: 'USD',
		classification: 'bond',
		prices: [
			{ date: '2023-01-02', close: 1000 },
			{ date: '2023-06-01', close: 1010 },
			{ date: '2024-01-02', close: 1020 },
			{ date: '2024-06-01', close: 1015 },
			{ date: '2025-01-02', close: 1030 }
		],
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: '2023-01-01T00:00:00Z',
		updatedAt: '2025-01-02T00:00:00Z',
		lastRefreshedAt: null
	}
];

/**
 * Inject test assets into IndexedDB so the app has data to work with.
 */
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

test.describe('Asset Comparison Feature', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to the app first to initialize the origin
		await page.goto('/');
		// Seed test data into IndexedDB
		await seedAssets(page);
		// Reload to pick up the seeded data
		await page.reload();
		await page.waitForLoadState('networkidle');
	});

	test.describe('Assets page - comparison selection', () => {
		test('shows comparison checkboxes in asset table', async ({ page }) => {
			await page.goto('/assets');
			await page.waitForSelector('.asset-table');

			const checkboxes = page.locator('.compare-checkbox');
			await expect(checkboxes).toHaveCount(3);
		});

		test('shows compare hint when only 1 asset is selected', async ({ page }) => {
			await page.goto('/assets');
			await page.waitForSelector('.asset-table');

			// Select first asset
			const checkboxes = page.locator('.compare-checkbox');
			await checkboxes.first().check();

			await expect(page.locator('.compare-hint')).toBeVisible();
			await expect(page.locator('.compare-hint')).toContainText('Select at least 2');
		});

		test('shows "Compare N Assets" button when 2+ assets are selected', async ({ page }) => {
			await page.goto('/assets');
			await page.waitForSelector('.asset-table');

			const checkboxes = page.locator('.compare-checkbox');
			await checkboxes.nth(0).check();
			await checkboxes.nth(1).check();

			const compareBtn = page.getByRole('button', { name: /Compare 2 Assets/ });
			await expect(compareBtn).toBeVisible();
		});

		test('navigates to compare page with selected asset slugs', async ({ page }) => {
			await page.goto('/assets');
			await page.waitForSelector('.asset-table');

			const checkboxes = page.locator('.compare-checkbox');
			await checkboxes.nth(0).check();
			await checkboxes.nth(1).check();

			const compareBtn = page.getByRole('button', { name: /Compare 2 Assets/ });
			await compareBtn.click();

			await expect(page).toHaveURL(/\/compare\?slugs=/);
		});
	});

	test.describe('Compare page', () => {
		test('displays selected assets as chips', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);
			await page.waitForSelector('.asset-chip');

			const chips = page.locator('.asset-chip');
			await expect(chips).toHaveCount(2);
			await expect(chips.first()).toContainText('Test Stock Alpha');
			await expect(chips.nth(1)).toContainText('Test ETF Beta');
		});

		test('shows financial metrics comparison table', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);
			await page.waitForSelector('.comparison-table');

			const table = page.locator('.comparison-table').first();
			await expect(table).toBeVisible();

			// Check metric rows exist
			await expect(table.locator('text=Cumulative Return')).toBeVisible();
			await expect(table.locator('text=Annualized Return')).toBeVisible();
			await expect(table.locator('text=Volatility')).toBeVisible();
			await expect(table.locator('text=Sharpe Ratio')).toBeVisible();
			await expect(table.locator('text=Max Drawdown')).toBeVisible();
		});

		test('shows period selector tabs', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);
			await page.waitForSelector('.period-tabs');

			const tabs = page.locator('.period-tab');
			await expect(tabs).toHaveCount(6); // 1Y, 3Y, 5Y, 10Y, 15Y, ALL
		});

		test('switching period tabs updates metrics', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);
			await page.waitForSelector('.period-tabs');

			// Click "1Y" period tab
			await page.locator('.period-tab', { hasText: '1Y' }).click();
			await expect(page.locator('.period-tab.active')).toContainText('1Y');
		});

		test('shows price history chart section', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);

			await expect(page.locator('text=Price History')).toBeVisible();
		});

		test('shows drawdown section', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);

			await expect(page.locator('text=Drawdowns')).toBeVisible();
			// Should have one drawdown card per asset
			const drawdownHeaders = page.locator('.drawdown-header');
			await expect(drawdownHeaders).toHaveCount(2);
		});

		test('shows asset details comparison table', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);

			await expect(page.locator('text=Asset Details')).toBeVisible();

			// Find the details table (second comparison-table)
			const detailsTable = page.locator('.comparison-table').nth(1);
			await expect(detailsTable.locator('text=Classification')).toBeVisible();
			await expect(detailsTable.locator('text=Currency')).toBeVisible();
			await expect(detailsTable.locator('text=ISIN')).toBeVisible();
		});

		test('can remove an asset from comparison', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);
			await page.waitForSelector('.asset-chip');

			await expect(page.locator('.asset-chip')).toHaveCount(2);

			// Remove the first asset
			const removeBtn = page.locator('.chip-remove').first();
			await removeBtn.click();

			await expect(page.locator('.asset-chip')).toHaveCount(1);
			// URL should update
			await expect(page).toHaveURL(/\/compare\?slugs=/);
		});

		test('can add an asset to comparison from dropdown', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)},${slugify(TEST_ASSETS[1].name)}`);
			await page.waitForSelector('.add-asset-select');

			// The third asset should be available in the dropdown
			const select = page.locator('.add-asset-select');
			await select.selectOption({ label: 'Test Bond Gamma' });

			await page.getByRole('button', { name: 'Add' }).click();

			await expect(page.locator('.asset-chip')).toHaveCount(3);
		});

		test('shows empty state when no assets are selected', async ({ page }) => {
			await page.goto('/compare');
			await expect(page.locator('.empty-hint')).toBeVisible();
		});

		test('shows prompt to add more when only 1 asset selected', async ({ page }) => {
			await page.goto(`/compare?slugs=${slugify(TEST_ASSETS[0].name)}`);
			await expect(page.locator('.empty-state')).toBeVisible();
			await expect(page.locator('.empty-state')).toContainText('Add at least one more');
		});
	});

	test.describe('Navigation', () => {
		test('sidebar has Compare nav link', async ({ page }) => {
			await page.goto('/');
			const compareLink = page.locator('.nav-link', { hasText: 'Compare' });
			await expect(compareLink).toBeVisible();
		});

		test('Compare nav link navigates to /compare', async ({ page }) => {
			await page.goto('/');
			const compareLink = page.locator('.nav-link', { hasText: 'Compare' });
			await compareLink.click();
			await expect(page).toHaveURL('/compare');
		});

		test('back link on compare page goes to assets', async ({ page }) => {
			await page.goto('/compare');
			const backLink = page.locator('.back-link');
			await expect(backLink).toContainText('Assets');
			await backLink.click();
			await expect(page).toHaveURL('/assets');
		});
	});
});
