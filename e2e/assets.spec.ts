import { expect, test } from '@playwright/test';
import { collectErrors, dismissHint, germanCsv, offline, uploadCsv } from './helpers.ts';

test.beforeEach(async ({ page }) => {
	await offline(page);
	await dismissHint(page);
});

test('AM-1/AM-3a confident German CSV is auto-imported and analysed', async ({ page }) => {
	const errors = collectErrors(page);
	await uploadCsv(page, [{ name: 'World ETF.csv', content: germanCsv(1300) }]);
	await page
		.getByRole('link', { name: /World ETF/ })
		.first()
		.click();
	await expect(page.getByRole('heading', { name: 'World ETF' })).toBeVisible();
	await expect(page.getByText('Financial metrics')).toBeVisible();
	// 5 years of data → 1Y and 3Y columns and "All", but no 10Y/15Y (FM-5)
	const head = page.locator('table.metrics thead');
	await expect(head).toContainText('3Y');
	await expect(head).not.toContainText('10Y');
	await expect(page.locator('table.metrics tbody td').first()).not.toHaveText('–');
	await expect(page.locator('.u-over').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('AM-3 ambiguous CSV opens the format dialog', async ({ page }) => {
	await page.goto('/assets');
	const csv = 'Date;Close\n01/02/2024;1\n03/04/2024;2\n05/06/2024;3\n';
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles({ name: 'amb.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('ambiguous');
	await dialog.getByLabel('Date format').selectOption('MM/DD/YYYY');
	await expect(dialog).toContainText('3 prices');
	await dialog.getByRole('button', { name: 'Import' }).click();
	await expect(page.getByRole('link', { name: /amb/ })).toBeVisible();
});

test('AM-4/AM-6 edit validates ISIN and delete cascades', async ({ page }) => {
	await uploadCsv(page, [{ name: 'Alpha.csv', content: germanCsv(300) }]);
	await page.getByRole('link', { name: /Alpha/ }).first().click();
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('ISIN').fill('IE00B4L5Y984');
	await expect(dialog.getByText('valid check digit')).toBeVisible();
	await dialog.getByLabel('ISIN').fill('IE00B4L5Y983');
	await dialog.getByLabel('Name').fill('Alpha Renamed');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(page).toHaveURL(/\/assets\/alpha-renamed$/);
	await page.getByRole('button', { name: 'Delete asset' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(/\/assets$/);
	await expect(page.getByText('No assets yet')).toBeVisible();
});

test('CP-1 compare two assets', async ({ page }) => {
	await uploadCsv(page, [
		{ name: 'Alpha.csv', content: germanCsv(600, 100, 0.0005, 3) },
		{ name: 'Beta.csv', content: germanCsv(600, 50, 0.0001, 7) }
	]);
	await page.getByLabel('Select Alpha').check();
	await page.getByLabel('Select Beta').check();
	await page.getByRole('button', { name: 'Compare' }).click();
	await expect(page).toHaveURL(/compare\?slugs=alpha,beta|compare\?slugs=beta,alpha/);
	await expect(page.getByRole('heading', { name: 'Financial metrics' })).toBeVisible();
	await expect(page.locator('td.best').first()).toBeVisible();
});
