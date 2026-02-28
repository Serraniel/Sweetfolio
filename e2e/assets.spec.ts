import { test, expect } from '@playwright/test';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

// Create a sample CSV fixture before tests run
test.beforeAll(() => {
	mkdirSync(FIXTURES_DIR, { recursive: true });
	const csv = [
		'Date,Close',
		'2024-01-02,100.00',
		'2024-01-03,101.50',
		'2024-01-04,99.80',
		'2024-01-05,102.20',
		'2024-01-08,103.10',
		'2024-01-09,104.00',
		'2024-01-10,103.50',
		'2024-01-11,105.20',
		'2024-01-12,106.00',
		'2024-01-15,107.30',
	].join('\n');
	writeFileSync(join(FIXTURES_DIR, 'test-asset.csv'), csv);
});

test.describe('Assets page', () => {
	test('shows empty state initially', async ({ page }) => {
		await page.goto('/assets');
		await expect(page.locator('h1')).toHaveText('Assets');

		// Should show file dropzone or empty state
		await expect(page.getByText(/drop|upload|csv/i).first()).toBeVisible();
	});

	test('uploads a CSV file and creates an asset', async ({ page }) => {
		await page.goto('/assets');

		// Upload the CSV file via the file input
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(join(FIXTURES_DIR, 'test-asset.csv'));

		// Either auto-imports or shows format modal
		// Wait for the asset to appear in the list or modal to show
		const modalOrAsset = page.getByText(/test-asset|Format|Preview/i).first();
		await expect(modalOrAsset).toBeVisible({ timeout: 5000 });

		// If a format config modal appeared, confirm it
		const confirmButton = page.getByRole('button', { name: /confirm|import/i });
		if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await confirmButton.click();
		}

		// The asset should now appear in the list
		await expect(page.getByRole('link', { name: 'test-asset' })).toBeVisible({ timeout: 5000 });
	});

	test('navigates to asset detail page', async ({ page }) => {
		await page.goto('/assets');

		// Upload asset first
		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles(join(FIXTURES_DIR, 'test-asset.csv'));

		// Handle potential modal
		const confirmButton = page.getByRole('button', { name: /confirm|import/i });
		if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await confirmButton.click();
		}

		// Click on the asset to navigate to detail
		await page.getByRole('link', { name: 'test-asset' }).click();

		// Should show asset detail page with price data info
		await expect(page.locator('h1')).toBeVisible({ timeout: 5000 });
	});
});
