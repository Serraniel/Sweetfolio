/**
 * Domain model. These shapes are persisted in IndexedDB and in export files,
 * so field names stay compatible with Sweetfolio v0.5.x and the epic branch.
 */

/** ISO calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

export interface PricePoint {
	date: ISODate;
	close: number;
}

export const ASSET_CLASSIFICATIONS = [
	'stock',
	'etf',
	'etn',
	'etc',
	'fund',
	'bond',
	'certificate',
	'crypto',
	'commodity',
	'unknown'
] as const;
export type AssetClassification = (typeof ASSET_CLASSIFICATIONS)[number];

export interface DetectedFormat {
	delimiter: string;
	decimalSeparator: string;
	dateFormat: DateFormat;
	hasHeader: boolean;
	dateColumn: number;
	closeColumn: number;
	ambiguous?: boolean;
}

export const DATE_FORMATS = ['DD.MM.YYYY', 'DD-MM-YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'MM-DD-YYYY'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Economic exposure of an asset, used by the crisis tester to pick proxy data (CR-1). */
export const EXPOSURE_CLASSES = ['equity', 'govBond', 'corpBond', 'gold', 'commodity', 'crypto', 'cash', 'mixed', 'unknown'] as const;
export type ExposureClass = (typeof EXPOSURE_CLASSES)[number];
export const EXPOSURE_REGIONS = ['world', 'us', 'europe', 'germany', 'emerging', 'japan', 'other'] as const;
export type ExposureRegion = (typeof EXPOSURE_REGIONS)[number];
export const EQUITY_STYLES = ['broad', 'tech'] as const;
export type EquityStyle = (typeof EQUITY_STYLES)[number];
export const BOND_MATURITIES = ['short', 'intermediate', 'long'] as const;
export type BondMaturity = (typeof BOND_MATURITIES)[number];

export interface Exposure {
	assetClass: ExposureClass;
	region: ExposureRegion;
	/** Equities only. */
	style: EquityStyle;
	/** Bonds only. */
	maturity: BondMaturity;
	/** Daily leverage factor; negative for short products. */
	leverage: number;
	/** `auto`: from market data, `guess`: from the name only, `manual`: set by the user. */
	source: 'auto' | 'guess' | 'manual';
}

export interface Asset {
	id: string;
	name: string;
	isin: string | null;
	wkn: string | null;
	currency: string;
	classification: AssetClassification;
	prices: PricePoint[];
	formatConfig: DetectedFormat | null;
	rawCSV: string | null;
	rawCSVStoredAt: string | null;
	createdAt: string;
	updatedAt: string;
	lastRefreshedAt: string | null;
	/** Missing on assets created before the crisis tester; derived on demand then. */
	exposure?: Exposure | null;
}

export type PortfolioMode = 'model' | 'tracked' | 'both';
export type RebalanceFrequency = 'none' | 'monthly' | 'quarterly' | 'annually';

export interface Allocation {
	assetId: string;
	weight: number;
}

export interface Portfolio {
	id: string;
	name: string;
	mode: PortfolioMode;
	allocations: Allocation[];
	/** Legacy flag (v0.5); the benchmark now lives in the `benchmark` setting. */
	isBenchmark: boolean;
	trackCash: boolean;
	cashCurrency: string;
	sourceStrategyId: string | null;
	rebalance?: RebalanceFrequency;
	createdAt: string;
	updatedAt: string;
}

export interface StrategyGroupNode {
	type: 'group';
	id: string;
	label: string;
	weight: number;
	children: StrategyNode[];
}

export interface StrategyLeafNode {
	type: 'leaf';
	id: string;
	assetId: string;
	weight: number;
}

export type StrategyNode = StrategyGroupNode | StrategyLeafNode;

export interface Strategy {
	id: string;
	name: string;
	root: StrategyGroupNode;
	generatedPortfolioIds: string[];
	createdAt: string;
	updatedAt: string;
}

export const TRANSACTION_TYPES = ['buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'tax'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
/** Transaction types that change a security position. */
export const POSITION_TYPES: ReadonlySet<TransactionType> = new Set(['buy', 'sell']);
/** Transaction types that need an asset. */
export const ASSET_TYPES: ReadonlySet<TransactionType> = new Set(['buy', 'sell', 'dividend']);

export interface Transaction {
	id: string;
	portfolioId: string;
	type: TransactionType;
	/** Empty string for pure cash transactions (deposit, withdrawal, fee, tax). */
	assetId: string;
	date: ISODate;
	quantity: number | null;
	price: number | null;
	fee: number;
	/** Gross amount for dividends and cash transactions. */
	amount: number | null;
	withholdingTax: number;
	currency: string;
	notes: string;
	createdAt: string;
	updatedAt: string;
}

export interface CurrencyRate {
	/** Pair code `SRCDST`, e.g. `USDEUR` = EUR per 1 USD. */
	pair: string;
	rates: Array<{ date: ISODate; rate: number }>;
}

export type PeriodKey = '1y' | '3y' | '5y' | '10y' | '15y' | 'all';
export const PERIOD_KEYS: readonly PeriodKey[] = ['1y', '3y', '5y', '10y', '15y', 'all'];

export interface PeriodMetrics {
	cumulativeReturn: number;
	annualizedReturn: number;
	volatility: number;
	sharpeRatio: number;
	maxDrawdown: number;
	startDate: ISODate;
	endDate: ISODate;
}

export type MetricsResult = Record<PeriodKey, PeriodMetrics | null>;

export interface CorrelationMatrix {
	ids: string[];
	matrix: number[][];
}

export interface WeightConstraint {
	min: number;
	max: number;
	/** Minimum weight once held: the asset is either 0 or at least this (MC-4). */
	floor?: number;
}

export interface MonteCarloConfig {
	simulationCount: number;
	assetIds: string[];
	riskFreeRate: number;
	constraints?: Record<string, WeightConstraint>;
	benchmarkPortfolioId?: string | null;
}

export interface SimulatedPortfolio {
	weights: Record<string, number>;
	annualizedReturn: number;
	volatility: number;
	sharpeRatio: number;
}

export interface MonteCarloResult {
	assetIds: string[];
	/** Per simulated portfolio: volatility, return, sharpe. */
	volatilities: Float64Array;
	returns: Float64Array;
	sharpes: Float64Array;
	/** Row-major weights matrix, `count × assetIds.length`. */
	weights: Float32Array;
	count: number;
	/** Indices into the arrays above, ascending volatility. */
	frontier: number[];
	/** Common history the estimates are based on. */
	window: { start: string; end: string; observations: number };
	assetStats: Array<{ id: string; annualizedReturn: number; volatility: number }>;
	/** Frontier found heuristically (asset counts or held minimums make it combinatorial). */
	frontierApproximate?: boolean;
}

export interface StoredSimulation {
	id: string;
	config: MonteCarloConfig;
	results: unknown;
	createdAt: string;
}

export interface BenchmarkRef {
	type: 'asset' | 'portfolio';
	id: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Settings {
	mainCurrency: string;
	/** Percent, e.g. `2.5` for 2.5 %. */
	riskFreeRate: number;
	benchmark: BenchmarkRef | null;
	autoImportMode: boolean;
	autoResolveNames: boolean;
	autoRefreshAssets: boolean;
	alphaVantageApiKey: string;
	corsProxyUrl: string;
	dataSourcePrimary: 'onvista' | 'alphavantage';
	completedMigrations: string[];
	parqetTokens: ParqetTokens | null;
}

export interface ParqetTokens {
	accessToken: string;
	refreshToken: string | null;
	expiresAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
	mainCurrency: 'EUR',
	riskFreeRate: 0,
	benchmark: null,
	autoImportMode: true,
	autoResolveNames: true,
	autoRefreshAssets: true,
	alphaVantageApiKey: '',
	corsProxyUrl: '',
	dataSourcePrimary: 'onvista',
	completedMigrations: [],
	parqetTokens: null
};

export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK'] as const;
