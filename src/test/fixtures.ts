import type { Asset, PricePoint, Transaction } from '#lib/domain/types.ts';
import { fromDayNumber, isWeekend, toDayNumber } from '#lib/core/dates.ts';

/** Business-day series from `start` with daily growth `g` (or a function of the index). */
export function series(start: string, days: number, g: number | ((i: number) => number), base = 100): PricePoint[] {
	const out: PricePoint[] = [];
	let day = toDayNumber(start);
	let v = base;
	let i = 0;
	while (out.length < days) {
		if (!isWeekend(day)) {
			out.push({ date: fromDayNumber(day), close: v });
			v *= 1 + (typeof g === 'function' ? g(i) : g);
			i++;
		}
		day++;
	}
	return out;
}

export function asset(partial: Partial<Asset> & { id: string }): Asset {
	return {
		name: partial.id,
		isin: null,
		wkn: null,
		currency: 'EUR',
		classification: 'unknown',
		prices: [],
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
		lastRefreshedAt: null,
		...partial
	};
}

let txCounter = 0;
export function tx(partial: Partial<Transaction> & Pick<Transaction, 'type' | 'date'>): Transaction {
	txCounter++;
	return {
		id: `tx-${txCounter}`,
		portfolioId: 'p1',
		assetId: 'a1',
		quantity: null,
		price: null,
		fee: 0,
		amount: null,
		withholdingTax: 0,
		currency: 'EUR',
		notes: '',
		createdAt: `2024-01-01T00:00:${String(txCounter % 60).padStart(2, '0')}.000Z`,
		updatedAt: '2024-01-01T00:00:00.000Z',
		...partial
	};
}
