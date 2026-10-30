/** Constructors for new records with sensible defaults. */
import type { Asset, Portfolio, Strategy, Transaction } from './types.ts';
import { createRoot } from '#lib/core/strategy.ts';

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export function newAsset(p: Partial<Asset> & Pick<Asset, 'name'>): Asset {
	const t = now();
	return {
		id: id(),
		isin: null,
		wkn: null,
		currency: 'EUR',
		classification: 'unknown',
		prices: [],
		formatConfig: null,
		rawCSV: null,
		rawCSVStoredAt: null,
		createdAt: t,
		updatedAt: t,
		lastRefreshedAt: null,
		...p
	};
}

export function newPortfolio(p: Partial<Portfolio> & Pick<Portfolio, 'name'>): Portfolio {
	const t = now();
	return {
		id: id(),
		mode: 'model',
		allocations: [],
		isBenchmark: false,
		trackCash: false,
		cashCurrency: 'EUR',
		sourceStrategyId: null,
		rebalance: 'none',
		createdAt: t,
		updatedAt: t,
		...p
	};
}

export function newStrategy(name: string): Strategy {
	const t = now();
	return { id: id(), name, root: createRoot(name), generatedPortfolioIds: [], createdAt: t, updatedAt: t };
}

export function newTransaction(p: Partial<Transaction> & Pick<Transaction, 'portfolioId' | 'type' | 'date'>): Transaction {
	const t = now();
	return {
		id: id(),
		assetId: '',
		quantity: null,
		price: null,
		fee: 0,
		amount: null,
		withholdingTax: 0,
		currency: 'EUR',
		notes: '',
		createdAt: t,
		updatedAt: t,
		...p
	};
}

/** Normalize allocation weights to sum to 1 and drop zero weights (PM-1). */
export function cleanAllocations<T extends { weight: number }>(allocations: readonly T[]): T[] {
	const kept = allocations.filter((a) => a.weight > 0);
	const total = kept.reduce((s, a) => s + a.weight, 0);
	return kept.map((a) => ({ ...a, weight: total > 0 ? a.weight / total : 0 }));
}
