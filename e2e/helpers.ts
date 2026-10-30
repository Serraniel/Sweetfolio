import { expect, type Page } from '@playwright/test';

/** Business-day price CSV in German format. */
export function germanCsv(days: number, start = 100, drift = 0.0004, seed = 1): string {
	let s = seed;
	const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
	const lines = ['Datum;Schlusskurs'];
	const d = new Date(Date.UTC(2018, 0, 1));
	let v = start;
	while (lines.length <= days) {
		const wd = d.getUTCDay();
		if (wd !== 0 && wd !== 6) {
			const dd = String(d.getUTCDate()).padStart(2, '0');
			const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
			lines.push(`${dd}.${mm}.${d.getUTCFullYear()};${v.toFixed(2).replace('.', ',')}`);
			v *= 1 + drift + rnd() * 0.02;
		}
		d.setUTCDate(d.getUTCDate() + 1);
	}
	return lines.join('\n');
}

/** Block all third-party network calls so tests are deterministic and offline. */
export async function offline(page: Page) {
	await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
}

/** Track console errors and uncaught exceptions. */
export function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource|net::/.test(m.text())) errors.push(m.text());
	});
	return errors;
}

export async function uploadCsv(page: Page, files: Array<{ name: string; content: string }>) {
	await page.goto('/assets');
	await page
		.locator('input[type=file]')
		.first()
		.setInputFiles(files.map((f) => ({ name: f.name, mimeType: 'text/csv', buffer: Buffer.from(f.content) })));
	for (const f of files) await expect(page.getByRole('link', { name: new RegExp(f.name.replace(/\.csv$/, '')) }).first()).toBeVisible();
}

export async function dismissHint(page: Page) {
	await page.addInitScript(() => localStorage.setItem('sweetfolio-hint-local-storage-dismissed', 'true'));
}
