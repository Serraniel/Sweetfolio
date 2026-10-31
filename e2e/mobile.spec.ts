import { expect, test } from '@playwright/test';
import { dismissHint, offline } from './helpers.ts';

test('UI-4 mobile navigation uses the tab bar and more sheet', async ({ page }) => {
	await offline(page);
	await dismissHint(page);
	await page.goto('/');
	const tabbar = page.locator('nav.tabbar');
	await expect(tabbar).toBeVisible();
	await expect(page.locator('aside.sidebar')).toBeHidden();
	await tabbar.getByRole('link', { name: 'Assets' }).click();
	await expect(page).toHaveURL(/\/assets$/);
	await tabbar.getByRole('button', { name: 'More' }).click();
	await page.getByRole('menuitem', { name: 'Settings' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	// No horizontal overflow on a phone (P-5)
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(1);
});

test('UI-7 dialogs render as bottom sheets on mobile', async ({ page }) => {
	await offline(page);
	await dismissHint(page);
	await page.goto('/portfolios');
	await page.getByRole('button', { name: 'New portfolio' }).first().click();
	const box = await page.locator('dialog .panel').boundingBox();
	const vh = page.viewportSize()!.height;
	expect(box).not.toBeNull();
	expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(vh - 2);
});
