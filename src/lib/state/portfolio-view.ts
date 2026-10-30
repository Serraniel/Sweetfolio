/** Derived views of tracked portfolios in the portfolio currency (PT-5 … PT-8). */
import type { Portfolio, PricePoint, Transaction } from '#lib/domain/types.ts';
import { convertAmount, convertPrices } from '#lib/core/currency.ts';
import { computeHoldings, rebalanceTrades, computeDrift, valueHistory, type HoldingsSummary } from '#lib/core/tracking.ts';
import { todayISO } from '#lib/core/dates.ts';
import { app } from './app.svelte.ts';

/** Transactions with monetary fields converted into the portfolio currency where needed. */
export function normalizedTransactions(p: Portfolio): { transactions: Transaction[]; unconverted: number } {
	let unconverted = 0;
	const target = p.cashCurrency;
	const transactions = app.transactionsOf(p.id).map((t) => {
		if (t.currency === target) return t;
		const conv = (v: number | null) => (v === null ? null : convertAmount(v, t.date, t.currency, target, app.currencies));
		const price = conv(t.price);
		const amount = conv(t.amount);
		if ((t.price !== null && price === null) || (t.amount !== null && amount === null)) {
			unconverted++;
			return t;
		}
		return { ...t, price, amount, fee: conv(t.fee) ?? t.fee, withholdingTax: conv(t.withholdingTax) ?? t.withholdingTax, currency: target };
	});
	return { transactions, unconverted };
}

export function seriesIn(assetId: string, currency: string): PricePoint[] {
	const a = app.assetById.get(assetId);
	if (!a) return [];
	return a.currency === currency ? a.prices : convertPrices(a.prices, a.currency, currency, app.currencies).prices;
}

export function latestPriceIn(assetId: string, currency: string): number | null {
	const a = app.assetById.get(assetId);
	const last = a?.prices.at(-1);
	if (!a || !last) return null;
	return convertAmount(last.close, last.date, a.currency, currency, app.currencies);
}

export interface TrackedView {
	summary: HoldingsSummary;
	unconverted: number;
}

export function trackedView(p: Portfolio): TrackedView {
	const { transactions, unconverted } = normalizedTransactions(p);
	return { summary: computeHoldings(transactions, (id) => latestPriceIn(id, p.cashCurrency), { trackCash: p.trackCash }), unconverted };
}

export function trackedHistory(p: Portfolio) {
	const { transactions } = normalizedTransactions(p);
	const cache = new Map<string, PricePoint[]>();
	return valueHistory(
		transactions,
		(id) => {
			let s = cache.get(id);
			if (!s) cache.set(id, (s = seriesIn(id, p.cashCurrency)));
			return s;
		},
		todayISO(),
		{ trackCash: p.trackCash }
	);
}

export function driftView(p: Portfolio, view: TrackedView, cashOnly: boolean) {
	return {
		drift: computeDrift(p.allocations, view.summary.holdings),
		trades: rebalanceTrades(p.allocations, view.summary.holdings, {
			availableCash: p.trackCash ? Math.max(0, view.summary.cash ?? 0) : 0,
			cashOnly
		})
	};
}
