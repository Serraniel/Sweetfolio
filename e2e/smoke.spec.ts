import { expect, test } from '@playwright/test';
import { collectErrors, offline } from './helpers.ts';

const ROUTES = [
	'/',
	'/assets',
	'/compare',
	'/portfolios',
	'/strategies',
	'/simulation',
	'/tools',
	'/tools/parqet-to-pp',
	'/settings',
	'/changelog',
	'/license',
	'/licenses'
];

for (const route of ROUTES) {
	test(`UI-9 ${route} renders without errors`, async ({ page }) => {
		await offline(page);
		const errors = collectErrors(page);
		await page.goto(route);
		await expect(page.locator('h1').first()).toBeVisible();
		expect(errors).toEqual([]);
	});
}

test('UI-9 unknown asset slug shows not found', async ({ page }) => {
	await offline(page);
	await page.goto('/assets/does-not-exist');
	await expect(page.getByRole('heading', { name: 'Asset not found' })).toBeVisible();
});

test('UI-2 theme toggle persists', async ({ page }) => {
	await offline(page);
	await page.goto('/settings');
	await page.getByRole('radio', { name: 'Dark' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.getByRole('radio', { name: 'Light' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('DP-5 local storage hint can be dismissed', async ({ page }) => {
	await offline(page);
	await page.goto('/');
	const hint = page.getByRole('note');
	await expect(hint).toContainText('stored only in this browser');
	await hint.getByRole('button', { name: 'Dismiss' }).click();
	await page.reload();
	await expect(page.getByRole('note')).toHaveCount(0);
});
