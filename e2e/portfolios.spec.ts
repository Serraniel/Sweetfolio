import { expect, test } from '@playwright/test';
import { collectErrors, dismissHint, germanCsv, offline, uploadCsv } from './helpers.ts';

test.beforeEach(async ({ page }) => {
	await offline(page);
	await dismissHint(page);
	await uploadCsv(page, [
		{ name: 'Alpha.csv', content: germanCsv(800, 100, 0.0005, 3) },
		{ name: 'Beta.csv', content: germanCsv(800, 50, 0.0002, 9) }
	]);
});

test('PM-1/PM-2/PM-4 model portfolio backtest and benchmark', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/portfolios');
	await page.getByRole('button', { name: 'New portfolio' }).first().click();
	const d = page.getByRole('dialog');
	await d.getByLabel('Name').fill('Sixty Forty');
	await d.getByLabel('Add asset').selectOption({ label: 'Alpha' });
	await d.getByRole('button', { name: 'Add', exact: true }).click();
	await d.getByLabel('Add asset').selectOption({ label: 'Beta' });
	await d.getByRole('button', { name: 'Add', exact: true }).click();
	await d.getByLabel('Weight of Alpha in percent').fill('60');
	await d.getByLabel('Weight of Alpha in percent').blur();
	await d.getByLabel('Weight of Beta in percent').fill('40');
	await d.getByLabel('Weight of Beta in percent').blur();
	await d.getByLabel('Rebalancing in backtest').selectOption('quarterly');
	await d.getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/portfolios\/sixty-forty/);
	await expect(page.getByRole('heading', { name: 'Backtest' })).toBeVisible();
	await expect(page.getByText('Rebalanced quarterly')).toBeVisible();
	await expect(page.locator('table.metrics tbody td').first()).not.toHaveText('–');
	await page.getByRole('button', { name: 'Set as benchmark' }).click();
	await expect(page.getByText('Benchmark', { exact: true }).first()).toBeVisible();
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Benchmark' })).toBeVisible();
	expect(errors).toEqual([]);
});

test('PT-3/PT-5/PT-7 tracked portfolio with cash', async ({ page }) => {
	await page.goto('/portfolios');
	await page.getByRole('button', { name: 'New portfolio' }).first().click();
	const d = page.getByRole('dialog');
	await d.getByLabel('Name').fill('Depot');
	await d.getByRole('radio', { name: 'Tracked', exact: true }).click();
	await d.getByLabel('Track cash').check();
	await d.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByText('No open positions')).toBeVisible();

	await page.getByRole('radio', { name: 'Transactions' }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	let tx = page.getByRole('dialog');
	await tx.getByRole('radio', { name: 'Deposit' }).click();
	await tx.getByLabel('Date').fill('2019-01-02');
	await tx.getByLabel('Amount').fill('5000');
	await tx.getByRole('button', { name: 'Save' }).click();

	await page.getByRole('button', { name: 'Add', exact: true }).click();
	tx = page.getByRole('dialog');
	await tx.getByLabel('Date').fill('2019-01-03');
	await tx.getByLabel('Asset').selectOption({ label: 'Alpha' });
	await tx.getByLabel('Quantity').fill('10');
	await tx.getByLabel('Price per unit').fill('100');
	await tx.getByLabel('Fee').fill('1');
	await tx.getByRole('button', { name: 'Save' }).click();

	// Overselling is rejected (PT-3)
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	tx = page.getByRole('dialog');
	await tx.getByRole('radio', { name: 'Sell' }).click();
	await tx.getByLabel('Date').fill('2019-02-01');
	await tx.getByLabel('Asset').selectOption({ label: 'Alpha' });
	await tx.getByLabel('Quantity').fill('20');
	await tx.getByLabel('Price per unit').fill('100');
	await expect(tx.getByText('You only hold 10 units')).toBeVisible();
	await expect(tx.getByRole('button', { name: 'Save' })).toBeDisabled();
	await tx.getByRole('button', { name: 'Cancel' }).click();

	await page.getByRole('radio', { name: 'Holdings' }).click();
	await expect(page.locator('table.holdings')).toContainText('Alpha');
	await expect(page.getByText('Cash', { exact: true }).first()).toBeVisible();
	await expect(page.getByText(/3[.,]999/).first()).toBeVisible();
});

test('ST-1/ST-4 strategy generates portfolios', async ({ page }) => {
	await page.goto('/strategies');
	await page.getByRole('button', { name: 'New strategy' }).first().click();
	await page.getByRole('dialog').getByLabel('Name').fill('Core');
	await page.getByRole('dialog').getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/strategies\/core/);
	await page.getByRole('button', { name: 'Asset' }).first().click();
	await page.getByLabel('Asset to add').selectOption({ label: 'Alpha' });
	await page.getByRole('button', { name: 'Asset' }).first().click();
	await page.getByLabel('Asset to add').selectOption({ label: 'Beta' });
	await expect(page.getByText(/Children sum to/)).toBeVisible();
	await page.getByRole('button', { name: 'Normalize all' }).click();
	await expect(page.getByText(/Children sum to/)).toHaveCount(0);
	await expect(page.getByText('Saved')).toBeVisible();
	await page.getByRole('button', { name: 'Generate portfolios' }).click();
	await page.getByRole('dialog').getByRole('radio', { name: 'One portfolio' }).click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /Generate/ })
		.click();
	await expect(page.getByRole('heading', { name: 'Generated portfolios' })).toBeVisible();
	await expect(page.getByText('In sync')).toBeVisible();
});

test('MC-1/MC-7 simulation runs and inspects a portfolio', async ({ page }) => {
	await page.goto('/simulation');
	await page.getByRole('button', { name: '1K' }).click();
	await page.getByRole('button', { name: 'Select all' }).click();
	await page.getByRole('button', { name: 'Run simulation' }).click();
	await expect(page.getByRole('heading', { name: 'Efficient frontier' })).toBeVisible({ timeout: 20_000 });
	await expect(page.getByRole('heading', { name: 'Portfolio inspector' })).toBeVisible();
	await page.getByRole('button', { name: 'Min volatility' }).click();
	await page.getByRole('button', { name: 'Save as portfolio' }).click();
	await page.getByRole('link', { name: 'Open' }).click();
	await expect(page).toHaveURL(/portfolios\/sim-/);
});
