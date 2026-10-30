/**
 * Export for Portfolio Performance (EX-6) in PP's documented CSV import format
 * ("Portfolio transactions" / "Account transactions"), which PP imports via
 * File › Import › CSV files. Semicolon separated, ISO dates, decimal point.
 */
import type { Asset, Portfolio, Transaction } from '#lib/domain/types.ts';
import { sortTransactions } from '#lib/core/tracking.ts';

const PORTFOLIO_HEADER = [
	'Date',
	'Type',
	'Security Name',
	'ISIN',
	'WKN',
	'Ticker Symbol',
	'Shares',
	'Value',
	'Fees',
	'Taxes',
	'Transaction Currency',
	'Securities Account',
	'Cash Account',
	'Note'
];
const ACCOUNT_HEADER = [
	'Date',
	'Type',
	'Value',
	'Transaction Currency',
	'Taxes',
	'Fees',
	'Shares',
	'Security Name',
	'ISIN',
	'WKN',
	'Cash Account',
	'Note'
];

function cell(v: string | number | null | undefined): string {
	if (v === null || v === undefined) return '';
	const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')) : v;
	return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const ACCOUNT_TYPES: Partial<Record<Transaction['type'], string>> = {
	dividend: 'Dividend',
	deposit: 'Deposit',
	withdrawal: 'Removal',
	fee: 'Fees',
	tax: 'Taxes'
};

export interface PPExportFiles {
	portfolioTransactions: string;
	accountTransactions: string;
}

export function exportPortfolioPerformanceCSV(
	portfolios: readonly Portfolio[],
	assets: readonly Asset[],
	transactions: readonly Transaction[]
): PPExportFiles {
	const assetById = new Map(assets.map((a) => [a.id, a]));
	const pfById = new Map(portfolios.map((p) => [p.id, p]));
	const portfolioRows = [PORTFOLIO_HEADER.join(';')];
	const accountRows = [ACCOUNT_HEADER.join(';')];
	for (const tx of sortTransactions(transactions.filter((t) => pfById.has(t.portfolioId)))) {
		const pf = pfById.get(tx.portfolioId)!;
		const asset = assetById.get(tx.assetId);
		const cashAccount = `${pf.name} (Cash)`;
		if (tx.type === 'buy' || tx.type === 'sell') {
			const qty = tx.quantity ?? 0;
			const value = qty * (tx.price ?? 0) + (tx.type === 'buy' ? tx.fee : -tx.fee);
			portfolioRows.push(
				[
					tx.date,
					tx.type === 'buy' ? 'Buy' : 'Sell',
					asset?.name ?? '',
					asset?.isin ?? '',
					asset?.wkn ?? '',
					'',
					qty,
					Math.abs(value),
					tx.fee,
					0,
					tx.currency,
					pf.name,
					cashAccount,
					tx.notes
				]
					.map(cell)
					.join(';')
			);
		} else {
			const type = ACCOUNT_TYPES[tx.type];
			if (!type) continue;
			const value = tx.type === 'dividend' ? (tx.amount ?? 0) - tx.withholdingTax - tx.fee : Math.abs(tx.amount ?? 0);
			accountRows.push(
				[
					tx.date,
					type,
					value,
					tx.currency,
					tx.type === 'dividend' ? tx.withholdingTax : 0,
					tx.type === 'dividend' ? tx.fee : 0,
					'',
					asset?.name ?? '',
					asset?.isin ?? '',
					asset?.wkn ?? '',
					cashAccount,
					tx.notes
				]
					.map(cell)
					.join(';')
			);
		}
	}
	return { portfolioTransactions: portfolioRows.join('\n') + '\n', accountTransactions: accountRows.join('\n') + '\n' };
}

/** Historical quotes for one security in PP's "Historical quotes" CSV format. */
export function exportPortfolioPerformanceQuotes(asset: Asset): string {
	return ['Date;Quote', ...asset.prices.map((p) => `${p.date};${cell(p.close)}`)].join('\n') + '\n';
}
