import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
	test('loads the dashboard page', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/Dashboard/);
		await expect(page.locator('h1')).toHaveText('Dashboard');
	});

	test('navigates to all main pages via sidebar', async ({ page }) => {
		await page.goto('/');

		const navLinks = [
			{ label: 'Assets', heading: 'Assets' },
			{ label: 'Portfolios', heading: 'Portfolios' },
			{ label: 'Simulation', heading: 'Monte Carlo Simulation' },
			{ label: 'Settings', heading: 'Settings' },
		];

		for (const { label, heading } of navLinks) {
			await page.getByRole('link', { name: label }).first().click();
			await expect(page.locator('h1')).toHaveText(heading);
		}
	});

	test('navigates back to dashboard via logo', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.locator('h1')).toHaveText('Settings');

		// Click the logo/brand link to go home
		await page.locator('.nav-logo').click();
		await expect(page.locator('h1')).toHaveText('Dashboard');
	});

	test('dashboard shows quick action links', async ({ page }) => {
		await page.goto('/');

		await expect(page.locator('.action-card').filter({ hasText: 'Upload Asset Data' })).toBeVisible();
		await expect(page.locator('.action-card').filter({ hasText: 'Create Portfolio' })).toBeVisible();
		await expect(page.locator('.action-card').filter({ hasText: 'Run Simulation' })).toBeVisible();
	});

	test('dashboard quick actions navigate correctly', async ({ page }) => {
		await page.goto('/');

		await page.locator('.action-card').filter({ hasText: 'Upload Asset Data' }).click();
		await expect(page.locator('h1')).toHaveText('Assets');

		await page.goto('/');
		await page.locator('.action-card').filter({ hasText: 'Create Portfolio' }).click();
		await expect(page.locator('h1')).toHaveText('Portfolios');

		await page.goto('/');
		await page.locator('.action-card').filter({ hasText: 'Run Simulation' }).click();
		await expect(page.locator('h1')).toHaveText('Monte Carlo Simulation');
	});
});
