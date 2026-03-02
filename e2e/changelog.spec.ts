import { test, expect } from '@playwright/test';

test.describe('Changelog page', () => {
	test('loads changelog page', async ({ page }) => {
		await page.goto('/changelog');
		await expect(page).toHaveTitle(/Changelog/);
		await expect(page.locator('header h1')).toHaveText('Changelog');
	});
});

test.describe('Licenses page', () => {
	test('loads licenses page', async ({ page }) => {
		await page.goto('/licenses');
		await expect(page).toHaveTitle(/Licenses/);
		await expect(page.locator('header h1')).toHaveText('Third-Party Licenses');
	});
});
