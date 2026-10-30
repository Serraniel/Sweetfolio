/**
 * Application state: reactive collections backed by IndexedDB. Collections are
 * `$state.raw` arrays replaced immutably, so values written to IndexedDB are
 * never Svelte proxies.
 */
import {
	DEFAULT_SETTINGS,
	type Asset,
	type BenchmarkRef,
	type CurrencyRate,
	type Portfolio,
	type PricePoint,
	type Settings,
	type Strategy,
	type Transaction
} from '#lib/domain/types.ts';
import {
	normalizeAsset,
	normalizeCurrencyRate,
	normalizePortfolio,
	normalizeSettings,
	normalizeStrategy,
	normalizeTransaction
} from '#lib/domain/normalize.ts';
import { convertPrices, type ConversionStatus } from '#lib/core/currency.ts';
import { backtestPortfolio } from '#lib/core/backtest.ts';
import { openDB } from '#lib/storage/db.ts';
import * as repo from '#lib/storage/repo.ts';
import type { Scope } from '#lib/io/schema.ts';
import { buildSlugs, findBySlug } from './slugs.ts';
import { deleteAssetChanges, deletePortfolioChanges, deleteStrategyChanges, type ChangeSet, type DataSnapshot } from './cascade.ts';

export interface ConvertedSeries {
	prices: PricePoint[];
	status: ConversionStatus;
}

function upsert<T extends { id: string }>(list: readonly T[], items: readonly T[]): T[] {
	if (!items.length) return list as T[];
	const map = new Map(items.map((i) => [i.id, i]));
	const out = list.map((x) => map.get(x.id) ?? x);
	const existing = new Set(list.map((x) => x.id));
	for (const i of items) if (!existing.has(i.id)) out.push(i);
	return out;
}

function without<T extends { id: string }>(list: readonly T[], ids: readonly string[]): T[] {
	if (!ids.length) return list as T[];
	const set = new Set(ids);
	return list.filter((x) => !set.has(x.id));
}

const RAW_CSV_TTL_MS = 30 * 24 * 60 * 60 * 1000;

class AppState {
	assets = $state.raw<Asset[]>([]);
	portfolios = $state.raw<Portfolio[]>([]);
	strategies = $state.raw<Strategy[]>([]);
	transactions = $state.raw<Transaction[]>([]);
	currencies = $state.raw<CurrencyRate[]>([]);
	settings = $state.raw<Settings>(DEFAULT_SETTINGS);
	ready = $state(false);
	loadError = $state<string | null>(null);
	/** Another tab upgraded the database; this tab must reload (DP-6). */
	staleTab = $state(false);

	assetById = $derived(new Map(this.assets.map((a) => [a.id, a])));
	portfolioById = $derived(new Map(this.portfolios.map((p) => [p.id, p])));
	assetSlugs = $derived(buildSlugs(this.assets));
	portfolioSlugs = $derived(buildSlugs(this.portfolios));
	strategySlugs = $derived(buildSlugs(this.strategies));
	riskFreeRate = $derived(this.settings.riskFreeRate / 100);

	private conversionCache = new Map<string, { asset: Asset; currencies: CurrencyRate[]; target: string; value: ConvertedSeries }>();

	async init(): Promise<void> {
		if (this.ready) return;
		try {
			await openDB({ onVersionChange: () => (this.staleTab = true), onBlocked: () => (this.staleTab = true) });
			const [assets, portfolios, strategies, transactions, currencies, settings] = await Promise.all([
				repo.getAll('assets'),
				repo.getAll('portfolios'),
				repo.getAll('strategies'),
				repo.getAll('transactions'),
				repo.getAll('currencies'),
				repo.getSettings()
			]);
			this.assets = assets.map(normalizeAsset);
			this.portfolios = portfolios.map(normalizePortfolio);
			this.strategies = strategies.map(normalizeStrategy);
			this.transactions = transactions.map(normalizeTransaction);
			this.currencies = currencies.map(normalizeCurrencyRate);
			this.settings = normalizeSettings(settings);
			await this.adoptLegacyBenchmark();
			await this.purgeExpiredRawCsv();
			this.ready = true;
		} catch (err) {
			this.loadError = err instanceof Error ? err.message : String(err);
			throw err;
		}
	}

	private async adoptLegacyBenchmark() {
		if (this.settings.benchmark) return;
		const legacy = this.portfolios.find((p) => p.isBenchmark);
		if (legacy) await this.updateSettings({ benchmark: { type: 'portfolio', id: legacy.id } });
	}

	private async purgeExpiredRawCsv() {
		const now = Date.now();
		const expired = this.assets.filter((a) => a.rawCSV && a.rawCSVStoredAt && now - Date.parse(a.rawCSVStoredAt) > RAW_CSV_TTL_MS);
		if (expired.length) await this.saveAssets(expired.map((a) => ({ ...a, rawCSV: null, rawCSVStoredAt: null })));
	}

	snapshot(): DataSnapshot {
		return {
			assets: this.assets,
			portfolios: this.portfolios,
			strategies: this.strategies,
			transactions: this.transactions,
			benchmark: this.settings.benchmark
		};
	}

	// --- Lookups -----------------------------------------------------------------

	assetBySlug(slug: string) {
		return findBySlug(this.assets, this.assetSlugs, slug);
	}
	portfolioBySlug(slug: string) {
		return findBySlug(this.portfolios, this.portfolioSlugs, slug);
	}
	strategyBySlug(slug: string) {
		return findBySlug(this.strategies, this.strategySlugs, slug);
	}
	assetSlug(id: string) {
		return this.assetSlugs.get(id) ?? id;
	}
	portfolioSlug(id: string) {
		return this.portfolioSlugs.get(id) ?? id;
	}
	strategySlug(id: string) {
		return this.strategySlugs.get(id) ?? id;
	}
	transactionsOf(portfolioId: string) {
		return this.transactions.filter((t) => t.portfolioId === portfolioId);
	}

	/** Asset prices converted to `target` (default: main currency), memoized (CU-1). */
	converted(asset: Asset, target = this.settings.mainCurrency): ConvertedSeries {
		const key = `${asset.id}|${target}`;
		const hit = this.conversionCache.get(key);
		if (hit && hit.asset === asset && hit.currencies === this.currencies && hit.target === target) return hit.value;
		const value = convertPrices(asset.prices, asset.currency, target, this.currencies);
		this.conversionCache.set(key, { asset, currencies: this.currencies, target, value });
		return value;
	}

	/** Backtested model portfolio series in the main currency (PM-2). */
	portfolioSeries(p: Portfolio): { prices: PricePoint[]; missing: string[]; unconverted: string[] } {
		const missing: string[] = [];
		const unconverted: string[] = [];
		const parts = p.allocations.flatMap((a) => {
			const asset = this.assetById.get(a.assetId);
			if (!asset) {
				missing.push(a.assetId);
				return [];
			}
			const c = this.converted(asset);
			if (c.status === 'missing') unconverted.push(asset.name);
			return [{ id: asset.id, prices: c.prices, weight: a.weight }];
		});
		return { prices: backtestPortfolio(parts, p.rebalance ?? 'none'), missing, unconverted };
	}

	benchmarkResolved = $derived.by(() => {
		const ref = this.settings.benchmark;
		if (!ref) return null;
		if (ref.type === 'asset') {
			const a = this.assetById.get(ref.id);
			return a ? { ref, name: a.name, kind: 'asset' as const } : null;
		}
		const p = this.portfolioById.get(ref.id);
		return p && p.allocations.length ? { ref, name: p.name, kind: 'portfolio' as const } : null;
	});

	benchmarkSeries(): PricePoint[] | null {
		const b = this.benchmarkResolved;
		if (!b) return null;
		if (b.kind === 'asset') return this.converted(this.assetById.get(b.ref.id)!).prices;
		return this.portfolioSeries(this.portfolioById.get(b.ref.id)!).prices;
	}

	isBenchmark(type: BenchmarkRef['type'], id: string) {
		const b = this.settings.benchmark;
		return !!b && b.type === type && b.id === id;
	}

	async toggleBenchmark(type: BenchmarkRef['type'], id: string) {
		await this.updateSettings({ benchmark: this.isBenchmark(type, id) ? null : { type, id } });
	}

	// --- Writes ------------------------------------------------------------------

	async saveAssets(items: Asset[]) {
		const plain = items.map(normalizeAsset);
		await repo.putMany('assets', plain);
		this.assets = upsert(this.assets, plain);
	}
	saveAsset(a: Asset) {
		return this.saveAssets([a]);
	}

	async savePortfolios(items: Portfolio[]) {
		const plain = items.map(normalizePortfolio);
		await repo.putMany('portfolios', plain);
		this.portfolios = upsert(this.portfolios, plain);
	}
	savePortfolio(p: Portfolio) {
		return this.savePortfolios([p]);
	}

	async saveStrategies(items: Strategy[]) {
		const plain = items.map(normalizeStrategy);
		await repo.putMany('strategies', plain);
		this.strategies = upsert(this.strategies, plain);
	}
	saveStrategy(s: Strategy) {
		return this.saveStrategies([s]);
	}

	async saveTransactions(items: Transaction[]) {
		const plain = items.map(normalizeTransaction);
		await repo.putMany('transactions', plain);
		this.transactions = upsert(this.transactions, plain);
	}

	async deleteTransactions(ids: string[]) {
		await repo.remove('transactions', ids);
		this.transactions = without(this.transactions, ids);
	}

	async saveCurrencies(items: CurrencyRate[]) {
		const plain = items.map(normalizeCurrencyRate);
		await repo.putMany('currencies', plain);
		const map = new Map(plain.map((c) => [c.pair, c]));
		this.currencies = [...this.currencies.filter((c) => !map.has(c.pair)), ...plain];
	}

	async deleteCurrency(pair: string) {
		await repo.remove('currencies', pair);
		this.currencies = this.currencies.filter((c) => c.pair !== pair);
	}

	async updateSettings(patch: Partial<Settings>) {
		const plain = JSON.parse(JSON.stringify(patch)) as Partial<Settings>;
		await repo.setSettings(plain);
		this.settings = normalizeSettings({ ...this.settings, ...plain });
	}

	async applyChanges(cs: ChangeSet) {
		await repo.batch([
			{ store: 'assets', put: cs.put.assets, delete: cs.delete.assets },
			{ store: 'portfolios', put: cs.put.portfolios, delete: cs.delete.portfolios },
			{ store: 'strategies', put: cs.put.strategies, delete: cs.delete.strategies },
			{ store: 'transactions', put: cs.put.transactions, delete: cs.delete.transactions }
		]);
		this.assets = without(upsert(this.assets, cs.put.assets), cs.delete.assets);
		this.portfolios = without(upsert(this.portfolios, cs.put.portfolios), cs.delete.portfolios);
		this.strategies = without(upsert(this.strategies, cs.put.strategies), cs.delete.strategies);
		this.transactions = without(upsert(this.transactions, cs.put.transactions), cs.delete.transactions);
		if (cs.benchmark !== undefined) await this.updateSettings({ benchmark: cs.benchmark });
	}

	deleteAsset(id: string) {
		return this.applyChanges(deleteAssetChanges(this.snapshot(), id));
	}
	deletePortfolio(id: string) {
		return this.applyChanges(deletePortfolioChanges(this.snapshot(), id));
	}
	deleteStrategy(id: string) {
		return this.applyChanges(deleteStrategyChanges(this.snapshot(), id));
	}

	/** Write the resolved items of an import (DP-3). */
	async applyImport(items: { [S in Scope]: unknown[] }) {
		await this.saveAssets(items.assets as Asset[]);
		await this.savePortfolios(items.portfolios as Portfolio[]);
		await this.saveStrategies(items.strategies as Strategy[]);
		await this.saveTransactions(items.transactions as Transaction[]);
		await this.saveCurrencies(items.currencies as CurrencyRate[]);
		if (items.simulations.length) await repo.putMany('simulations', items.simulations as never[]);
		const settings = Object.fromEntries((items.settings as Array<{ key: string; value: unknown }>).map((s) => [s.key, s.value]));
		if (Object.keys(settings).length) await this.updateSettings(settings as Partial<Settings>);
	}

	async clearAll() {
		await repo.clearAll();
		this.assets = [];
		this.portfolios = [];
		this.strategies = [];
		this.transactions = [];
		this.currencies = [];
		this.settings = DEFAULT_SETTINGS;
		this.conversionCache.clear();
	}
}

export const app = new AppState();
