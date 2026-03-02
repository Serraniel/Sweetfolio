import { test, expect } from '@playwright/test';

test.describe('Portfolios page', () => {
	test('loads portfolios page', async ({ page }) => {
		await page.goto('/portfolios');
		await expect(page.locator('h1')).toHaveText('Portfolios');
	});

	test('shows empty state when no portfolios exist', async ({ page }) => {
		await page.goto('/portfolios');

		// Should show "No portfolios yet" empty state
		await expect(page.getByText('No portfolios yet')).toBeVisible();
	});

	test('has create portfolio button', async ({ page }) => {
		await page.goto('/portfolios');

		await expect(page.getByRole('button', { name: /new portfolio/i })).toBeVisible();
	});
});
