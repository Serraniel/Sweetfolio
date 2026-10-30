/** Pure query helpers over a `sweetfolio-ai` export (EX-8). */

export interface AIExport {
	format: 'sweetfolio-ai';
	version: string;
	exportedAt: string;
	description: string;
	manifest: unknown;
	data: {
		portfolios: Array<{
			id: string;
			name: string;
			mode: string;
			currency: string;
			targetAllocations: Array<{ assetId: string; assetName: string; weight: number }>;
			holdings: Array<{ assetId: string; assetName: string; quantity: number; averageCost: number; marketValue: number; weight: number }>;
			transactions: Array<Record<string, unknown> & { id: string; date: string; type: string; assetId: string }>;
		}>;
		assets: Array<{
			id: string;
			name: string;
			isin: string | null;
			wkn: string | null;
			currency: string;
			classification: string;
			latestPrice: number | null;
			latestPriceDate: string | null;
			priceHistory?: Array<{ date: string; close: number }>;
		}>;
	};
}

export function parseExport(text: string): AIExport {
	const parsed = JSON.parse(text) as Partial<AIExport>;
	if (parsed.format !== 'sweetfolio-ai' || !parsed.data) throw new Error('Not a Sweetfolio AI export (expected format "sweetfolio-ai").');
	return parsed as AIExport;
}

function findPortfolio(exp: AIExport, idOrName: string) {
	const q = idOrName.toLowerCase();
	const p = exp.data.portfolios.find((x) => x.id === idOrName || x.name.toLowerCase() === q);
	if (!p) throw new Error(`Portfolio "${idOrName}" not found. Use get_portfolios to list portfolios.`);
	return p;
}

function findAsset(exp: AIExport, ref: string) {
	const q = ref.toLowerCase();
	const a = exp.data.assets.find(
		(x) => x.id === ref || x.isin?.toLowerCase() === q || x.wkn?.toLowerCase() === q || x.name.toLowerCase() === q
	);
	if (!a) throw new Error(`Asset "${ref}" not found. Use get_assets to list assets.`);
	return a;
}

export function getPortfolios(exp: AIExport) {
	return exp.data.portfolios.map((p) => ({
		id: p.id,
		name: p.name,
		mode: p.mode,
		currency: p.currency,
		transactionCount: p.transactions.length,
		holdingCount: p.holdings.length,
		marketValue: p.holdings.reduce((s, h) => s + h.marketValue, 0),
		targetAllocations: p.targetAllocations
	}));
}

export function getTransactions(
	exp: AIExport,
	portfolio: string,
	filter: { type?: string; from?: string; to?: string; asset?: string } = {}
) {
	const p = findPortfolio(exp, portfolio);
	const assetId = filter.asset ? findAsset(exp, filter.asset).id : null;
	return p.transactions
		.filter(
			(t) =>
				(!filter.type || t.type === filter.type) &&
				(!filter.from || t.date >= filter.from) &&
				(!filter.to || t.date <= filter.to) &&
				(!assetId || t.assetId === assetId)
		)
		.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function getHoldings(exp: AIExport, portfolio: string) {
	const p = findPortfolio(exp, portfolio);
	return { portfolio: p.name, currency: p.currency, holdings: p.holdings };
}

export function getAssets(exp: AIExport) {
	return exp.data.assets.map(({ priceHistory: _h, ...a }) => a);
}

export function getAssetPrices(exp: AIExport, asset: string, range: { from?: string; to?: string } = {}) {
	const a = findAsset(exp, asset);
	if (!a.priceHistory)
		return {
			asset: a.name,
			note: 'The export was created without price history. Re-export with "Include full price history".',
			latestPrice: a.latestPrice,
			latestPriceDate: a.latestPriceDate
		};
	return {
		asset: a.name,
		currency: a.currency,
		prices: a.priceHistory.filter((p) => (!range.from || p.date >= range.from) && (!range.to || p.date <= range.to))
	};
}
