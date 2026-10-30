/** Sweetfolio backup file format (DP-2, DP-3). */
import type { Asset, CurrencyRate, Portfolio, Strategy, StoredSimulation, Transaction } from '#lib/domain/types.ts';
import {
	normalizeAsset,
	normalizeCurrencyRate,
	normalizePortfolio,
	normalizeStrategy,
	normalizeTransaction
} from '#lib/domain/normalize.ts';

/**
 * Format versions: 1–2 (v0.5), 3 strategies, 4 transactions + portfolio modes
 * (epic branch), 5 rewrite (cash transaction types, rebalance frequency).
 */
export const CURRENT_VERSION = 5;

export const ALL_SCOPES = ['assets', 'portfolios', 'strategies', 'transactions', 'settings', 'currencies', 'simulations'] as const;
export type Scope = (typeof ALL_SCOPES)[number];

export interface ExportData {
	assets?: Asset[];
	portfolios?: Portfolio[];
	strategies?: Strategy[];
	transactions?: Transaction[];
	settings?: Record<string, unknown>;
	currencies?: CurrencyRate[];
	simulations?: StoredSimulation[];
}

export interface SweetfolioExport {
	format: 'sweetfolio';
	version: number;
	exportedAt: string;
	scopes: Scope[];
	data: ExportData;
}

/** Settings that must never leave the device in a backup. */
export const PRIVATE_SETTINGS = ['parqetTokens', 'completedMigrations'];

export function isExportEnvelope(v: unknown): v is SweetfolioExport {
	const o = v as Record<string, unknown> | null;
	return (
		!!o &&
		o.format === 'sweetfolio' &&
		typeof o.version === 'number' &&
		Number.isInteger(o.version) &&
		o.version >= 1 &&
		typeof o.data === 'object' &&
		o.data !== null
	);
}

/** Upgrade an envelope of any supported version to CURRENT_VERSION. */
export function migrateExport(input: SweetfolioExport): SweetfolioExport {
	if (input.version > CURRENT_VERSION)
		throw new Error(`This backup was created by a newer Sweetfolio (format ${input.version}). Please update Sweetfolio first.`);
	const d = input.data ?? {};
	const data: ExportData = {};
	// Normalization covers all historical shapes (classification added in v2, modes in v4 …).
	if (Array.isArray(d.assets)) data.assets = d.assets.map(normalizeAsset).filter((a) => a.id);
	if (Array.isArray(d.portfolios)) data.portfolios = d.portfolios.map(normalizePortfolio).filter((p) => p.id);
	if (Array.isArray(d.strategies)) data.strategies = d.strategies.map(normalizeStrategy).filter((s) => s.id);
	if (Array.isArray(d.transactions)) data.transactions = d.transactions.map(normalizeTransaction).filter((t) => t.id);
	if (Array.isArray(d.currencies)) data.currencies = d.currencies.map(normalizeCurrencyRate).filter((c) => c.pair);
	if (Array.isArray(d.simulations)) data.simulations = d.simulations.filter((s) => s && typeof s.id === 'string');
	if (d.settings && typeof d.settings === 'object') {
		data.settings = Object.fromEntries(Object.entries(d.settings).filter(([k]) => !PRIVATE_SETTINGS.includes(k)));
	}
	const scopes = (Array.isArray(input.scopes) ? input.scopes : []).filter((s): s is Scope => (ALL_SCOPES as readonly string[]).includes(s));
	for (const s of ALL_SCOPES) if (data[s] !== undefined && !scopes.includes(s)) scopes.push(s);
	return { format: 'sweetfolio', version: CURRENT_VERSION, exportedAt: input.exportedAt ?? new Date().toISOString(), scopes, data };
}

export function parseBackup(text: string): SweetfolioExport {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('The file is not valid JSON.');
	}
	if (!isExportEnvelope(parsed)) throw new Error('This is not a Sweetfolio backup file.');
	return migrateExport(parsed);
}
