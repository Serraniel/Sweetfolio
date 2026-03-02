import { test, expect } from '@playwright/test';

test.describe('Settings page', () => {
	test('loads settings page with all sections', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.locator('h1')).toHaveText('Settings');

		// Check all setting sections are visible
		await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Data Sources' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Currency', exact: true })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Exchange Rates' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Calculations' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Benchmark' })).toBeVisible();
	});

	test('theme toggle switches between light and dark', async ({ page }) => {
		await page.goto('/settings');

		// Find the theme toggle in the Appearance section
		const themeSwitch = page.locator('.theme-switch').first();
		await expect(themeSwitch).toBeVisible();

		// Get initial theme state from the document
		const initialTheme = await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme')
		);

		// Click the toggle
		const inactiveOption = themeSwitch.locator('.theme-option:not(.active)');
		await inactiveOption.click();

		// Theme should have changed
		const newTheme = await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme')
		);
		expect(newTheme).not.toBe(initialTheme);
	});

	test('currency selector has supported currencies', async ({ page }) => {
		await page.goto('/settings');

		const currencySelect = page.locator('select').filter({ has: page.locator('option[value="EUR"]') }).first();
		await expect(currencySelect).toBeVisible();

		// Check a few currencies exist
		await expect(currencySelect.locator('option[value="EUR"]')).toBeAttached();
		await expect(currencySelect.locator('option[value="USD"]')).toBeAttached();
		await expect(currencySelect.locator('option[value="GBP"]')).toBeAttached();
	});

	test('save button is present and clickable', async ({ page }) => {
		await page.goto('/settings');

		const saveButton = page.getByRole('button', { name: /save/i });
		await expect(saveButton).toBeVisible();
		await expect(saveButton).toBeEnabled();
	});

	test('data source selector shows options', async ({ page }) => {
		await page.goto('/settings');

		const sourceSelect = page.locator('select').filter({
			has: page.locator('option[value="onvista"]')
		}).first();
		await expect(sourceSelect).toBeVisible();
		await expect(sourceSelect.locator('option[value="onvista"]')).toBeAttached();
		await expect(sourceSelect.locator('option[value="alphavantage"]')).toBeAttached();
	});

	test('risk-free rate input accepts numeric values', async ({ page }) => {
		await page.goto('/settings');

		const rfrInput = page.locator('input[type="number"]').first();
		await expect(rfrInput).toBeVisible();

		await rfrInput.fill('2.5');
		await expect(rfrInput).toHaveValue('2.5');
	});

	test('clear all data button is present', async ({ page }) => {
		await page.goto('/settings');

		const clearButton = page.getByRole('button', { name: /clear all data/i });
		await expect(clearButton).toBeVisible();
	});
});
