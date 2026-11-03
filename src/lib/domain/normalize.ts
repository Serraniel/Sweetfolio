/**
 * Defensive normalization of persisted/imported records. Fills defaults for
 * fields added over time so that data from v0.5.x, the epic branch and old
 * export files is always complete (P-11).
 */
import { normalizeSeries } from '#lib/core/series.ts';
import {
	ASSET_CLASSIFICATIONS,
	BOND_MATURITIES,
	DEFAULT_SETTINGS,
	EQUITY_STYLES,
	EXPOSURE_CLASSES,
	EXPOSURE_REGIONS,
	TRANSACTION_TYPES,
	type Asset,
	type AssetClassification,
	type BenchmarkRef,
	type CurrencyRate,
	type Exposure,
	type Portfolio,
	type PortfolioMode,
	type RebalanceFrequency,
	type Settings,
	type Strategy,
	type StrategyGroupNode,
	type StrategyNode,
	type Transaction,
	type TransactionType
} from './types.ts';

type Loose = Record<string, unknown>;
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const now = () => new Date().toISOString();

const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d);

export function normalizeExposure(raw: unknown): Exposure | null {
	if (!raw || typeof raw !== 'object') return null;
	const e = raw as Loose;
	return {
		assetClass: oneOf(EXPOSURE_CLASSES, e.assetClass, 'unknown'),
		region: oneOf(EXPOSURE_REGIONS, e.region, 'other'),
		style: oneOf(EQUITY_STYLES, e.style, 'broad'),
		maturity: oneOf(BOND_MATURITIES, e.maturity, 'intermediate'),
		leverage: num(e.leverage, 1) || 1,
		source: oneOf(['auto', 'guess', 'manual'] as const, e.source, 'auto')
	};
}

export function normalizeAsset(raw: unknown): Asset {
	const a = (raw ?? {}) as Loose;
	const cls = str(a.classification) as AssetClassification;
	const prices = Array.isArray(a.prices)
		? normalizeSeries(
				(a.prices as Loose[])
					.map((p) => ({ date: str(p?.date), close: Number(p?.close) }))
					.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date))
			)
		: [];
	return {
		id: str(a.id),
		name: str(a.name, 'Unnamed asset'),
		isin: strOrNull(a.isin)?.toUpperCase() ?? null,
		wkn: strOrNull(a.wkn)?.toUpperCase() ?? null,
		currency: str(a.currency, 'EUR').toUpperCase() || 'EUR',
		classification: ASSET_CLASSIFICATIONS.includes(cls) ? cls : 'unknown',
		prices,
		formatConfig:
			a.formatConfig && typeof a.formatConfig === 'object' ? ({ ...(a.formatConfig as object) } as Asset['formatConfig']) : null,
		rawCSV: strOrNull(a.rawCSV),
		rawCSVStoredAt: strOrNull(a.rawCSVStoredAt),
		createdAt: str(a.createdAt, now()),
		updatedAt: str(a.updatedAt, str(a.createdAt, now())),
		lastRefreshedAt: strOrNull(a.lastRefreshedAt),
		exposure: normalizeExposure(a.exposure)
	};
}

export function normalizePortfolio(raw: unknown): Portfolio {
	const p = (raw ?? {}) as Loose;
	const mode = str(p.mode) as PortfolioMode;
	const rebalance = str(p.rebalance) as RebalanceFrequency;
	return {
		id: str(p.id),
		name: str(p.name, 'Unnamed portfolio'),
		mode: mode === 'tracked' || mode === 'both' ? mode : 'model',
		allocations: Array.isArray(p.allocations)
			? (p.allocations as Loose[])
					.map((a) => ({ assetId: str(a?.assetId), weight: num(a?.weight) }))
					.filter((a) => a.assetId && a.weight > 0)
			: [],
		isBenchmark: p.isBenchmark === true,
		trackCash: p.trackCash === true,
		cashCurrency: str(p.cashCurrency, 'EUR') || 'EUR',
		sourceStrategyId: strOrNull(p.sourceStrategyId),
		rebalance: ['none', 'monthly', 'quarterly', 'annually'].includes(rebalance) ? rebalance : 'none',
		createdAt: str(p.createdAt, now()),
		updatedAt: str(p.updatedAt, str(p.createdAt, now()))
	};
}

function normalizeNode(raw: unknown): StrategyNode | null {
	const n = (raw ?? {}) as Loose;
	if (n.type === 'leaf') {
		const assetId = str(n.assetId);
		return assetId ? { type: 'leaf', id: str(n.id) || crypto.randomUUID(), assetId, weight: num(n.weight) } : null;
	}
	if (n.type === 'group') return normalizeGroup(n);
	return null;
}

function normalizeGroup(n: Loose): StrategyGroupNode {
	return {
		type: 'group',
		id: str(n.id) || crypto.randomUUID(),
		label: str(n.label, 'Group'),
		weight: num(n.weight, 1),
		children: Array.isArray(n.children) ? (n.children.map(normalizeNode).filter(Boolean) as StrategyNode[]) : []
	};
}

export function normalizeStrategy(raw: unknown): Strategy {
	const s = (raw ?? {}) as Loose;
	const root = normalizeGroup((s.root ?? {}) as Loose);
	return {
		id: str(s.id),
		name: str(s.name, 'Unnamed strategy'),
		root: { ...root, weight: 1 },
		generatedPortfolioIds: Array.isArray(s.generatedPortfolioIds)
			? s.generatedPortfolioIds.filter((x): x is string => typeof x === 'string')
			: [],
		createdAt: str(s.createdAt, now()),
		updatedAt: str(s.updatedAt, str(s.createdAt, now()))
	};
}

export function normalizeTransaction(raw: unknown): Transaction {
	const t = (raw ?? {}) as Loose;
	const type = str(t.type) as TransactionType;
	return {
		id: str(t.id),
		portfolioId: str(t.portfolioId),
		type: TRANSACTION_TYPES.includes(type) ? type : 'buy',
		assetId: str(t.assetId),
		date: str(t.date).slice(0, 10),
		quantity: numOrNull(t.quantity),
		price: numOrNull(t.price),
		fee: num(t.fee),
		amount: numOrNull(t.amount),
		withholdingTax: num(t.withholdingTax),
		currency: str(t.currency, 'EUR').toUpperCase() || 'EUR',
		notes: str(t.notes),
		createdAt: str(t.createdAt, now()),
		updatedAt: str(t.updatedAt, str(t.createdAt, now()))
	};
}

export function normalizeCurrencyRate(raw: unknown): CurrencyRate {
	const c = (raw ?? {}) as Loose;
	const rates = Array.isArray(c.rates)
		? (c.rates as Loose[])
				.map((r) => ({ date: str(r?.date), rate: Number(r?.rate) }))
				.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.rate) && r.rate > 0)
				.sort((a, b) => (a.date < b.date ? -1 : 1))
		: [];
	return { pair: str(c.pair).toUpperCase(), rates };
}

function isBenchmarkRef(v: unknown): v is BenchmarkRef {
	const b = v as Loose;
	return !!b && (b.type === 'asset' || b.type === 'portfolio') && typeof b.id === 'string';
}

/** Merge stored key/value settings onto defaults with type checks. */
export function normalizeSettings(values: Record<string, unknown>): Settings {
	const d = DEFAULT_SETTINGS;
	const bool = (k: keyof Settings) => (typeof values[k] === 'boolean' ? (values[k] as boolean) : (d[k] as boolean));
	const s = (k: keyof Settings) => (typeof values[k] === 'string' ? (values[k] as string) : (d[k] as string));
	const rf = values.riskFreeRate;
	const tokens = values.parqetTokens as Loose | null | undefined;
	return {
		mainCurrency: s('mainCurrency').toUpperCase() || 'EUR',
		riskFreeRate:
			typeof rf === 'number' && Number.isFinite(rf)
				? rf
				: typeof rf === 'string' && rf.trim() !== '' && Number.isFinite(Number(rf))
					? Number(rf)
					: 0,
		benchmark: isBenchmarkRef(values.benchmark) ? values.benchmark : null,
		autoImportMode: bool('autoImportMode'),
		autoResolveNames: bool('autoResolveNames'),
		autoRefreshAssets: bool('autoRefreshAssets'),
		alphaVantageApiKey: s('alphaVantageApiKey'),
		corsProxyUrl: s('corsProxyUrl'),
		dataSourcePrimary: values.dataSourcePrimary === 'alphavantage' ? 'alphavantage' : 'onvista',
		completedMigrations: Array.isArray(values.completedMigrations)
			? values.completedMigrations.filter((x): x is string => typeof x === 'string')
			: [],
		parqetTokens:
			tokens && typeof tokens.accessToken === 'string'
				? { accessToken: tokens.accessToken, refreshToken: strOrNull(tokens.refreshToken), expiresAt: num(tokens.expiresAt) }
				: null
	};
}
