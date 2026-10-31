/** Map Parqet Connect activities to the external import format (EX-5). */
import type { ExternalImport, ExternalSecurity, ExternalTransaction } from '#lib/parsers/external.ts';
import { isValidISIN } from '#lib/parsers/identifiers.ts';
import type { ParqetActivity, ParqetPortfolio } from './client.ts';

const SECURITY_TYPES = new Set(['security', 'crypto', 'commodity', undefined]);

export function mapParqetActivities(portfolio: ParqetPortfolio, activities: readonly ParqetActivity[]): ExternalImport {
	const warnings: string[] = [];
	const securities = new Map<string, ExternalSecurity>();
	const transactions: ExternalTransaction[] = [];
	let skipped = 0;
	for (const a of activities) {
		const date = a.datetime?.slice(0, 10);
		if (!date) continue;
		const isin = a.asset?.isin && isValidISIN(a.asset.isin) ? a.asset.isin.toUpperCase() : null;
		const key = isin ?? a.asset?.symbol ?? (a.holdingId ? `holding:${a.holdingId}` : null);
		const isSecurity = SECURITY_TYPES.has(a.holdingAssetType) && !!key && a.holdingAssetType !== 'cash';
		const currency = (a.currency ?? portfolio.currency ?? 'EUR').toUpperCase();
		const shares = Math.abs(a.shares ?? 0);
		const price = Math.abs(a.price ?? 0);
		const amount = Math.abs(a.amount ?? shares * price);
		const fee = Math.abs(a.fee ?? 0);
		const tax = Math.abs(a.tax ?? 0);
		const notes = a.description ?? '';
		const base = { externalId: a.id, portfolioKey: portfolio.id, date, currency, notes };
		const secTx = (type: 'buy' | 'sell', note?: string): ExternalTransaction | null => {
			if (!isSecurity || !shares || !price) return null;
			return {
				...base,
				securityKey: key,
				type,
				quantity: shares,
				price,
				fee: fee + tax,
				amount: null,
				withholdingTax: 0,
				notes: [note, notes].filter(Boolean).join(' — ')
			};
		};
		let t: ExternalTransaction | null = null;
		switch (a.type) {
			case 'buy':
				t = secTx('buy');
				break;
			case 'sell':
				t = secTx('sell');
				break;
			case 'transfer_in':
				t = secTx('buy', 'Transfer in');
				break;
			case 'transfer_out':
				t = secTx('sell', 'Transfer out');
				break;
			case 'dividend':
			case 'interest':
				t = isSecurity
					? {
							...base,
							securityKey: key,
							type: 'dividend',
							quantity: null,
							price: null,
							fee,
							amount,
							withholdingTax: tax,
							notes: a.type === 'interest' ? ['Interest', notes].filter(Boolean).join(' — ') : notes
						}
					: {
							...base,
							securityKey: null,
							type: 'deposit',
							quantity: null,
							price: null,
							fee: 0,
							amount: amount - tax - fee,
							withholdingTax: 0,
							notes: ['Interest', notes].filter(Boolean).join(' — ')
						};
				break;
			case 'deposit':
				t = { ...base, securityKey: null, type: 'deposit', quantity: null, price: null, fee: 0, amount, withholdingTax: 0 };
				break;
			case 'withdrawal':
				t = { ...base, securityKey: null, type: 'withdrawal', quantity: null, price: null, fee: 0, amount, withholdingTax: 0 };
				break;
			case 'fees_taxes':
				if (fee)
					transactions.push({
						...base,
						externalId: `${a.id}-fee`,
						securityKey: null,
						type: 'fee',
						quantity: null,
						price: null,
						fee: 0,
						amount: fee,
						withholdingTax: 0
					});
				if (tax)
					transactions.push({
						...base,
						externalId: `${a.id}-tax`,
						securityKey: null,
						type: 'tax',
						quantity: null,
						price: null,
						fee: 0,
						amount: tax,
						withholdingTax: 0
					});
				if (!fee && !tax && amount)
					t = { ...base, securityKey: null, type: 'fee', quantity: null, price: null, fee: 0, amount, withholdingTax: 0 };
				break;
		}
		if (t) {
			transactions.push(t);
			if (t.securityKey && !securities.has(t.securityKey))
				securities.set(t.securityKey, {
					key: t.securityKey,
					name: a.asset?.name ?? isin ?? a.asset?.symbol ?? t.securityKey,
					isin,
					wkn: a.asset?.wkn ?? null,
					ticker: a.asset?.symbol ?? null,
					currency,
					prices: []
				});
		} else if (a.type !== 'fees_taxes') skipped++;
	}
	if (skipped) warnings.push(`${skipped} activit${skipped === 1 ? 'y was' : 'ies were'} skipped (unsupported type or missing data).`);
	return {
		source: 'parqet-connect',
		portfolios: [
			{
				key: portfolio.id,
				name: portfolio.name,
				currency: portfolio.currency ?? 'EUR',
				trackCash: transactions.some((t) => t.type === 'deposit')
			}
		],
		securities: [...securities.values()],
		transactions,
		warnings
	};
}
