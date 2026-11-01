import { expect, test, type Page } from '@playwright/test';
import { collectErrors, dismissHint, germanCsv, offline, uploadCsv } from './helpers.ts';

test.beforeEach(async ({ page }) => {
	await offline(page);
	await dismissHint(page);
	// 800 business days from 2018 cover the Covid crash with real prices.
	await uploadCsv(page, [
		{ name: 'Alpha.csv', content: germanCsv(800, 100, 0.0005, 3) },
		{ name: 'Beta.csv', content: germanCsv(800, 50, 0.0002, 9) }
	]);
});

async function createPortfolio(page: Page, name: string, weights: Array<[string, string]>) {
	await page.goto('/portfolios');
	await page.getByRole('button', { name: 'New portfolio' }).first().click();
	const d = page.getByRole('dialog');
	await d.getByLabel('Name').fill(name);
	for (const [asset] of weights) {
		await d.getByLabel('Add asset').selectOption({ label: asset });
		await d.getByRole('button', { name: 'Add', exact: true }).click();
	}
	for (const [asset, w] of weights) {
		await d.getByLabel(`Weight of ${asset} in percent`).fill(w);
		await d.getByLabel(`Weight of ${asset} in percent`).blur();
	}
	await d.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByRole('heading', { name: 'Backtest' })).toBeVisible();
}

async function setBenchmark(page: Page, asset: string) {
	await page.goto('/assets');
	await page
		.getByRole('link', { name: new RegExp(asset) })
		.first()
		.click();
	await page.getByRole('button', { name: 'Set as benchmark' }).click();
	await expect(page.getByText('Benchmark', { exact: true }).first()).toBeVisible();
}

/** First number in a table cell (own value; the benchmark is on the second line). */
async function cellNumber(cell: import('@playwright/test').Locator): Promise<number> {
	const first = (await cell.innerText()).split('\n')[0]!;
	return parseFloat(first.replace('−', '-').replace(/[^\d.-]/g, ''));
}

/** Synthetic daily index from 1985 with a 30 % crash in October 1987, answered for every Onvista history request. */
async function fakeIndexHistory(page: Page) {
	const ts: number[] = [];
	const last: number[] = [];
	let v = 100;
	for (let t = Date.UTC(1985, 0, 2); t < Date.UTC(2021, 0, 1); t += 864e5) {
		const day = new Date(t).getUTCDay();
		if (day === 0 || day === 6) continue;
		const crash = t >= Date.UTC(1987, 9, 13) && t < Date.UTC(1987, 9, 20);
		v *= crash ? 0.95 : 1.0003;
		ts.push(t / 1000 + 12 * 3600);
		last.push(Math.round(v * 100) / 100);
	}
	await page.route(/api\.onvista\.de\/.*eod_history/, (route) =>
		route.fulfill({ contentType: 'application/json', body: JSON.stringify({ datetimeLast: ts, last }) })
	);
}

test('CR-4/CR-5 portfolio crisis test with real prices and the benchmark', async ({ page }) => {
	const errors = collectErrors(page);
	await setBenchmark(page, 'Beta');
	await createPortfolio(page, 'Mix', [
		['Alpha', '70'],
		['Beta', '30']
	]);
	const card = page.locator('section.card', { hasText: 'How this allocation would have done' });
	await card.getByRole('radio', { name: 'Historical crises' }).click();
	await expect(card.getByRole('button', { name: 'Download crisis history' })).toBeVisible();
	const covid = card.locator('tr', { hasText: 'Covid crash' });
	await expect(covid).toBeVisible();
	await expect(covid.getByText('Real')).toBeVisible();
	await expect(covid.locator('.verdict')).toHaveText(/Better|Similar|Worse/);
	await expect(card.getByText(/Not testable: .*Black Monday/)).toBeVisible();
	await expect(card.getByText(/worse in \d of 1 crises/)).toBeVisible();
	await card.getByRole('button', { name: 'Covid crash' }).click();
	await expect(card.getByRole('img', { name: 'Crisis path' })).toBeVisible();
	await expect(card.getByText('Pandemic panic')).toBeVisible();

	// Excluding the crisis type leaves nothing to test.
	await card.getByText('Crisis comparison settings').click();
	await card.getByLabel('Liquidity crash').uncheck();
	await expect(card.getByText('None of the selected crisis types can be tested')).toBeVisible();
	await card.getByLabel('Liquidity crash').check();
	expect(errors).toEqual([]);
});

test('CR-1/CR-3 exposure editor and proxies from downloaded index history', async ({ page }) => {
	await fakeIndexHistory(page);
	await page.goto('/settings#crisis-data');
	const data = page.locator('#crisis-data');
	await expect(data.getByText('S&P 500')).toBeVisible();
	await data.getByRole('button', { name: 'Download' }).click();
	await expect(data.getByText('not downloaded')).toHaveCount(0, { timeout: 20_000 });
	await expect(data.getByRole('button', { name: 'Update' })).toBeVisible();

	await page.goto('/assets');
	await page.getByRole('link', { name: /Alpha/ }).first().click();
	const exposure = page.locator('section.card', { hasText: 'What the asset invests in' });
	await expect(exposure.getByText('Unknown')).toBeVisible();
	await expect(exposure.getByText('Guessed from the name')).toBeVisible();
	await exposure.getByRole('button', { name: 'Edit exposure' }).click();
	const d = page.getByRole('dialog');
	await d.getByLabel('Invests in').selectOption('equity');
	await d.getByLabel('Region').selectOption('us');
	await d.getByLabel('Daily leverage').fill('2');
	await d.getByRole('button', { name: 'Save' }).click();
	await expect(exposure.getByText('Equities, USA, 2× daily')).toBeVisible();
	await expect(exposure.getByText('Set manually')).toBeVisible();
	await expect(exposure.getByText(/uses S&P 500 from 1985, with 2× daily leverage/)).toBeVisible();

	// Black Monday is now testable for Alpha (proxy), not for Beta (no exposure).
	await page.goto('/compare?slugs=alpha,beta');
	const crises = page.locator('section.card', { hasText: 'Drawdown per crisis' });
	await crises.getByRole('radio', { name: 'Historical crises' }).click();
	const row = crises.locator('tbody tr', { hasText: 'Black Monday' });
	await expect(row.locator('td').nth(0)).toContainText('%');
	await expect(row.locator('td').nth(1)).toHaveText('no data');
});

test('CR-7 crisis test of simulated portfolios', async ({ page }) => {
	await setBenchmark(page, 'Beta');
	await page.goto('/simulation');
	await page.getByRole('button', { name: 'Select all' }).click();
	await page.getByRole('button', { name: '1K' }).click();
	await page.getByRole('button', { name: 'Run simulation' }).click();
	await expect(page.getByRole('heading', { name: 'Crisis test' })).toBeVisible({ timeout: 20_000 });
	await expect(page.getByRole('button', { name: '2. Run crisis test' })).toBeDisabled();
	await page.getByRole('button', { name: 'All', exact: true }).click();
	await expect(page.getByText(/All portfolios: [\d,.]+ portfolios/)).toBeVisible();
	await page.getByLabel('Model').selectOption('historical');
	await page.getByRole('button', { name: '2. Run crisis test' }).click();
	await expect(page.getByText(/Tested [\d,.]+ portfolios in 1 crises \(Covid crash\)/)).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText(/Not tested \(no data for every asset\): Great Depression/)).toBeVisible();

	// Inspector shows the crisis rows; the saved portfolio gets the same result.
	await page.getByRole('button', { name: 'Max Sharpe' }).click();
	const inspector = page.locator('section.card', { hasText: 'Portfolio inspector' });
	const simRow = inspector.locator('tr', { hasText: 'Covid crash' });
	await expect(simRow).toBeVisible();
	const simDrawdown = await cellNumber(simRow.locator('td').first());
	await inspector.getByRole('button', { name: 'Save as portfolio' }).click();
	await page.getByRole('link', { name: 'Open' }).click();
	await expect(page).toHaveURL(/portfolios\/sim-/);
	const saved = page.locator('section.card', { hasText: 'How this allocation would have done' });
	await saved.getByRole('radio', { name: 'Historical crises' }).click();
	const row = saved.locator('tr', { hasText: 'Covid crash' });
	const savedDrawdown = await cellNumber(row.locator('td').first());
	expect(savedDrawdown).toBeLessThan(0);
	// Weights are rounded to 0.1 % when saved.
	expect(Math.abs(savedDrawdown - simDrawdown)).toBeLessThanOrEqual(0.3);

	// Filtering by crisis behaviour.
	await page.goBack();
	await page.getByLabel('Only those that hold up like the benchmark').check();
	await expect(page.getByLabel('Only those that hold up like the benchmark')).toBeChecked();
});

async function setExposure(page: Page, asset: string, cls: string, region?: string) {
	await page.goto('/assets');
	await page
		.getByRole('link', { name: new RegExp(asset) })
		.first()
		.click();
	await page.getByRole('button', { name: 'Edit exposure' }).click();
	const d = page.getByRole('dialog');
	await d.getByLabel('Invests in').selectOption(cls);
	if (region) await d.getByLabel('Region').selectOption(region);
	await d.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Set manually')).toBeVisible();
}

test('CR-8 crisis-type scenarios with editable assumptions', async ({ page }) => {
	const errors = collectErrors(page);
	await setBenchmark(page, 'Beta');
	await createPortfolio(page, 'Stocks and gold', [
		['Alpha', '70'],
		['Beta', '30']
	]);
	const card = page.locator('section.card', { hasText: 'How this allocation would have done' });
	// Names alone do not tell what Alpha and Beta invest in.
	await expect(card.getByText(/unknown what Alpha, Beta invest/)).toBeVisible();

	await setExposure(page, 'Alpha', 'equity', 'world');
	await setExposure(page, 'Beta', 'gold');
	await page.goto('/portfolios/stocks-and-gold');
	await expect(card.locator('tbody tr')).toHaveCount(7);
	const stagflation = card.locator('tr', { hasText: 'Stagflation' });
	await expect(stagflation.getByText('Assumed')).toBeVisible();
	await expect(stagflation.getByText('like 1973–74, 1980–82')).toBeVisible();
	// The verdict says why; scenarios have no separate "until trough" column (it equals the drawdown).
	await expect(stagflation.locator('.reason')).toHaveText(/drawdown|recover|within the tolerances/);
	await expect(card.getByRole('columnheader', { name: 'Until trough' })).toHaveCount(0);
	// 70 % equities (−45 %) and 30 % gold (+60 %): shallower than equities alone.
	const before = await cellNumber(stagflation.locator('td').first());
	expect(before).toBeGreaterThan(-45);
	expect(before).toBeLessThan(0);
	await card.getByRole('button', { name: 'Stagflation' }).click();
	await expect(card.getByText('Shown as if it started today.')).toBeVisible();

	// Harsher assumption for equities in stagflation deepens the drawdown.
	await page.goto('/settings#crisis-assumptions');
	await page.getByLabel('Equities in Stagflation, change in percent', { exact: true }).fill('-70');
	await page.getByLabel('Equities in Stagflation, change in percent', { exact: true }).blur();
	await expect(page.getByRole('button', { name: 'Reset to defaults' })).toBeEnabled();
	await page.goto('/portfolios/stocks-and-gold');
	await expect.poll(async () => cellNumber(stagflation.locator('td').first())).toBeLessThan(before - 5);

	// The simulation tests all seven crisis types.
	await page.goto('/simulation');
	await page.getByRole('button', { name: 'Select all' }).click();
	await page.getByRole('button', { name: '1K' }).click();
	await page.getByRole('button', { name: 'Run simulation' }).click();
	await expect(page.getByRole('heading', { name: 'Crisis test' })).toBeVisible({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Efficient frontier' }).click();
	await page.getByRole('button', { name: '2. Run crisis test' }).click();
	await expect(page.getByText(/Tested [\d,.]+ portfolios in 7 crisis types/)).toBeVisible({ timeout: 20_000 });

	// Only portfolios that beat the benchmark in a number of crisis types.
	const better = page.getByLabel('Better than the benchmark in at least');
	await expect(better.locator('option')).toHaveText(['any number of', ...[1, 2, 3, 4, 5, 6].map((n) => `at least ${n}`), 'all 7']);
	await better.selectOption({ label: 'at least 1' });
	await page.getByLabel('Best candidates').selectOption('bestScore');
	const counts = await page
		.locator('.ranked')
		.getByText(/better in \d of 7/)
		.allInnerTexts();
	for (const t of counts) expect(Number(/better in (\d)/.exec(t)![1])).toBeGreaterThanOrEqual(1);
	expect(errors).toEqual([]);
});
