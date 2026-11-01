/**
 * Crisis tester state (CR-3 … CR-6): proxy data (bundled FRED rates, index
 * histories downloaded from Onvista), per-asset series extended into the past,
 * and crisis reports for weighted portfolios and the benchmark.
 */
import type { Allocation, Asset, ISODate, Portfolio, PricePoint, RebalanceFrequency } from '#lib/domain/types.ts';
import {
	buildProxy,
	decodeRates,
	extendWithProxy,
	PROXY_INDICES,
	type CrisisRates,
	type CrisisRatesFile,
	type ProxyIndexData,
	type ProxySeries
} from '#lib/core/proxies.ts';
import {
	buildCrisisMatrix,
	compareOutcome,
	CRISES,
	crisisPath,
	crisisScore,
	DEFAULT_TOLERANCE,
	evaluateCrisis,
	rebalanceFlags,
	START_TOLERANCE_DAYS,
	type Crisis,
	type CrisisOutcome,
	type CrisisScoreKind,
	type CrisisTolerance,
	type CrisisType,
	type Verdict
} from '#lib/core/crisis.ts';
import { exposureOf } from '#lib/core/exposure.ts';
import { addDays, todayISO } from '#lib/core/dates.ts';
import {
	buildScenarioMatrix,
	DEFAULT_ASSUMPTIONS,
	KIND_LABELS,
	normalizeAssumptions,
	scenarioCrises,
	scenarioKind,
	type ScenarioAssumptions,
	type ScenarioKind
} from '#lib/core/scenarios.ts';
import { convertPrices } from '#lib/core/currency.ts';
import { longHistory } from '#lib/fetchers/onvista.ts';
import * as repo from '#lib/storage/repo.ts';
import { app } from './app.svelte.ts';
import { notify } from './toasts.svelte.ts';

const PREFS_KEY = 'sweetfolio-crisis-prefs';
const ASSUMPTIONS_KEY = 'sweetfolio-crisis-assumptions';

function readAssumptions(): ScenarioAssumptions {
	try {
		const raw = localStorage.getItem(ASSUMPTIONS_KEY);
		return raw ? normalizeAssumptions(JSON.parse(raw)) : DEFAULT_ASSUMPTIONS;
	} catch {
		return DEFAULT_ASSUMPTIONS;
	}
}

/** Crisis-type scenarios (CR-8) or the replay of historical crises (CR-4). */
export type CrisisModel = 'scenarios' | 'historical';

export interface CrisisPrefs {
	tolerance: CrisisTolerance;
	/** Crises a portfolio may do worse than the benchmark in and still "hold up". */
	allowedMisses: number;
	score: CrisisScoreKind;
	/** Crisis types included in scores and verdicts. */
	types: CrisisType[];
}

const DEFAULT_PREFS: CrisisPrefs = {
	tolerance: DEFAULT_TOLERANCE,
	allowedMisses: 0,
	score: 'worstDrawdown',
	types: ['deflationary', 'stagflation', 'rateShock', 'bubble', 'liquidity', 'geopolitical', 'sovereign']
};

function readPrefs(): CrisisPrefs {
	try {
		const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<CrisisPrefs> | null;
		if (!raw) return DEFAULT_PREFS;
		return {
			tolerance: { ...DEFAULT_TOLERANCE, ...raw.tolerance },
			allowedMisses: Math.max(0, Math.round(raw.allowedMisses ?? 0)),
			score: raw.score && raw.score in { worstDrawdown: 1, meanDrawdown: 1, longestRecovery: 1 } ? raw.score : 'worstDrawdown',
			types: Array.isArray(raw.types) ? raw.types : DEFAULT_PREFS.types
		};
	} catch {
		return DEFAULT_PREFS;
	}
}

export type SourceKind = 'real' | 'proxy' | 'assumed';

export interface AssetCoverage {
	assetId: string;
	name: string;
	kind: SourceKind;
	/** Proxy labels used inside the crisis window. */
	proxies: string[];
	approximate: boolean;
	coarse: boolean;
}

export interface CrisisRow {
	crisis: Crisis;
	outcome: CrisisOutcome | null;
	benchmark: CrisisOutcome | null;
	verdict: Verdict | null;
	/** Assets without data for this crisis. */
	missing: string[];
	coverage: AssetCoverage[];
	/** Included in the score and verdict (crisis type selected). */
	included: boolean;
}

export interface CrisisReport {
	rows: CrisisRow[];
	tested: CrisisRow[];
	score: number;
	benchmarkScore: number;
	worse: number;
	holdsUp: boolean | null;
}

export interface WeightedAsset {
	assetId: string;
	weight: number;
}

class CrisisState {
	rates = $state.raw<CrisisRates | null>(null);
	indices = $state.raw<ReadonlyMap<string, ProxyIndexData>>(new Map());
	loaded = $state(false);
	loadError = $state<string | null>(null);
	downloading = $state(false);
	prefs = $state<CrisisPrefs>(readPrefs());
	/** Assumed behaviour per crisis type and asset kind (per device). */
	assumptions = $state.raw<ScenarioAssumptions>(readAssumptions());
	/** Shown model on the portfolio and compare pages. */
	model = $state<CrisisModel>('scenarios');

	private loading: Promise<void> | null = null;
	private seriesCache = new Map<
		string,
		{ asset: Asset; currency: string; indices: unknown; rates: unknown; currencies: unknown; value: ProxySeries }
	>();

	/** Loads the bundled rates and the stored index histories once. */
	load(): Promise<void> {
		this.loading ??= (async () => {
			try {
				const [file, stored] = await Promise.all([
					fetch('/data/crisis-rates.json').then((r) => {
						if (!r.ok) throw new Error(`Crisis rate data: HTTP ${r.status}`);
						return r.json() as Promise<CrisisRatesFile>;
					}),
					repo.getAll('crisisData')
				]);
				this.rates = decodeRates(file);
				this.indices = new Map(stored.map((d) => [d.key, d]));
			} catch (err) {
				this.loadError = err instanceof Error ? err.message : String(err);
				this.loading = null;
			} finally {
				this.loaded = true;
			}
		})();
		return this.loading;
	}

	savePrefs(patch: Partial<CrisisPrefs>) {
		this.prefs = { ...this.prefs, ...patch };
		try {
			localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
		} catch {
			/* storage unavailable */
		}
	}

	saveAssumptions(a: ScenarioAssumptions) {
		this.assumptions = normalizeAssumptions(a);
		try {
			localStorage.setItem(ASSUMPTIONS_KEY, JSON.stringify(this.assumptions));
		} catch {
			/* storage unavailable */
		}
	}

	resetAssumptions() {
		this.assumptions = DEFAULT_ASSUMPTIONS;
		try {
			localStorage.removeItem(ASSUMPTIONS_KEY);
		} catch {
			/* storage unavailable */
		}
	}

	/** The scenario crises, starting today. */
	scenarios(): Crisis[] {
		return scenarioCrises(this.assumptions, todayISO());
	}

	/** Scenario kind and leverage of an asset, or null when its exposure is unknown. */
	scenarioAsset(asset: Asset): { kind: ScenarioKind; leverage: number } | null {
		const e = exposureOf(asset);
		const kind = scenarioKind(e);
		return kind ? { kind, leverage: e.leverage } : null;
	}

	scenarioCoverage(a: Asset): AssetCoverage | null {
		const s = this.scenarioAsset(a);
		if (!s) return null;
		return {
			assetId: a.id,
			name: a.name,
			kind: 'assumed',
			proxies: [`${KIND_LABELS[s.kind]}${s.leverage !== 1 ? `, ${s.leverage}× daily` : ''}`],
			approximate: false,
			coarse: false
		};
	}

	/** Scenario outcome of weighted assets (CR-8). */
	scenarioOutcome(
		weights: readonly WeightedAsset[],
		rebalance: RebalanceFrequency,
		scenario: Crisis
	): { outcome: CrisisOutcome | null; missing: string[]; coverage: AssetCoverage[] } {
		const known = weights.filter((w) => app.assetById.has(w.assetId));
		const coverage: AssetCoverage[] = [];
		const missing: string[] = [];
		const kinds: Array<{ kind: ScenarioKind; leverage: number }> = [];
		for (const w of known) {
			const a = app.assetById.get(w.assetId)!;
			const s = this.scenarioAsset(a);
			if (!s) {
				missing.push(a.name);
				continue;
			}
			kinds.push(s);
			coverage.push(this.scenarioCoverage(a)!);
		}
		if (missing.length || !kinds.length) return { outcome: null, missing, coverage };
		const m = buildScenarioMatrix(scenario, kinds, this.assumptions);
		const outcome = evaluateCrisis(
			m,
			rebalanceFlags(m.dates, rebalance),
			known.map((w) => w.weight)
		);
		return { outcome, missing, coverage };
	}

	/** Scenario report of a weighted portfolio against the benchmark (CR-8). */
	scenarioReport(weights: readonly WeightedAsset[], rebalance: RebalanceFrequency): CrisisReport {
		const bench = this.benchmarkWeights();
		const types = new Set(this.prefs.types);
		const rows: CrisisRow[] = this.scenarios().map((s) => {
			const own = this.scenarioOutcome(weights, rebalance, s);
			const b = bench ? this.scenarioOutcome(bench.weights, bench.rebalance, s).outcome : null;
			return {
				crisis: s,
				outcome: own.outcome,
				benchmark: b,
				verdict: own.outcome && b ? compareOutcome(own.outcome, b, this.prefs.tolerance) : null,
				missing: own.missing,
				coverage: own.coverage,
				included: types.has(s.type)
			};
		});
		return summarize(rows, this.prefs, !!bench);
	}

	reportFor(model: CrisisModel, weights: readonly WeightedAsset[], rebalance: RebalanceFrequency): CrisisReport {
		return model === 'scenarios' ? this.scenarioReport(weights, rebalance) : this.report(weights, rebalance);
	}

	/** Scenario path (start = 100), for charts. */
	scenarioPath(weights: readonly WeightedAsset[], rebalance: RebalanceFrequency, scenario: Crisis, until: ISODate): PricePoint[] {
		const known = weights.filter((w) => app.assetById.has(w.assetId));
		const kinds = known.map((w) => this.scenarioAsset(app.assetById.get(w.assetId)!));
		if (!kinds.length || kinds.some((k) => !k)) return [];
		const m = buildScenarioMatrix(scenario, kinds as Array<{ kind: ScenarioKind; leverage: number }>, this.assumptions);
		let last = m.dates.length - 1;
		while (last > m.endIndex && m.dates[last]! > until) last--;
		const values = crisisPath(
			m,
			rebalanceFlags(m.dates, rebalance),
			known.map((w) => w.weight),
			0,
			last
		);
		return Array.from(values, (v, i) => ({ date: m.dates[i]!, close: v * 100 }));
	}

	/** Downloads all proxy index histories from Onvista (CR-3). */
	async downloadIndices() {
		if (this.downloading) return;
		this.downloading = true;
		const task = 'crisis-data';
		notify.startTask(task, 'Downloading crisis history', PROXY_INDICES.length);
		const errors: string[] = [];
		const next = new Map(this.indices);
		try {
			for (const [i, def] of PROXY_INDICES.entries()) {
				notify.updateTask(task, { current: i + 1, detail: def.label });
				try {
					const prices = await longHistory(def.entityType, def.entityValue, def.idNotation, '1900-01-01', { timeoutMs: 60_000 });
					if (!prices.length) throw new Error('no data');
					const data: ProxyIndexData = { key: def.key, currency: def.currency, prices, fetchedAt: new Date().toISOString() };
					await repo.put('crisisData', data);
					next.set(def.key, data);
				} catch (err) {
					errors.push(`${def.label}: ${err instanceof Error ? err.message : String(err)}`);
				}
			}
		} finally {
			this.indices = next;
			this.seriesCache.clear();
			this.downloading = false;
			notify.finishTask(task, errors.length ? 'Crisis history partly downloaded' : 'Crisis history downloaded', errors);
		}
	}

	async clearIndices() {
		await repo.remove(
			'crisisData',
			PROXY_INDICES.map((d) => d.key)
		);
		this.indices = new Map();
		this.seriesCache.clear();
	}

	/** Real prices in the main currency, extended backwards with the exposure's proxy. */
	assetSeries(asset: Asset): ProxySeries {
		const currency = app.settings.mainCurrency;
		const hit = this.seriesCache.get(asset.id);
		if (
			hit &&
			hit.asset === asset &&
			hit.currency === currency &&
			hit.indices === this.indices &&
			hit.rates === this.rates &&
			hit.currencies === app.currencies
		)
			return hit.value;
		const real = app.converted(asset, currency).prices;
		const proxy = buildProxy(exposureOf(asset), {
			rates: this.rates,
			indices: this.indices,
			currency,
			convert: (prices: PricePoint[], from: string, to: string) => {
				const c = convertPrices(prices, from, to, app.currencies);
				return c.status === 'missing' ? null : c.prices;
			}
		});
		const value = extendWithProxy(real, proxy);
		this.seriesCache.set(asset.id, { asset, currency, indices: this.indices, rates: this.rates, currencies: app.currencies, value });
		return value;
	}

	coverage(asset: Asset, crisis: Crisis): AssetCoverage | null {
		const s = this.assetSeries(asset);
		if (!s.prices.length || s.prices[0]!.date > addDays(crisis.start, START_TOLERANCE_DAYS) || s.prices.at(-1)!.date < crisis.end)
			return null;
		const used = s.segments.filter((g) => g.from <= crisis.end && g.to > crisis.start);
		return {
			assetId: asset.id,
			name: asset.name,
			kind: used.length ? 'proxy' : 'real',
			proxies: used.map((g) => g.label),
			approximate: used.some((g) => g.approximate),
			coarse: used.some((g) => g.coarse)
		};
	}

	/** Weights of a portfolio: target allocations. */
	portfolioWeights(p: Portfolio): WeightedAsset[] {
		return p.allocations.filter((a) => a.weight > 0).map((a: Allocation) => ({ assetId: a.assetId, weight: a.weight }));
	}

	benchmarkWeights(): { weights: WeightedAsset[]; rebalance: RebalanceFrequency; name: string } | null {
		const b = app.benchmarkResolved;
		if (!b) return null;
		if (b.kind === 'asset') return { weights: [{ assetId: b.ref.id, weight: 1 }], rebalance: 'none', name: b.name };
		const p = app.portfolioById.get(b.ref.id)!;
		return { weights: this.portfolioWeights(p), rebalance: p.rebalance ?? 'none', name: b.name };
	}

	/** Outcome of weighted assets over one crisis, or the assets lacking data. */
	outcome(
		weights: readonly WeightedAsset[],
		rebalance: RebalanceFrequency,
		crisis: Crisis
	): { outcome: CrisisOutcome | null; missing: string[]; coverage: AssetCoverage[] } {
		const assets = weights.map((w) => app.assetById.get(w.assetId)).filter((a): a is Asset => !!a);
		const coverage: AssetCoverage[] = [];
		const missing: string[] = [];
		for (const a of assets) {
			const c = this.coverage(a, crisis);
			if (c) coverage.push(c);
			else missing.push(a.name);
		}
		if (missing.length || !assets.length) return { outcome: null, missing, coverage };
		const m = buildCrisisMatrix(
			assets.map((a) => this.assetSeries(a).prices),
			crisis
		);
		if (!m) return { outcome: null, missing: assets.map((a) => a.name), coverage };
		const w = weights.filter((x) => app.assetById.has(x.assetId)).map((x) => x.weight);
		return { outcome: evaluateCrisis(m, rebalanceFlags(m.dates, rebalance), w), missing, coverage };
	}

	/** Value path (start = 1) through a crisis until shortly after the recovery, for charts. */
	path(weights: readonly WeightedAsset[], rebalance: RebalanceFrequency, crisis: Crisis, until: ISODate): PricePoint[] {
		const known = weights.filter((x) => app.assetById.has(x.assetId));
		const m = buildCrisisMatrix(
			known.map((x) => this.assetSeries(app.assetById.get(x.assetId)!).prices),
			crisis
		);
		if (!m) return [];
		let last = m.dates.length - 1;
		while (last > m.endIndex && m.dates[last]! > until) last--;
		const values = crisisPath(
			m,
			rebalanceFlags(m.dates, rebalance),
			known.map((x) => x.weight),
			0,
			last
		);
		return Array.from(values, (v, t) => ({ date: m.dates[t]!, close: v * 100 }));
	}

	/** Crisis report of a weighted portfolio against the benchmark (CR-4, CR-5). */
	report(weights: readonly WeightedAsset[], rebalance: RebalanceFrequency): CrisisReport {
		const bench = this.benchmarkWeights();
		const types = new Set(this.prefs.types);
		const rows: CrisisRow[] = CRISES.map((crisis) => {
			const own = this.outcome(weights, rebalance, crisis);
			const b = bench ? this.outcome(bench.weights, bench.rebalance, crisis).outcome : null;
			return {
				crisis,
				outcome: own.outcome,
				benchmark: b,
				verdict: own.outcome && b ? compareOutcome(own.outcome, b, this.prefs.tolerance) : null,
				missing: own.missing,
				coverage: own.coverage,
				included: types.has(crisis.type)
			};
		});
		return summarize(rows, this.prefs, !!bench);
	}
}

export function summarize(rows: CrisisRow[], prefs: CrisisPrefs, hasBenchmark: boolean): CrisisReport {
	const tested = rows.filter((r) => r.outcome && r.included);
	const compared = tested.filter((r) => r.benchmark);
	const worse = compared.filter((r) => r.verdict === 'worse').length;
	// With a benchmark both scores cover the same crises.
	const scored = hasBenchmark ? compared : tested;
	return {
		rows,
		tested,
		score: crisisScore(
			scored.map((r) => r.outcome!),
			prefs.score
		),
		benchmarkScore: crisisScore(
			compared.map((r) => r.benchmark!),
			prefs.score
		),
		worse,
		holdsUp: hasBenchmark && compared.length ? worse <= prefs.allowedMisses : null
	};
}

export const crisis = new CrisisState();
