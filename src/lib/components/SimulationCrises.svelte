<script lang="ts">
	/**
	 * Crisis test of simulated portfolios (CR-7): pick a range, test it in a
	 * worker, then filter and rank by return, volatility and crisis behaviour.
	 */
	import type { MonteCarloResult } from '#lib/domain/types.ts';
	import { dominatingIndices } from '#lib/core/montecarlo.ts';
	import { crisis } from '#lib/state/crisis.svelte.ts';
	import {
		estimateSeconds,
		OBJECTIVES,
		simCrisis,
		type Objective,
		type SimCrisisResult,
		type SimCrisisView
	} from '#lib/state/sim-crisis.svelte.ts';
	import { SCORE_LABELS } from '#lib/core/crisis.ts';
	import * as fmt from '#lib/format.ts';
	import Button from '#lib/ui/Button.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import CrisisSettings from './CrisisSettings.svelte';
	import CrisisDataNotice from './CrisisDataNotice.svelte';
	import { duration } from './CrisisTable.svelte';

	let {
		result,
		benchmark,
		test,
		view,
		hidden,
		efficient,
		inZoom,
		onpick
	}: {
		result: MonteCarloResult;
		benchmark: { label: string; volatility: number; annualizedReturn: number } | null;
		/** The crisis test that belongs to `result`, if any. */
		test: SimCrisisResult | null;
		view: SimCrisisView | null;
		hidden: Uint8Array | null;
		efficient: number[] | null;
		/** Visible portfolios in the current chart zoom. */
		inZoom: () => number[];
		onpick: (index: number) => void;
	} = $props();

	$effect(() => {
		void crisis.load();
	});

	let topN = $state(1000);
	const seconds = $derived(simCrisis.selection ? estimateSeconds(simCrisis.selection.length, result.assetIds.length) : 0);
	const scoreText = (v: number) => (crisis.prefs.score === 'longestRecovery' ? duration(-v * 365.25) : fmt.pct(v, 1));

	function pickFrontier() {
		simCrisis.setSelection([...result.frontier], 'Efficient frontier');
	}
	function pickDominating() {
		if (!benchmark) return;
		simCrisis.setSelection(dominatingIndices(result, benchmark), 'Beats the benchmark');
	}
	function pickTop() {
		const n = Math.max(1, Math.min(result.count, Math.round(topN) || 1));
		const order = Array.from({ length: result.count }, (_, i) => i).sort((a, b) => result.sharpes[b]! - result.sharpes[a]!);
		simCrisis.setSelection(order.slice(0, n), `Top ${fmt.num(n, 0)} by Sharpe`);
	}
	function pickZoom() {
		simCrisis.setSelection(inZoom(), 'Current zoom');
	}
	function pickAll() {
		simCrisis.setSelection(
			Array.from({ length: result.count }, (_, i) => i),
			'All portfolios'
		);
	}

	const ranked = $derived.by(() => {
		if (!test || !view) return [];
		const holdsKnown = !!test.benchmarkName;
		const cand: number[] = [];
		for (const i of test.indices) {
			if (hidden?.[i] || Number.isNaN(view.scores[i]!)) continue;
			const ok = !holdsKnown || view.holds[i] === 1;
			if (simCrisis.objective === 'benchmarkGoal' && (!ok || (benchmark && result.volatilities[i]! > benchmark.volatility))) continue;
			if (simCrisis.objective === 'minVol' && (!ok || (benchmark && result.returns[i]! < benchmark.annualizedReturn))) continue;
			cand.push(i);
		}
		const o: Objective = simCrisis.objective;
		cand.sort((a, b) =>
			o === 'benchmarkGoal'
				? result.returns[b]! - result.returns[a]!
				: o === 'minVol'
					? result.volatilities[a]! - result.volatilities[b]!
					: view.scores[b]! - view.scores[a]! || result.returns[b]! - result.returns[a]!
		);
		return cand.slice(0, 8);
	});
	const testedText = $derived(
		test && view
			? `Tested ${fmt.num(test.indices.length, 0)} portfolios in ${view.included.length} ${test.model === 'scenarios' ? 'crisis types' : 'crises'} (${test.crises
					.filter((_, j) => view.included.includes(j))
					.map((c) => c.name)
					.join(', ')})`
			: ''
	);
	const holdingUp = $derived(view && test?.benchmarkName ? test.indices.reduce((n, i) => n + (view.holds[i] === 1 ? 1 : 0), 0) : null);
</script>

{#if simCrisis.model === 'historical'}<CrisisDataNotice />{/if}
<div class="stack" style="--gap: 12px">
	<div>
		<span class="label">1. Select portfolios to test</span>
		<div class="row picks">
			<Button size="sm" onclick={pickFrontier}>Efficient frontier</Button>
			{#if benchmark}<Button size="sm" onclick={pickDominating}>Beats benchmark</Button>{/if}
			<span class="row top">
				<Button size="sm" onclick={pickTop}>Top</Button>
				<input
					class="input num"
					type="number"
					min="1"
					step="100"
					bind:value={topN}
					aria-label="Number of portfolios with the best Sharpe ratio"
				/>
				<span class="xs muted">by Sharpe</span>
			</span>
			<Button size="sm" onclick={pickZoom}>In current zoom</Button>
			<Button size="sm" onclick={pickAll}>All</Button>
			<label class="row xs"><input type="checkbox" bind:checked={simCrisis.selectMode} />Draw a range on the chart</label>
		</div>
		{#if simCrisis.selection}
			<p class="small">
				<strong>{simCrisis.selectionLabel}</strong>: {fmt.num(simCrisis.selection.length, 0)} portfolio{simCrisis.selection.length === 1
					? ''
					: 's'}
				<span class="muted">· about {seconds < 1 ? 'a second' : `${fmt.num(Math.ceil(seconds), 0)} s`}</span>
			</p>
			{#if seconds > 60}<p class="notice xs">
					This takes a while. Narrow the selection (e.g. a range around the benchmark) for a quicker answer.
				</p>{/if}
		{/if}
	</div>
	<div class="row run">
		<label class="xs muted" for="crisis-model">Model</label>
		<select id="crisis-model" class="select" bind:value={simCrisis.model} disabled={!!simCrisis.progress}>
			<option value="scenarios">Crisis types (assumed)</option>
			<option value="historical">Historical crises</option>
		</select>
		<label class="xs muted" for="crisis-rb">Rebalancing</label>
		<select id="crisis-rb" class="select" bind:value={simCrisis.rebalance} disabled={!!simCrisis.progress}>
			<option value="monthly">Monthly</option>
			<option value="quarterly">Quarterly</option>
			<option value="annually">Annually</option>
			<option value="none">Buy &amp; hold</option>
		</select>
		{#if simCrisis.progress}
			<div class="grow stack" style="--gap: 4px">
				<Progress value={simCrisis.progress.done} max={simCrisis.progress.total} label="Crisis test progress" />
				<div class="spread xs">
					<span class="muted num">{fmt.num(simCrisis.progress.done, 0)} / {fmt.num(simCrisis.progress.total, 0)} portfolios</span>
					<Button size="sm" variant="ghost" onclick={() => simCrisis.cancel()}>Cancel</Button>
				</div>
			</div>
		{:else}
			<Button
				variant="primary"
				icon="target"
				disabled={!simCrisis.selection?.length || (simCrisis.model === 'historical' && !crisis.loaded)}
				onclick={() => simCrisis.start(result)}>2. Run crisis test</Button
			>
		{/if}
	</div>

	{#if test && view}
		{#if test.rebalance !== simCrisis.rebalance || test.model !== simCrisis.model || (test.assumptions && test.assumptions !== crisis.assumptions)}
			<p class="notice xs">
				The test used {test.model === 'scenarios' ? 'crisis types' : 'historical crises'} with {test.rebalance === 'none'
					? 'buy & hold'
					: `${test.rebalance} rebalancing`}{test.assumptions && test.assumptions !== crisis.assumptions ? ' and older assumptions' : ''}.
				Run it again to apply the current settings.
			</p>
		{/if}
		<div class="results">
			<p class="small">
				{testedText}{#if holdingUp !== null}: <strong>{fmt.num(holdingUp, 0)}</strong> hold up like {test.benchmarkName}{/if}.
			</p>
			{#if test.excluded.length}
				<p class="xs muted">
					Not tested ({test.model === 'scenarios' ? 'unknown what an asset invests in' : 'no data for every asset'}): {test.excluded
						.map((x) => `${x.crisis.name} (${x.missing.slice(0, 2).join(', ')}${x.missing.length > 2 ? ', …' : ''})`)
						.join('; ')}.
				</p>
			{/if}
			{#if test.benchmarkName && test.benchmark.some((b, j) => b && view.included.includes(j))}
				<p class="xs muted">
					{test.benchmarkName}: {test.crises
						.map((c, j) => (test.benchmark[j] && view.included.includes(j) ? `${c.name} ${fmt.pct(test.benchmark[j]!.drawdown, 0)}` : null))
						.filter(Boolean)
						.join(' · ')}
				</p>
			{/if}
		</div>
		<div class="row filters">
			<label class="row xs"><input type="checkbox" bind:checked={simCrisis.colorByScore} />Colour by crisis score</label>
			{#if test.benchmarkName}<label class="row xs"
					><input type="checkbox" bind:checked={simCrisis.onlyHoldingUp} />Only those that hold up like the benchmark</label
				>{/if}
			{#if view.compared.length}
				<label class="row xs"
					>Better than the benchmark in <select
						class="select better"
						bind:value={simCrisis.minBetter}
						aria-label="Better than the benchmark in at least"
					>
						<option value={0}>any number of</option>
						{#each Array.from({ length: view.compared.length - 1 }, (_, k) => k + 1) as n (n)}<option value={n}>at least {n}</option>{/each}
						<option value="all">all {view.compared.length}</option>
					</select>
					{test.model === 'scenarios' ? 'crisis types' : 'crises'}</label
				>
			{/if}
			<label class="row xs"
				>Max crisis drawdown <input
					class="input num dd"
					inputmode="decimal"
					placeholder="–"
					bind:value={simCrisis.maxDrawdown}
					aria-label="Maximum crisis drawdown in percent"
				/> %</label
			>
			<label class="row xs"
				><input type="checkbox" bind:checked={simCrisis.showEfficient} />Crisis-aware efficient set{efficient
					? ` (${efficient.length})`
					: ''}</label
			>
		</div>
		<div>
			<label class="label" for="crisis-objective">Best candidates</label>
			<select id="crisis-objective" class="select" bind:value={simCrisis.objective}>
				{#each Object.entries(OBJECTIVES) as [value, label] (value)}<option {value}>{label}</option>{/each}
			</select>
			{#if ranked.length}
				<ol class="ranked">
					{#each ranked as i (i)}
						<li>
							<button onclick={() => onpick(i)}>
								<span class="num">{fmt.pct(result.returns[i]!, 1)}</span>
								<span class="num muted">vol {fmt.pct(result.volatilities[i]!, 1)}</span>
								<span class="num">{SCORE_LABELS[crisis.prefs.score].toLowerCase()} {scoreText(view.scores[i]!)}</span>
								{#if test.benchmarkName}<span class="xs {view.worse[i] ? 'neg' : 'pos'}"
										>{view.worse[i] ? `worse in ${view.worse[i]}` : 'holds up'}</span
									><span class="xs muted">better in {view.better[i]} of {view.compared.length}</span>{/if}
							</button>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="xs muted">No tested portfolio meets this goal{benchmark ? '' : ' (set a benchmark to compare against)'}.</p>
			{/if}
		</div>
	{/if}
	<CrisisSettings />
	<p class="xs muted">
		Crisis types apply the assumed behaviour of each kind of asset (<a href="/settings#crisis-assumptions">editable in Settings</a>);
		historical crises replay real prices and, before an asset's own history, proxies. Select a tested portfolio on the chart to see each
		crisis in the inspector.
	</p>
</div>

<style>
	.picks {
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
	}
	.top {
		gap: 4px;
		flex-wrap: nowrap;
	}
	.top .input {
		width: 90px;
	}
	.run {
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.run .select {
		width: auto;
	}
	.grow {
		flex: 1;
		min-width: 200px;
	}
	.filters {
		flex-wrap: wrap;
		gap: 6px 16px;
	}
	.better {
		width: auto;
		padding: 2px 6px;
	}
	.dd {
		width: 60px;
		padding: 2px 6px;
	}
	.ranked {
		margin: 6px 0 0;
		padding-left: 22px;
		display: grid;
		gap: 2px;
	}
	.ranked button {
		border: none;
		background: none;
		padding: 2px 4px;
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		font-size: var(--text-sm);
		text-align: left;
		border-radius: var(--radius-sm);
	}
	.ranked button:hover {
		background: var(--accent-soft);
	}
	.notice {
		padding: 6px 10px;
		border-radius: var(--radius-sm);
		background: var(--warning-soft);
		color: var(--warning);
	}
</style>
