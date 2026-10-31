/** Self-describing AI export (EX-7) consumed by tools/mcp-server. */
import type { Asset, Portfolio, Transaction } from '#lib/domain/types.ts';
import { computeHoldings } from '#lib/core/tracking.ts';

export const AI_EXPORT_VERSION = '2';

export interface AIExport {
	format: 'sweetfolio-ai';
	version: string;
	exportedAt: string;
	description: string;
	manifest: { types: Record<string, { description: string; fields: Record<string, string> }>; notes: string[] };
	data: {
		portfolios: Array<{
			id: string;
			name: string;
			mode: Portfolio['mode'];
			currency: string;
			targetAllocations: Array<{ assetId: string; assetName: string; weight: number }>;
			holdings: Array<{ assetId: string; assetName: string; quantity: number; averageCost: number; marketValue: number; weight: number }>;
			transactions: Array<
				Omit<Transaction, 'portfolioId' | 'createdAt' | 'updatedAt'> & { assetName: string | null; assetIsin: string | null }
			>;
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
			firstPriceDate: string | null;
			priceHistory?: Array<{ date: string; close: number }>;
		}>;
	};
}

export function buildAIExport(
	portfolios: readonly Portfolio[],
	assets: readonly Asset[],
	transactions: readonly Transaction[],
	options: { includePriceHistory?: boolean; now?: string } = {}
): AIExport {
	const byId = new Map(assets.map((a) => [a.id, a]));
	const latest = (id: string) => byId.get(id)?.prices.at(-1)?.close ?? null;
	const used = new Set<string>();
	const pfs = portfolios.map((p) => {
		const txs = transactions.filter((t) => t.portfolioId === p.id);
		txs.forEach((t) => t.assetId && used.add(t.assetId));
		p.allocations.forEach((a) => used.add(a.assetId));
		const summary = computeHoldings(txs, latest, { trackCash: p.trackCash });
		return {
			id: p.id,
			name: p.name,
			mode: p.mode,
			currency: p.cashCurrency,
			targetAllocations: p.allocations.map((a) => ({
				assetId: a.assetId,
				assetName: byId.get(a.assetId)?.name ?? a.assetId,
				weight: a.weight
			})),
			holdings: summary.holdings.map((h) => ({
				assetId: h.assetId,
				assetName: byId.get(h.assetId)?.name ?? h.assetId,
				quantity: h.quantity,
				averageCost: h.avgCost,
				marketValue: h.currentValue,
				weight: h.weight
			})),
			transactions: txs.map(({ portfolioId: _p, createdAt: _c, updatedAt: _u, ...t }) => ({
				...t,
				assetName: byId.get(t.assetId)?.name ?? null,
				assetIsin: byId.get(t.assetId)?.isin ?? null
			}))
		};
	});
	const aiAssets = assets
		.filter((a) => used.has(a.id))
		.map((a) => ({
			id: a.id,
			name: a.name,
			isin: a.isin,
			wkn: a.wkn,
			currency: a.currency,
			classification: a.classification,
			latestPrice: a.prices.at(-1)?.close ?? null,
			latestPriceDate: a.prices.at(-1)?.date ?? null,
			firstPriceDate: a.prices[0]?.date ?? null,
			...(options.includePriceHistory ? { priceHistory: a.prices } : {})
		}));
	return {
		format: 'sweetfolio-ai',
		version: AI_EXPORT_VERSION,
		exportedAt: options.now ?? new Date().toISOString(),
		description: `Sweetfolio portfolio data for AI agents: ${pfs.length} portfolio(s), ${transactions.filter((t) => pfs.some((p) => p.id === t.portfolioId)).length} transaction(s), ${aiAssets.length} asset(s).`,
		manifest: {
			types: {
				portfolio: {
					description: 'A portfolio. mode "model" has target allocations only, "tracked" has transactions, "both" has both.',
					fields: {
						targetAllocations: 'Target weights (fractions summing to 1)',
						holdings: 'Current positions computed with FIFO from transactions, valued at the latest known price',
						transactions: 'All transactions, oldest first is not guaranteed'
					}
				},
				transaction: {
					description: 'A portfolio transaction.',
					fields: {
						type: 'buy | sell | dividend | deposit | withdrawal | fee | tax',
						quantity: 'Units (buy/sell)',
						price: 'Price per unit in `currency` (buy/sell)',
						fee: 'Fees in `currency`',
						amount: 'Gross amount for dividend and cash transactions',
						withholdingTax: 'Withheld tax on dividends'
					}
				},
				asset: {
					description: 'A security, fund or crypto asset with its price history summary.',
					fields: { latestPrice: 'Last known close in `currency`' }
				}
			},
			notes: [
				'Dates are ISO 8601 calendar dates (YYYY-MM-DD).',
				'Weights are fractions (0.25 = 25 %).',
				'Amounts are in the stated currency; no conversion is applied.'
			]
		},
		data: { portfolios: pfs, assets: aiAssets }
	};
}
