<script lang="ts">
	/**
	 * Crisis test of one portfolio against the benchmark: crisis-type scenarios
	 * (CR-8) by default, the replay of historical crises (CR-4 … CR-6) as a second tab.
	 */
	import type { RebalanceFrequency } from '#lib/domain/types.ts';
	import { addDays } from '#lib/core/dates.ts';
	import { CRISIS_BY_ID, SCORE_LABELS } from '#lib/core/crisis.ts';
	import { crisis, type WeightedAsset } from '#lib/state/crisis.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import LineChart from '#lib/charts/LineChart.svelte';
	import CrisisTable, { duration } from './CrisisTable.svelte';
	import CrisisSettings from './CrisisSettings.svelte';
	import CrisisDataNotice from './CrisisDataNotice.svelte';
	import CrisisModelSwitch from './CrisisModelSwitch.svelte';

	let { weights, rebalance, name }: { weights: WeightedAsset[]; rebalance: RebalanceFrequency; name: string } = $props();

	$effect(() => {
		void crisis.load();
	});

	const bench = $derived(crisis.benchmarkWeights());
	const scenarios = $derived(crisis.model === 'scenarios');
	const report = $derived(weights.length && (scenarios || crisis.loaded) ? crisis.reportFor(crisis.model, weights, rebalance) : null);
	let selected = $state<string | null>(null);
	const selectedRow = $derived(report?.rows.find((r) => r.crisis.id === selected && r.outcome) ?? null);

	const chart = $derived.by(() => {
		if (!selectedRow) return null;
		const c = CRISIS_BY_ID.get(selectedRow.crisis.id) ?? selectedRow.crisis;
		const ends = [selectedRow.outcome?.recoveryDate, selectedRow.benchmark?.recoveryDate].map((d) => d ?? addDays(c.end, 3 * 365));
		const until = addDays(
			ends.reduce((a, b) => (a > b ? a : b), c.end),
			120
		);
		const path = (w: WeightedAsset[], rb: RebalanceFrequency) =>
			c.scenario ? crisis.scenarioPath(w, rb, c, until) : crisis.path(w, rb, c, until);
		const own = path(weights, rebalance);
		const b = bench && selectedRow.benchmark ? path(bench.weights, bench.rebalance) : [];
		return { crisis: c, own, bench: b };
	});

	const scoreText = (v: number) => (crisis.prefs.score === 'longestRecovery' ? duration(-v * 365.25) : fmt.pct(v, 1));
</script>

<CrisisModelSwitch />
{#if !scenarios}<CrisisDataNotice />{/if}
{#if !report}
	<p class="small muted">Loading crisis data…</p>
{:else if report.tested.length === 0}
	<p class="small muted">
		{#if scenarios}
			None of the selected crisis types can be tested{report.rows.some((r) => r.missing.length)
				? `: it is unknown what ${[...new Set(report.rows.flatMap((r) => r.missing))].join(', ')} invest(s) in — set the exposure on the asset page`
				: ''}.
		{:else}
			None of the selected crisis types can be tested with the available data{report.rows.some((r) => r.outcome)
				? ''
				: ' — the assets have no prices during any crisis and no proxy fits them'}.
		{/if}
	</p>
{:else}
	<div class="summary">
		{#if report.holdsUp !== null}
			<span class="verdict {report.holdsUp ? 'ok' : 'bad'}">
				{report.holdsUp ? 'Holds up like the benchmark' : 'Worse than the benchmark'}
			</span>
			<span class="small muted">worse in {report.worse} of {report.tested.filter((r) => r.benchmark).length} crises</span>
		{/if}
		{#if Number.isFinite(report.score)}
			<span class="small"
				>{SCORE_LABELS[crisis.prefs.score]}:
				<strong class="num">{scoreText(report.score)}</strong>{#if bench && Number.isFinite(report.benchmarkScore)}
					<span class="muted"> · benchmark {scoreText(report.benchmarkScore)}</span>{/if}</span
			>
		{/if}
	</div>
	<CrisisTable {report} benchmarkLabel={bench?.name ?? null} bind:selected />
	{#if chart && chart.own.length > 1}
		<div class="chart">
			<p class="small">
				<strong>{chart.crisis.name}</strong> <span class="muted">— {chart.crisis.description}</span>
				{#if chart.crisis.scenario}<span class="muted">Shown as if it started today.</span>{/if}
			</p>
			<LineChart
				series={[
					{ label: name, data: chart.own },
					...(chart.bench.length > 1
						? [{ label: `${bench?.name} (benchmark)`, data: chart.bench, dashed: true, color: 'var(--chart-2)' }]
						: [])
				]}
				height={240}
				showRange={false}
				label="Crisis path"
			/>
		</div>
	{:else}
		<p class="xs muted hint">Select a crisis to see the path through it.</p>
	{/if}
{/if}
<div class="settings"><CrisisSettings /></div>

<style>
	.summary {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		align-items: center;
		margin-bottom: var(--space-3);
	}
	.verdict {
		font-weight: 650;
		font-size: var(--text-sm);
		padding: 3px 10px;
		border-radius: 999px;
	}
	.verdict.ok {
		background: var(--accent-soft);
		color: var(--positive);
	}
	.verdict.bad {
		background: var(--negative-soft);
		color: var(--negative);
	}
	.chart {
		margin-top: var(--space-4);
		display: grid;
		gap: var(--space-2);
	}
	.hint {
		margin-top: var(--space-2);
	}
	.settings {
		margin-top: var(--space-4);
	}
</style>
