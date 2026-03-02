import type { Transaction, HoldingLot, RealizedGain } from '$lib/types';
import type { CostBasisMethod } from './types';

interface InternalLot {
	assetId: string;
	quantity: number;
	purchasePrice: number;
	purchaseDate: string;
	feePerUnit: number;
}

function sortByDate(transactions: Transaction[]): Transaction[] {
	return [...transactions].sort((a, b) => a.date.localeCompare(b.date));
}

export class FifoCostBasis implements CostBasisMethod {
	readonly name = 'FIFO';

	computeLots(transactions: Transaction[]): HoldingLot[] {
		const sorted = sortByDate(transactions);
		const queues = new Map<string, InternalLot[]>();

		for (const tx of sorted) {
			if (tx.type === 'dividend') continue;

			const queue = queues.get(tx.assetId) ?? [];
			queues.set(tx.assetId, queue);

			if (tx.type === 'buy' && tx.quantity != null && tx.price != null) {
				queue.push({
					assetId: tx.assetId,
					quantity: tx.quantity,
					purchasePrice: tx.price,
					purchaseDate: tx.date,
					feePerUnit: tx.fee / tx.quantity
				});
			} else if (tx.type === 'sell' && tx.quantity != null) {
				let remaining = tx.quantity;
				while (remaining > 0 && queue.length > 0) {
					const lot = queue[0];
					if (lot.quantity <= remaining) {
						remaining -= lot.quantity;
						queue.shift();
					} else {
						lot.quantity -= remaining;
						remaining = 0;
					}
				}
			}
		}

		const result: HoldingLot[] = [];
		for (const queue of queues.values()) {
			for (const lot of queue) {
				result.push({
					assetId: lot.assetId,
					quantity: lot.quantity,
					purchasePrice: lot.purchasePrice,
					purchaseDate: lot.purchaseDate
				});
			}
		}
		return result;
	}

	computeRealizedGains(transactions: Transaction[]): RealizedGain[] {
		const sorted = sortByDate(transactions);
		const queues = new Map<string, InternalLot[]>();
		const gains: RealizedGain[] = [];

		for (const tx of sorted) {
			if (tx.type === 'dividend') continue;

			const queue = queues.get(tx.assetId) ?? [];
			queues.set(tx.assetId, queue);

			if (tx.type === 'buy' && tx.quantity != null && tx.price != null) {
				queue.push({
					assetId: tx.assetId,
					quantity: tx.quantity,
					purchasePrice: tx.price,
					purchaseDate: tx.date,
					feePerUnit: tx.fee / tx.quantity
				});
			} else if (tx.type === 'sell' && tx.quantity != null && tx.price != null) {
				let remaining = tx.quantity;
				let costBasis = 0;

				while (remaining > 0 && queue.length > 0) {
					const lot = queue[0];
					const consumed = Math.min(lot.quantity, remaining);
					costBasis += consumed * (lot.purchasePrice + lot.feePerUnit);
					lot.quantity -= consumed;
					remaining -= consumed;
					if (lot.quantity === 0) {
						queue.shift();
					}
				}

				const proceeds = tx.quantity * tx.price - tx.fee;
				gains.push({
					assetId: tx.assetId,
					sellDate: tx.date,
					quantity: tx.quantity,
					costBasis,
					proceeds,
					gain: proceeds - costBasis
				});
			}
		}

		return gains;
	}
}
