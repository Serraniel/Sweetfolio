import type { Transaction, Holding } from '$lib/types';
import { FifoCostBasis } from './cost-basis/fifo';

/**
 * Compute current holdings from a list of transactions and current prices.
 *
 * Uses the FIFO cost-basis engine to derive remaining lots, then aggregates
 * per asset to produce Holding objects with weights.
 */
export function computeHoldings(
	transactions: Transaction[],
	currentPrices: Map<string, number>
): Holding[] {
	if (transactions.length === 0) return [];

	const fifo = new FifoCostBasis();
	const lots = fifo.computeLots(transactions);

	// Aggregate lots per asset: total quantity and base cost (qty * purchasePrice)
	const aggregated = new Map<string, { quantity: number; baseCost: number }>();
	for (const lot of lots) {
		const entry = aggregated.get(lot.assetId) ?? { quantity: 0, baseCost: 0 };
		entry.quantity += lot.quantity;
		entry.baseCost += lot.quantity * lot.purchasePrice;
		aggregated.set(lot.assetId, entry);
	}

	// Sum buy fees per asset from original transactions (only for assets still held)
	const buyFees = new Map<string, number>();
	for (const tx of transactions) {
		if (tx.type === 'buy' && aggregated.has(tx.assetId)) {
			buyFees.set(tx.assetId, (buyFees.get(tx.assetId) ?? 0) + tx.fee);
		}
	}

	// Build holdings (only assets with quantity > 0)
	const holdings: Holding[] = [];
	for (const [assetId, agg] of aggregated) {
		if (agg.quantity <= 0) continue;

		const currentPrice = currentPrices.get(assetId) ?? 0;
		const currentValue = agg.quantity * currentPrice;
		const totalCost = agg.baseCost + (buyFees.get(assetId) ?? 0);
		const unrealizedGain = currentValue - totalCost;
		const unrealizedGainPercent = totalCost !== 0 ? unrealizedGain / totalCost : 0;

		holdings.push({
			assetId,
			quantity: agg.quantity,
			avgCostBasis: totalCost / agg.quantity,
			totalCost,
			currentPrice,
			currentValue,
			unrealizedGain,
			unrealizedGainPercent,
			weight: 0 // computed below
		});
	}

	// Compute weights
	const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
	if (totalValue > 0) {
		for (const h of holdings) {
			h.weight = h.currentValue / totalValue;
		}
	}

	return holdings;
}

/**
 * Compute the cash balance after applying all transactions to an initial amount.
 *
 * - Buy: subtract (quantity * price + fee)
 * - Sell: add (quantity * price - fee)
 * - Dividend: add (amount - withholdingTax)
 */
export function computeCashBalance(transactions: Transaction[], initialCash: number): number {
	let balance = initialCash;

	for (const tx of transactions) {
		switch (tx.type) {
			case 'buy':
				if (tx.quantity != null && tx.price != null) {
					balance -= tx.quantity * tx.price + tx.fee;
				}
				break;
			case 'sell':
				if (tx.quantity != null && tx.price != null) {
					balance += tx.quantity * tx.price - tx.fee;
				}
				break;
			case 'dividend':
				if (tx.amount != null) {
					balance += tx.amount - tx.withholdingTax;
				}
				break;
		}
	}

	return balance;
}
