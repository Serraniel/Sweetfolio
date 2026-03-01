import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('dashboard loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/Sweetfolio/);
  });

  test('assets page loads', async ({ page }) => {
    await page.goto('/assets');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Assets', exact: true })).toBeVisible();
  });

  test('portfolios page loads', async ({ page }) => {
    await page.goto('/portfolios');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Portfolios', exact: true })).toBeVisible();
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
  });

  test('navigation between pages works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Navigate to assets via nav link
    await page.getByRole('link', { name: /assets/i }).click();
    await expect(page).toHaveURL(/\/assets/);

    // Navigate to portfolios
    await page.getByRole('link', { name: /portfolios/i }).click();
    await expect(page).toHaveURL(/\/portfolios/);

    // Navigate to settings
    await page.getByRole('link', { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
  });
});
