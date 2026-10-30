<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { PERIOD_KEYS, type MetricsResult, type PeriodKey, type PeriodMetrics } from '#lib/domain/types.ts';
	import { availablePeriods, drawdownSeries } from '#lib/core/metrics.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { asyncDerived } from '#lib/state/async.svelte.ts';
	import * as calc from '#lib/workers/client.ts';
	import * as fmt from '#lib/format.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Button from '#lib/ui/Button.svelte';
	import LineChart from '#lib/charts/LineChart.svelte';
	import { colorAt } from '#lib/charts/palette.ts';

	const slugs = $derived((page.url.searchParams.get('slugs') ?? '').split(',').filter(Boolean));
	const assets = $derived(slugs.map((s) => app.assetBySlug(s)).filter((a): a is NonNullable<typeof a> => !!a));
	const series = $derived(assets.map((a) => ({ asset: a, prices: app.converted(a).prices })));
	const metrics = asyncDerived(() => (series.length ? Promise.all(series.map((s) => calc.metrics(s.prices, app.riskFreeRate))) : null));

	const LABELS: Record<PeriodKey, string> = { '1y': '1Y', '3y': '3Y', '5y': '5Y', '10y': '10Y', '15y': '15Y', all: 'All' };
	// A period is only comparable when every asset covers it (CP-2).
	const common = $derived.by(() => {
		const sets = series.map((s) => availablePeriods(s.prices));
		return PERIOD_KEYS.filter((p) => sets.every((set) => set.has(p)));
	});
	let period = $state<PeriodKey>('1y');
	$effect(() => {
		if (common.length && !common.includes(period)) period = common.includes('5y') ? '5y' : common[0]!;
	});

	const ROWS: Array<{ key: keyof PeriodMetrics; label: string; better: 'high' | 'low' | 'none'; kind: 'pct' | 'num' }> = [
		{ key: 'cumulativeReturn', label: 'Total return', better: 'high', kind: 'pct' },
		{ key: 'annualizedReturn', label: 'Return p.a.', better: 'high', kind: 'pct' },
		{ key: 'volatility', label: 'Volatility', better: 'low', kind: 'pct' },
		{ key: 'sharpeRatio', label: 'Sharpe ratio', better: 'high', kind: 'num' },
		{ key: 'maxDrawdown', label: 'Max drawdown', better: 'high', kind: 'pct' }
	];

	function best(row: (typeof ROWS)[number], all: MetricsResult[] | null): number | null {
		if (!all || series.length < 2) return null;
		const vals = all.map((m) => m[period]?.[row.key] as number | undefined);
		let idx: number | null = null;
		vals.forEach((v, i) => {
			if (v === undefined) return;
			if (idx === null || (row.better === 'high' ? v > vals[idx]! : v < vals[idx]!)) idx = i;
		});
		return idx;
	}

	function setSlugs(next: string[]) {
		goto(`/compare?slugs=${next.join(',')}`, { replace: true, reset: false });
	}
	let adding = $state('');
	const addable = $derived(app.assets.filter((a) => !assets.includes(a)).sort((a, b) => a.name.localeCompare(b.name)));
</script>

<PageHeader
	title="Compare assets"
	back={{ href: '/assets', label: 'Assets' }}
	subtitle="Side-by-side metrics and charts in {app.settings.mainCurrency}."
/>

<div class="stack" style="--gap: 20px">
	<Card>
		<div class="chips">
			{#each assets as a, i (a.id)}
				<span class="chip" style="--c: {colorAt(i)}">
					<i></i><a href="/assets/{app.assetSlug(a.id)}" class="truncate">{a.name}</a>
					<button aria-label="Remove {a.name}" onclick={() => setSlugs(slugs.filter((s) => s !== app.assetSlug(a.id)))}
						><Icon name="x" size={14} /></button
					>
				</span>
			{/each}
			<div class="row add">
				<select class="select" bind:value={adding} aria-label="Add asset to comparison">
					<option value="">Add asset…</option>
					{#each addable as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
				</select>
				<Button
					size="sm"
					icon="plus"
					disabled={!adding}
					onclick={() => {
						setSlugs([...slugs, app.assetSlug(adding)]);
						adding = '';
					}}>Add</Button
				>
			</div>
		</div>
	</Card>

	{#if assets.length === 0}
		<Card
			><EmptyState icon="compare" title="Nothing to compare yet"
				>Select two or more assets on the <a href="/assets">assets page</a>, or add them above.</EmptyState
			></Card
		>
	{:else}
		<Card title="Financial metrics">
			{#snippet actions()}
				<Segmented
					bind:value={period}
					options={PERIOD_KEYS.map((p) => ({ value: p, label: LABELS[p] }))}
					label="Period"
					size="sm"
					disabled={PERIOD_KEYS.filter((p) => !common.includes(p))}
				/>
			{/snippet}
			<div class="scroll-x">
				<table class="table">
					<thead>
						<tr>
							<th>Metric</th>
							{#each assets as a, i (a.id)}<th class="right"><span class="dot" style="background: {colorAt(i)}"></span>{a.name}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each ROWS as row (row.key)}
							{@const b = best(row, metrics.value)}
							<tr>
								<th scope="row" class="metric">{row.label}</th>
								{#each assets as a, i (a.id)}
									{@const v = metrics.value?.[i]?.[period]?.[row.key] as number | undefined}
									<td class="right num {row.key === 'volatility' ? '' : fmt.signClass(v)}" class:best={b === i}
										>{row.kind === 'pct' ? fmt.pct(v) : fmt.num(v)}</td
									>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if !common.length}<p class="small muted">The selected assets have no overlapping period with enough history.</p>{/if}
		</Card>

		<Card title="Performance" subtitle="Rebased to the start of the selected range">
			<LineChart
				series={series.map((s) => ({ label: s.asset.name, data: s.prices }))}
				mode="relative"
				allowRelative
				format="currency"
				currency={app.settings.mainCurrency}
				label="Performance comparison"
			/>
		</Card>

		<Card title="Drawdowns">
			<LineChart
				series={series.map((s) => ({ label: s.asset.name, data: drawdownSeries(s.prices) }))}
				format="percent"
				height={220}
				label="Drawdown comparison"
			/>
		</Card>

		<Card title="Details">
			<div class="scroll-x">
				<table class="table">
					<thead
						><tr
							><th>Detail</th>{#each assets as a (a.id)}<th>{a.name}</th>{/each}</tr
						></thead
					>
					<tbody>
						<tr
							><th scope="row" class="metric">Type</th>{#each assets as a (a.id)}<td>{a.classification.toUpperCase()}</td>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">Currency</th>{#each assets as a (a.id)}<td>{a.currency}</td>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">ISIN</th>{#each assets as a (a.id)}<td class="mono">{a.isin ?? '–'}</td>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">WKN</th>{#each assets as a (a.id)}<td class="mono">{a.wkn ?? '–'}</td>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">History</th>{#each assets as a (a.id)}<td class="num"
									>{fmt.date(a.prices[0]?.date)} – {fmt.date(a.prices.at(-1)?.date)}</td
								>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">Data points</th>{#each assets as a (a.id)}<td class="num">{a.prices.length}</td>{/each}</tr
						>
					</tbody>
				</table>
			</div>
		</Card>
	{/if}
</div>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 4px 6px 4px 10px;
		border-radius: 999px;
		background: var(--surface-2);
		font-size: var(--text-sm);
	}
	.chip i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--c);
		flex-shrink: 0;
	}
	.chip a {
		color: inherit;
		font-weight: 550;
	}
	.chip button {
		border: none;
		background: none;
		color: var(--muted);
		display: grid;
		padding: 2px;
	}
	.add {
		flex-wrap: nowrap;
	}
	.add .select {
		min-width: 160px;
	}
	.metric {
		text-transform: none !important;
		letter-spacing: 0 !important;
		color: var(--text) !important;
		font-size: var(--text-sm) !important;
	}
	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 6px;
	}
	td.best {
		font-weight: 700;
		background: var(--accent-soft);
	}
</style>
