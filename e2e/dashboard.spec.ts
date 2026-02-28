import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
	test('shows summary cards with zero counts initially', async ({ page }) => {
		await page.goto('/');

		// Summary cards for assets and portfolios
		const summaryValues = page.locator('.summary-value');
		await expect(summaryValues.first()).toHaveText('0');
		await expect(summaryValues.nth(1)).toHaveText('0');
	});

	test('shows getting started section', async ({ page }) => {
		await page.goto('/');

		await expect(page.getByText('Getting Started')).toBeVisible();
		await expect(page.getByText('Upload Assets')).toBeVisible();
		await expect(page.getByText('Build Portfolios')).toBeVisible();
		await expect(page.getByText('Run Simulations')).toBeVisible();
	});

	test('does not show correlation matrix without assets', async ({ page }) => {
		await page.goto('/');

		// Correlation section should not be visible without data
		await expect(page.locator('.correlation-section')).not.toBeVisible();
	});
});
