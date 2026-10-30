/** Turn an ExternalImport into Sweetfolio records, matching existing assets (EX-4). */
import type { Asset, Portfolio, Transaction } from '#lib/domain/types.ts';
import type { ExternalImport } from '#lib/parsers/external.ts';
import type { ExportData } from './schema.ts';

function stableId(prefix: string, key: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < key.length; i++) {
		const ch = key.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return `${prefix}-${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export interface MappingOptions {
	existingAssets: readonly Asset[];
	/** Import into this existing portfolio instead of creating new ones. */
	targetPortfolioId?: string | null;
	now?: string;
}

export interface MappingResult {
	data: ExportData;
	matchedAssets: number;
	newAssets: number;
}

export function mapExternalImport(ext: ExternalImport, options: MappingOptions): MappingResult {
	const now = options.now ?? new Date().toISOString();
	const byIsin = new Map(options.existingAssets.filter((a) => a.isin).map((a) => [a.isin!.toUpperCase(), a]));
	const byWkn = new Map(options.existingAssets.filter((a) => a.wkn).map((a) => [a.wkn!.toUpperCase(), a]));
	const assetIdBySec = new Map<string, string>();
	const newAssets: Asset[] = [];
	let matched = 0;
	for (const sec of ext.securities) {
		const existing = (sec.isin && byIsin.get(sec.isin)) || (sec.wkn && byWkn.get(sec.wkn)) || null;
		if (existing) {
			assetIdBySec.set(sec.key, existing.id);
			matched++;
			continue;
		}
		const id = stableId('asset', `${ext.source}:${sec.isin ?? sec.wkn ?? sec.ticker ?? sec.key}`);
		assetIdBySec.set(sec.key, id);
		newAssets.push({
			id,
			name: sec.name,
			isin: sec.isin,
			wkn: sec.wkn,
			currency: sec.currency,
			classification: 'unknown',
			prices: sec.prices,
			formatConfig: null,
			rawCSV: null,
			rawCSVStoredAt: null,
			createdAt: now,
			updatedAt: now,
			lastRefreshedAt: null
		});
	}
	const portfolioIdByKey = new Map<string, string>();
	const portfolios: Portfolio[] = [];
	for (const p of ext.portfolios) {
		if (options.targetPortfolioId) {
			portfolioIdByKey.set(p.key, options.targetPortfolioId);
			continue;
		}
		const id = stableId('portfolio', `${ext.source}:${p.key}:${p.name}`);
		portfolioIdByKey.set(p.key, id);
		portfolios.push({
			id,
			name: p.name,
			mode: 'tracked',
			allocations: [],
			isBenchmark: false,
			trackCash: p.trackCash,
			cashCurrency: p.currency,
			sourceStrategyId: null,
			rebalance: 'none',
			createdAt: now,
			updatedAt: now
		});
	}
	const transactions: Transaction[] = ext.transactions.map((t, i) => {
		const portfolioId = portfolioIdByKey.get(t.portfolioKey) ?? options.targetPortfolioId ?? portfolios[0]?.id ?? '';
		return {
			id: stableId('tx', `${ext.source}:${portfolioId}:${t.externalId ?? i}`),
			portfolioId,
			type: t.type,
			assetId: t.securityKey ? (assetIdBySec.get(t.securityKey) ?? '') : '',
			date: t.date,
			quantity: t.quantity,
			price: t.price,
			fee: t.fee,
			amount: t.amount,
			withholdingTax: t.withholdingTax,
			currency: t.currency,
			notes: t.notes,
			createdAt: now,
			updatedAt: now
		};
	});
	return { data: { assets: newAssets, portfolios, transactions }, matchedAssets: matched, newAssets: newAssets.length };
}
