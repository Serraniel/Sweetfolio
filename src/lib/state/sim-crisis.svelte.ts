/**
 * Crisis test of simulated portfolios (CR-7): a selection of the Monte Carlo
 * result is tested in a worker; scores, verdicts and the crisis-aware
 * efficient set are derived from the outcomes and the current preferences.
 * The plain simulation result is never changed.
 */
import type { Asset, MonteCarloResult, RebalanceFrequency } from '#lib/domain/types.ts';
import {
	buildCrisisMatrix,
	compareOutcome,
	CRISES,
	crisisScore,
	OUTCOME_STRIDE,
	rebalanceFlags,
	type Crisis,
	type CrisisOutcome
} from '#lib/core/crisis.ts';
import { addDays } from '#lib/core/dates.ts';
import { runCrisisTest, type CrisisTestRun } from '#lib/workers/client.ts';
import { app } from './app.svelte.ts';
import { crisis, type CrisisModel, type CrisisPrefs } from './crisis.svelte.ts';
import { buildScenarioMatrix, type ScenarioAssumptions } from '#lib/core/scenarios.ts';
import { notify } from './toasts.svelte.ts';

export interface SimCrisisResult {
	/** The simulation result the test belongs to. */
	source: MonteCarloResult;
	model: CrisisModel;
	/** Assumptions the scenarios were built from (to tell when they changed). */
	assumptions: ScenarioAssumptions | null;
	rebalance: RebalanceFrequency;
	crises: Crisis[];
	excluded: Array<{ crisis: Crisis; missing: string[] }>;
	/** Tested portfolio indices into the simulation result. */
	indices: Uint32Array;
	/** `indices.length × crises.length × OUTCOME_STRIDE`. */
	outcomes: Float64Array;
	benchmark: Array<CrisisOutcome | null>;
	benchmarkName: string | null;
}

export interface SimCrisisView {
	/** Per simulated portfolio; NaN when not tested. */
	scores: Float64Array;
	/** Per simulated portfolio: −1 not tested (or no benchmark), 0 worse, 1 holds up. */
	holds: Int8Array;
	worse: Uint8Array;
	/** Per simulated portfolio: crises in which it does better than the benchmark. */
	better: Uint8Array;
	/** Crisis columns compared with the benchmark (included and with benchmark data). */
	compared: number[];
	/** Deepest drawdown over the included crises; NaN when not tested. */
	worstDrawdown: Float64Array;
	/** Crisis columns included by the type filter. */
	included: number[];
	/** Position of a portfolio in `indices`, or −1. */
	row: Int32Array;
}

/**
 * Rough duration of a crisis test in seconds: every portfolio walks each
 * crisis until it recovers, on average a few years of business days.
 */
export function estimateSeconds(count: number, assets: number, crises = CRISES.length): number {
	const daysPerCrisis = 4 * 261;
	return (count * assets * crises * daysPerCrisis) / 1.5e8;
}

export function outcomeAt(res: SimCrisisResult, row: number, j: number): CrisisOutcome {
	const at = (row * res.crises.length + j) * OUTCOME_STRIDE;
	const rec = res.outcomes[at + 1]!;
	const c = res.crises[j]!;
	return {
		drawdown: res.outcomes[at]!,
		recoveryDays: Number.isNaN(rec) ? null : rec,
		openDays: res.outcomes[at + 3]!,
		crisisReturn: res.outcomes[at + 2]!,
		peakDate: c.start,
		troughDate: c.end,
		recoveryDate: null,
		dataEnd: addDays(c.start, res.outcomes[at + 3]!)
	};
}

export function evaluateView(res: SimCrisisResult, prefs: CrisisPrefs): SimCrisisView {
	const count = res.source.count;
	const scores = new Float64Array(count).fill(NaN);
	const holds = new Int8Array(count).fill(-1);
	const worse = new Uint8Array(count);
	const better = new Uint8Array(count);
	const row = new Int32Array(count).fill(-1);
	const worstDrawdown = new Float64Array(count).fill(NaN);
	const types = new Set(prefs.types);
	const included = res.crises.map((c, j) => (types.has(c.type) ? j : -1)).filter((j) => j >= 0);
	const compared = included.filter((j) => res.benchmark[j]);
	const scored = res.benchmarkName ? compared : included;
	for (let r = 0; r < res.indices.length; r++) {
		const i = res.indices[r]!;
		row[i] = r;
		const outs = scored.map((j) => outcomeAt(res, r, j));
		scores[i] = crisisScore(outs, prefs.score);
		worstDrawdown[i] = included.reduce((m, j) => Math.min(m, res.outcomes[(r * res.crises.length + j) * OUTCOME_STRIDE]!), 0);
		if (res.benchmarkName && compared.length) {
			let w = 0;
			let b = 0;
			for (const j of compared) {
				const v = compareOutcome(outcomeAt(res, r, j), res.benchmark[j]!, prefs.tolerance);
				if (v === 'worse') w++;
				else if (v === 'better') b++;
			}
			worse[i] = w;
			better[i] = b;
			holds[i] = w <= prefs.allowedMisses ? 1 : 0;
		}
	}
	return { scores, holds, worse, better, compared: res.benchmarkName ? compared : [], worstDrawdown, included, row };
}

export type Objective = 'benchmarkGoal' | 'minVol' | 'bestScore';

export const OBJECTIVES: Record<Objective, string> = {
	benchmarkGoal: 'Max return, volatility ≤ benchmark, holds up in crises',
	minVol: 'Min volatility, return ≥ benchmark, holds up in crises',
	bestScore: 'Best crisis score'
};

class SimCrisisState {
	selection = $state.raw<number[] | null>(null);
	selectionLabel = $state('');
	result = $state.raw<SimCrisisResult | null>(null);
	progress = $state<{ done: number; total: number } | null>(null);
	run: CrisisTestRun | null = null;
	model = $state<CrisisModel>('scenarios');
	/** Rebalancing for the crisis test and saved portfolios. */
	rebalance = $state<RebalanceFrequency>('monthly');
	colorByScore = $state(true);
	onlyHoldingUp = $state(false);
	/** Only portfolios better than the benchmark in at least this many crises (0 = off). */
	minBetter = $state<number | 'all'>(0);
	maxDrawdown = $state('');
	showEfficient = $state(true);
	objective = $state<Objective>('benchmarkGoal');
	selectMode = $state(false);

	setSelection(indices: number[], label: string) {
		this.selection = indices;
		this.selectionLabel = label;
	}

	/** Tests the selection of `source` against every crisis all its assets cover. */
	async start(source: MonteCarloResult) {
		const indices = this.selection;
		if (!indices?.length || this.run) return;
		const model = this.model;
		if (model === 'historical') await crisis.load();
		const assets = source.assetIds.map((id) => app.assetById.get(id));
		if (assets.some((a) => !a)) {
			notify.error('An asset of this simulation was deleted. Run the simulation again first.');
			return;
		}
		const list = assets as Asset[];
		const rebalance = this.rebalance;
		const crises: Crisis[] = [];
		const excluded: SimCrisisResult['excluded'] = [];
		const matrices = [];
		const assumptions = crisis.assumptions;
		const kinds = list.map((a) => crisis.scenarioAsset(a));
		for (const c of model === 'scenarios' ? crisis.scenarios() : CRISES) {
			const missing =
				model === 'scenarios'
					? list.filter((_, i) => !kinds[i]).map((a) => a.name)
					: list.filter((a) => !crisis.coverage(a, c)).map((a) => a.name);
			const m = missing.length
				? null
				: model === 'scenarios'
					? buildScenarioMatrix(c, kinds as Array<NonNullable<(typeof kinds)[number]>>, assumptions)
					: buildCrisisMatrix(
							list.map((a) => crisis.assetSeries(a).prices),
							c
						);
			if (!m) {
				excluded.push({ crisis: c, missing: missing.length ? missing : list.map((a) => a.name) });
				continue;
			}
			crises.push(c);
			matrices.push({ ...m, flags: rebalanceFlags(m.dates, rebalance) });
		}
		if (!crises.length) {
			this.result = null;
			notify.error(
				model === 'scenarios'
					? `No crisis type can be tested: it is unknown what ${excluded[0]?.missing.join(', ')} invest(s) in. Set the exposure on the asset page.`
					: 'No crisis can be tested: some assets have neither prices nor a proxy for any crisis window.'
			);
			return;
		}
		const n = source.assetIds.length;
		const weights = new Float32Array(indices.length * n);
		indices.forEach((idx, k) => weights.set(source.weights.subarray(idx * n, idx * n + n), k * n));
		const bench = crisis.benchmarkWeights();
		const benchmark = crises.map((c) =>
			bench
				? (model === 'scenarios'
						? crisis.scenarioOutcome(bench.weights, bench.rebalance, c)
						: crisis.outcome(bench.weights, bench.rebalance, c)
					).outcome
				: null
		);

		this.progress = { done: 0, total: indices.length };
		this.run = runCrisisTest({ matrices, weights, count: indices.length }, (done, total) => (this.progress = { done, total }));
		try {
			const outcomes = await this.run.promise;
			this.result = {
				source,
				model,
				assumptions: model === 'scenarios' ? assumptions : null,
				rebalance,
				crises,
				excluded,
				indices: Uint32Array.from(indices),
				outcomes,
				benchmark,
				benchmarkName: bench?.name ?? null
			};
		} catch (err) {
			if (!(err instanceof DOMException && err.name === 'AbortError'))
				notify.error(`Crisis test failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			this.progress = null;
			this.run = null;
		}
	}

	cancel() {
		this.run?.cancel();
	}

	/** Forget everything that belongs to an older simulation run. */
	reset() {
		this.cancel();
		this.result = null;
		this.selection = null;
		this.selectionLabel = '';
	}
}

export const simCrisis = new SimCrisisState();
