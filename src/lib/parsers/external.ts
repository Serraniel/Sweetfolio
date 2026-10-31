/** Common intermediate format for external transaction imports (EX-1 … EX-5). */
import type { PricePoint, TransactionType } from '#lib/domain/types.ts';

export type ExternalSource =
	'portfolio-performance' | 'parqet' | 'parqet-connect' | 'trade-republic' | 'scalable-capital' | 'ing' | 'generic-csv';

export const SOURCE_LABELS: Record<ExternalSource, string> = {
	'portfolio-performance': 'Portfolio Performance',
	parqet: 'Parqet CSV',
	'parqet-connect': 'Parqet',
	'trade-republic': 'Trade Republic',
	'scalable-capital': 'Scalable Capital',
	ing: 'ING',
	'generic-csv': 'CSV'
};

export interface ExternalSecurity {
	key: string;
	name: string;
	isin: string | null;
	wkn: string | null;
	ticker: string | null;
	currency: string;
	prices: PricePoint[];
}

export interface ExternalPortfolio {
	key: string;
	name: string;
	currency: string;
	trackCash: boolean;
}

export interface ExternalTransaction {
	externalId: string | null;
	portfolioKey: string;
	securityKey: string | null;
	type: TransactionType;
	date: string;
	quantity: number | null;
	price: number | null;
	fee: number;
	amount: number | null;
	withholdingTax: number;
	currency: string;
	notes: string;
}

export interface ExternalImport {
	source: ExternalSource;
	portfolios: ExternalPortfolio[];
	securities: ExternalSecurity[];
	transactions: ExternalTransaction[];
	warnings: string[];
}
