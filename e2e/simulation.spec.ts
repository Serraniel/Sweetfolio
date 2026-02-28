import { test, expect } from '@playwright/test';

test.describe('Simulation page', () => {
	test('loads simulation page', async ({ page }) => {
		await page.goto('/simulation');
		await expect(page.locator('h1')).toHaveText('Monte Carlo Simulation');
	});

	test('shows simulation configuration panel', async ({ page }) => {
		await page.goto('/simulation');

		// Should show the number of simulations label and input
		await expect(page.getByText('Number of Simulations')).toBeVisible();

		// Should show the run button (disabled without assets)
		await expect(page.getByRole('button', { name: /run simulation/i })).toBeVisible();
	});

	test('shows empty asset message when no assets exist', async ({ page }) => {
		await page.goto('/simulation');

		await expect(page.getByText('No assets available')).toBeVisible();
	});
});
