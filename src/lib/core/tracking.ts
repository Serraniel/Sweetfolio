/**
 * Transaction-based portfolio tracking: FIFO cost basis, holdings, cash,
 * value history and drift/rebalancing (PT-2 … PT-8).
 */
import type { Allocation, ISODate, PricePoint, Transaction } from '#lib/domain/types.ts';
import { fromDayNumber, toDayNumber } from './dates.ts';
import { valueAt } from './series.ts';

const DUST = 1e-9;

export interface HoldingLot {
	assetId: string;
	quantity: number;
	/** Cost per unit including the proportional buy fee. */
	unitCost: number;
	purchaseDate: ISODate;
}

export interface RealizedGain {
	transactionId: string;
	assetId: string;
	date: ISODate;
	quantity: number;
	costBasis: number;
	proceeds: number;
	gain: number;
}

export interface CostBasisResult {
	lots: HoldingLot[];
	realized: RealizedGain[];
	/** Sells that exceeded the open position (quantity that could not be matched). */
	oversold: Array<{ transactionId: string; quantity: number }>;
}

export interface CostBasisMethod {
	readonly name: string;
	compute(transactions: readonly Transaction[]): CostBasisResult;
}

/** Stable chronological order: date, then buys before sells on the same day, then creation time. */
export function sortTransactions(transactions: readonly Transaction[]): Transaction[] {
	const rank: Record<string, number> = { deposit: 0, buy: 1, dividend: 2, sell: 3, fee: 4, tax: 4, withdrawal: 5 };
	return [...transactions].sort(
		(a, b) =>
			(a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
			(rank[a.type] ?? 9) - (rank[b.type] ?? 9) ||
			(a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
	);
}

export const fifo: CostBasisMethod = {
	name: 'FIFO',
	compute(transactions) {
		const queues = new Map<string, HoldingLot[]>();
		const realized: RealizedGain[] = [];
		const oversold: CostBasisResult['oversold'] = [];
		for (const tx of sortTransactions(transactions)) {
			if (tx.type !== 'buy' && tx.type !== 'sell') continue;
			const qty = tx.quantity ?? 0;
			const price = tx.price ?? 0;
			if (!(qty > 0)) continue;
			let queue = queues.get(tx.assetId);
			if (!queue) queues.set(tx.assetId, (queue = []));
			if (tx.type === 'buy') {
				queue.push({ assetId: tx.assetId, quantity: qty, unitCost: price + (tx.fee || 0) / qty, purchaseDate: tx.date });
				continue;
			}
			let remaining = qty;
			let costBasis = 0;
			while (remaining > DUST && queue.length) {
				const lot = queue[0]!;
				const used = Math.min(lot.quantity, remaining);
				costBasis += used * lot.unitCost;
				lot.quantity -= used;
				remaining -= used;
				if (lot.quantity <= DUST) queue.shift();
			}
			if (remaining > DUST) oversold.push({ transactionId: tx.id, quantity: remaining });
			const matched = qty - Math.max(0, remaining);
			const proceeds = matched * price - (tx.fee || 0) * (qty > 0 ? matched / qty : 0);
			realized.push({
				transactionId: tx.id,
				assetId: tx.assetId,
				date: tx.date,
				quantity: matched,
				costBasis,
				proceeds,
				gain: proceeds - costBasis
			});
		}
		const lots = [...queues.values()].flat().filter((l) => l.quantity > DUST);
		return { lots, realized, oversold };
	}
};

/** Open position per asset as of a date (inclusive), for sell validation. */
export function positionAt(transactions: readonly Transaction[], assetId: string, date: ISODate, excludeId?: string): number {
	let qty = 0;
	for (const tx of transactions) {
		if (tx.assetId !== assetId || tx.date > date || tx.id === excludeId) continue;
		if (tx.type === 'buy') qty += tx.quantity ?? 0;
		else if (tx.type === 'sell') qty -= tx.quantity ?? 0;
	}
	return Math.abs(qty) < DUST ? 0 : qty;
}

/** Net cash effect of a transaction in its own currency. */
export function cashFlow(tx: Transaction): number {
	const qty = tx.quantity ?? 0;
	const price = tx.price ?? 0;
	const fee = tx.fee || 0;
	const amount = tx.amount ?? 0;
	switch (tx.type) {
		case 'buy':
			return -(qty * price + fee);
		case 'sell':
			return qty * price - fee;
		case 'dividend':
			return amount - (tx.withholdingTax || 0) - fee;
		case 'deposit':
			return amount;
		case 'withdrawal':
		case 'fee':
		case 'tax':
			return -Math.abs(amount);
	}
}

export function cashBalance(transactions: readonly Transaction[], until?: ISODate): number {
	let balance = 0;
	for (const tx of sortTransactions(transactions)) {
		if (until && tx.date > until) break;
		balance += cashFlow(tx);
	}
	return balance;
}

export interface Holding {
	assetId: string;
	quantity: number;
	avgCost: number;
	totalCost: number;
	currentPrice: number | null;
	currentValue: number;
	unrealizedGain: number;
	unrealizedGainPercent: number;
	weight: number;
}

export interface HoldingsSummary {
	holdings: Holding[];
	cash: number | null;
	totalValue: number;
	invested: number;
	unrealizedGain: number;
	realizedGain: number;
	dividends: number;
	fees: number;
	totalReturn: number;
	totalReturnPercent: number;
}

/**
 * Current holdings. `priceFor` returns the latest price in the portfolio currency
 * (or null when unknown — the position is then valued at cost).
 */
export function computeHoldings(
	transactions: readonly Transaction[],
	priceFor: (assetId: string) => number | null,
	options: { trackCash?: boolean; method?: CostBasisMethod } = {}
): HoldingsSummary {
	const method = options.method ?? fifo;
	const { lots, realized } = method.compute(transactions);
	const agg = new Map<string, { qty: number; cost: number }>();
	for (const lot of lots) {
		const e = agg.get(lot.assetId) ?? { qty: 0, cost: 0 };
		e.qty += lot.quantity;
		e.cost += lot.quantity * lot.unitCost;
		agg.set(lot.assetId, e);
	}
	const holdings: Holding[] = [];
	for (const [assetId, { qty, cost }] of agg) {
		const price = priceFor(assetId);
		const value = price === null ? cost : qty * price;
		const gain = value - cost;
		holdings.push({
			assetId,
			quantity: qty,
			avgCost: cost / qty,
			totalCost: cost,
			currentPrice: price,
			currentValue: value,
			unrealizedGain: gain,
			unrealizedGainPercent: cost ? gain / cost : 0,
			weight: 0
		});
	}
	const cash = options.trackCash ? cashBalance(transactions) : null;
	const securities = holdings.reduce((s, h) => s + h.currentValue, 0);
	const totalValue = securities + (cash ?? 0);
	const weightBase = securities + Math.max(0, cash ?? 0);
	for (const h of holdings) h.weight = weightBase > 0 ? h.currentValue / weightBase : 0;
	holdings.sort((a, b) => b.currentValue - a.currentValue);

	let dividends = 0;
	let fees = 0;
	let deposits = 0;
	for (const tx of transactions) {
		if (tx.type === 'dividend') dividends += (tx.amount ?? 0) - (tx.withholdingTax || 0);
		if (tx.type === 'buy' || tx.type === 'sell' || tx.type === 'dividend') fees += tx.fee || 0;
		if (tx.type === 'fee' || tx.type === 'tax') fees += Math.abs(tx.amount ?? 0);
		if (tx.type === 'deposit') deposits += tx.amount ?? 0;
		if (tx.type === 'withdrawal') deposits -= Math.abs(tx.amount ?? 0);
	}
	const invested = holdings.reduce((s, h) => s + h.totalCost, 0);
	const unrealizedGain = holdings.reduce((s, h) => s + h.unrealizedGain, 0);
	const realizedGain = realized.reduce((s, r) => s + r.gain, 0);
	const totalReturn = unrealizedGain + realizedGain + dividends;
	const base = options.trackCash && deposits > 0 ? deposits : invested + realized.reduce((s, r) => s + r.costBasis, 0);
	return {
		holdings,
		cash,
		totalValue,
		invested,
		unrealizedGain,
		realizedGain,
		dividends,
		fees,
		totalReturn,
		totalReturnPercent: base > 0 ? totalReturn / base : 0
	};
}

export interface ValuePoint {
	date: ISODate;
	value: number;
	invested: number;
	/**
	 * External cash flow into the portfolio since the previous point (+ in, − out):
	 * deposits/withdrawals when tracking cash; otherwise buys in, and sells,
	 * dividends, fees and taxes out, since their cash is not part of `value`.
	 */
	flow: number;
}

/**
 * Daily market value of a tracked portfolio (PT-6) from its first transaction
 * until `end`. `seriesFor` returns price history in the portfolio currency.
 * Invested capital = net external cash (deposits) when tracking cash, else
 * cumulative net cost of buys minus sell proceeds' cost basis.
 */
export function valueHistory(
	transactions: readonly Transaction[],
	seriesFor: (assetId: string) => readonly PricePoint[],
	end: ISODate,
	options: { trackCash?: boolean; maxPoints?: number } = {}
): ValuePoint[] {
	const sorted = sortTransactions(transactions);
	if (sorted.length === 0) return [];
	const startDay = toDayNumber(sorted[0]!.date);
	const endDay = Math.max(startDay, toDayNumber(end));
	const totalDays = endDay - startDay + 1;
	const step = Math.max(1, Math.ceil(totalDays / (options.maxPoints ?? 1500)));
	const positions = new Map<string, number>();
	let cash = 0;
	let invested = 0;
	let flow = 0;
	let idx = 0;
	const out: ValuePoint[] = [];
	const lots = new Map<string, Array<{ q: number; c: number }>>();
	for (let day = startDay; day <= endDay; day++) {
		const date = fromDayNumber(day);
		while (idx < sorted.length && sorted[idx]!.date <= date) {
			const tx = sorted[idx++]!;
			const q = tx.quantity ?? 0;
			cash += cashFlow(tx);
			if (options.trackCash) {
				if (tx.type === 'deposit' || tx.type === 'withdrawal') flow += cashFlow(tx);
			} else if (tx.type !== 'deposit' && tx.type !== 'withdrawal') flow -= cashFlow(tx);
			if (tx.type === 'buy') {
				positions.set(tx.assetId, (positions.get(tx.assetId) ?? 0) + q);
				const cost = q * (tx.price ?? 0) + (tx.fee || 0);
				const l = lots.get(tx.assetId) ?? [];
				l.push({ q, c: q > 0 ? cost / q : 0 });
				lots.set(tx.assetId, l);
				if (!options.trackCash) invested += cost;
			} else if (tx.type === 'sell') {
				positions.set(tx.assetId, (positions.get(tx.assetId) ?? 0) - q);
				let rem = q;
				const l = lots.get(tx.assetId) ?? [];
				while (rem > DUST && l.length) {
					const used = Math.min(l[0]!.q, rem);
					if (!options.trackCash) invested -= used * l[0]!.c;
					l[0]!.q -= used;
					rem -= used;
					if (l[0]!.q <= DUST) l.shift();
				}
			} else if (options.trackCash && (tx.type === 'deposit' || tx.type === 'withdrawal')) {
				invested += cashFlow(tx);
			}
		}
		if ((day - startDay) % step !== 0 && day !== endDay) continue;
		let value = options.trackCash ? cash : 0;
		for (const [assetId, qty] of positions) {
			if (Math.abs(qty) < DUST) continue;
			const price = valueAt(seriesFor(assetId), date);
			if (price !== null) value += qty * price;
			else {
				const l = lots.get(assetId) ?? [];
				value += l.reduce((s, x) => s + x.q * x.c, 0);
			}
		}
		out.push({ date, value, invested, flow });
		flow = 0;
	}
	return out;
}

/**
 * Time-weighted performance index (start 100) from a value history: each step's
 * return is (value − flow) ÷ previous value, so deposits and withdrawals do not
 * count as gains or losses. Steps without previous value (start, fully sold)
 * leave the index unchanged.
 */
export function twrIndex(points: readonly ValuePoint[]): PricePoint[] {
	const out: PricePoint[] = [];
	let index = 100;
	let prev = 0;
	for (const p of points) {
		if (prev > DUST && out.length) index *= (p.value - p.flow) / prev;
		// Skip the time before the first position: there is nothing to measure yet.
		if (out.length || p.value > DUST) out.push({ date: p.date, close: index });
		prev = p.value;
	}
	return out;
}

export interface DriftItem {
	assetId: string;
	modelWeight: number;
	actualWeight: number;
	drift: number;
}

export function computeDrift(model: readonly Allocation[], holdings: readonly Holding[]): DriftItem[] {
	const totalModel = model.reduce((s, a) => s + a.weight, 0) || 1;
	const byAsset = new Map(holdings.map((h) => [h.assetId, h]));
	const securities = holdings.reduce((s, h) => s + h.currentValue, 0);
	const actual = (id: string) => (securities > 0 ? (byAsset.get(id)?.currentValue ?? 0) / securities : 0);
	const items: DriftItem[] = model.map((a) => {
		const mw = a.weight / totalModel;
		const aw = actual(a.assetId);
		return { assetId: a.assetId, modelWeight: mw, actualWeight: aw, drift: aw - mw };
	});
	const inModel = new Set(model.map((a) => a.assetId));
	for (const h of holdings) {
		if (!inModel.has(h.assetId)) {
			const aw = actual(h.assetId);
			items.push({ assetId: h.assetId, modelWeight: 0, actualWeight: aw, drift: aw });
		}
	}
	return items.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

export interface RebalanceTrade {
	assetId: string;
	action: 'buy' | 'sell';
	value: number;
	quantity: number | null;
	currentWeight: number;
	targetWeight: number;
}

/**
 * Trades that restore the model weights. With `cashOnly`, only buys are
 * suggested, financed by `availableCash`, filling the most underweight assets first.
 */
export function rebalanceTrades(
	model: readonly Allocation[],
	holdings: readonly Holding[],
	options: { availableCash?: number; cashOnly?: boolean; minTradeValue?: number } = {}
): RebalanceTrade[] {
	const minTrade = options.minTradeValue ?? 0.01;
	const totalModel = model.reduce((s, a) => s + a.weight, 0) || 1;
	const byAsset = new Map(holdings.map((h) => [h.assetId, h]));
	const securities = holdings.reduce((s, h) => s + h.currentValue, 0);
	const cash = Math.max(0, options.availableCash ?? 0);
	const target = securities + cash;
	const priceOf = (id: string) => byAsset.get(id)?.currentPrice ?? null;
	const weightOf = (id: string) => (securities > 0 ? (byAsset.get(id)?.currentValue ?? 0) / securities : 0);

	let trades: RebalanceTrade[] = model.map((a) => {
		const tw = a.weight / totalModel;
		const diff = tw * target - (byAsset.get(a.assetId)?.currentValue ?? 0);
		const price = priceOf(a.assetId);
		return {
			assetId: a.assetId,
			action: diff >= 0 ? 'buy' : 'sell',
			value: Math.abs(diff),
			quantity: price ? Math.abs(diff) / price : null,
			currentWeight: weightOf(a.assetId),
			targetWeight: tw
		};
	});
	const inModel = new Set(model.map((a) => a.assetId));
	for (const h of holdings) {
		if (!inModel.has(h.assetId) && h.currentValue > minTrade) {
			trades.push({
				assetId: h.assetId,
				action: 'sell',
				value: h.currentValue,
				quantity: h.quantity,
				currentWeight: weightOf(h.assetId),
				targetWeight: 0
			});
		}
	}
	if (options.cashOnly) {
		const buys = trades.filter((t) => t.action === 'buy').sort((a, b) => b.value - a.value);
		const wanted = buys.reduce((s, t) => s + t.value, 0);
		const scale = wanted > cash && wanted > 0 ? cash / wanted : 1;
		trades = buys.map((t) => ({
			...t,
			value: t.value * scale,
			quantity: t.quantity === null ? null : t.quantity * scale
		}));
	}
	return trades.filter((t) => t.value > minTrade).sort((a, b) => b.value - a.value);
}
