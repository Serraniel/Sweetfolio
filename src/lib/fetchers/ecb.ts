/** ECB exchange rates (CU-4). Series `D.{CCY}.EUR.SP00.A`: units of CCY per 1 EUR. */
import type { CurrencyRate } from '#lib/domain/types.ts';
import { parseCSV } from '#lib/parsers/csv.ts';
import { getText, type RequestOptions } from './http.ts';

export const ECB_BASE = 'https://data-api.ecb.europa.eu/service/data/EXR';

export function parseEcbCsv(text: string): Array<{ date: string; rate: number }> {
	const rows = parseCSV(text, ',');
	const header = rows[0] ?? [];
	const ti = header.indexOf('TIME_PERIOD');
	const vi = header.indexOf('OBS_VALUE');
	if (ti < 0 || vi < 0) throw new Error('Unexpected ECB response (missing TIME_PERIOD/OBS_VALUE).');
	return rows
		.slice(1)
		.map((r) => ({ date: r[ti] ?? '', rate: Number(r[vi]) }))
		.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.rate) && r.rate > 0)
		.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Fetch `CCYEUR` (EUR per 1 CCY). The ECB publishes CCY per EUR, so values are inverted.
 */
export async function fetchEurRate(currency: string, startPeriod?: string, opts?: RequestOptions): Promise<CurrencyRate> {
	const ccy = currency.toUpperCase();
	if (!/^[A-Z]{3}$/.test(ccy)) throw new Error(`Invalid currency code ${currency}`);
	const params = new URLSearchParams({ format: 'csvdata' });
	if (startPeriod) params.set('startPeriod', startPeriod);
	const text = await getText(`${ECB_BASE}/D.${ccy}.EUR.SP00.A?${params}`, { timeoutMs: 30_000, ...opts });
	return { pair: `${ccy}EUR`, rates: parseEcbCsv(text).map((r) => ({ date: r.date, rate: 1 / r.rate })) };
}
