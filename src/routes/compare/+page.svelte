<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { PERIOD_KEYS, type MetricsResult, type PeriodKey, type PeriodMetrics, type PricePoint } from '#lib/domain/types.ts';
	import { availablePeriods, drawdownSeries } from '#lib/core/metrics.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { performanceSeries, trackedView } from '#lib/state/portfolio-view.ts';
	import { crisis, type CrisisReport, type WeightedAsset } from '#lib/state/crisis.svelte.ts';
	import { CRISIS_TYPE_SHORT, SCORE_LABELS } from '#lib/core/crisis.ts';
	import type { RebalanceFrequency } from '#lib/domain/types.ts';
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
	import CrisisSettings from '#lib/components/CrisisSettings.svelte';
	import CrisisDataNotice from '#lib/components/CrisisDataNotice.svelte';
	import CrisisModelSwitch from '#lib/components/CrisisModelSwitch.svelte';
	import { duration } from '#lib/components/CrisisTable.svelte';

	// Assets in `slugs`, portfolios in `portfolios` (CP-1, CP-5).
	const slugs = $derived((page.url.searchParams.get('slugs') ?? '').split(',').filter(Boolean));
	const portfolioSlugs = $derived((page.url.searchParams.get('portfolios') ?? '').split(',').filter(Boolean));
	const assets = $derived(slugs.map((s) => app.assetBySlug(s)).filter((a): a is NonNullable<typeof a> => !!a));
	const portfolios = $derived(portfolioSlugs.map((s) => app.portfolioBySlug(s)).filter((p): p is NonNullable<typeof p> => !!p));

	interface Item {
		key: string;
		name: string;
		href: string;
		slug: string;
		kind: 'asset' | 'portfolio';
		prices: PricePoint[];
		type: string;
		currency: string;
		isin: string | null;
		wkn: string | null;
		weights: WeightedAsset[];
		rebalance: RebalanceFrequency;
	}
	const items = $derived<Item[]>([
		...assets.map((a) => ({
			key: `a:${a.id}`,
			name: a.name,
			href: `/assets/${app.assetSlug(a.id)}`,
			slug: app.assetSlug(a.id),
			kind: 'asset' as const,
			prices: app.converted(a).prices,
			type: a.classification.toUpperCase(),
			currency: a.currency,
			isin: a.isin,
			wkn: a.wkn,
			weights: [{ assetId: a.id, weight: 1 }],
			rebalance: 'none' as const
		})),
		...portfolios.map((p) => {
			const perf = performanceSeries(p);
			return {
				key: `p:${p.id}`,
				name: p.name,
				href: `/portfolios/${app.portfolioSlug(p.id)}`,
				slug: app.portfolioSlug(p.id),
				kind: 'portfolio' as const,
				prices: perf.prices,
				type: perf.kind === 'backtest' ? 'Portfolio (backtest)' : 'Portfolio (time-weighted, actual)',
				currency: app.settings.mainCurrency,
				isin: null,
				wkn: null,
				// Tracked-only portfolios are tested with their current holdings.
				weights: p.allocations.length
					? crisis.portfolioWeights(p)
					: trackedView(p).summary.holdings.map((h) => ({ assetId: h.assetId, weight: Math.max(0, h.currentValue) })),
				rebalance: p.allocations.length ? (p.rebalance ?? 'none') : ('none' as const)
			};
		})
	]);
	// One entry per item (same order as `items`), null without enough history.
	const metrics = asyncDerived(() =>
		items.length
			? Promise.all(items.map((i) => (i.prices.length > 1 ? calc.metrics(i.prices, app.riskFreeRate) : Promise.resolve(null))))
			: null
	);

	const LABELS: Record<PeriodKey, string> = { '1y': '1Y', '3y': '3Y', '5y': '5Y', '10y': '10Y', '15y': '15Y', all: 'All' };
	// A period is only comparable when every asset covers it (CP-2).
	const common = $derived.by(() => {
		const sets = items.map((i) => availablePeriods(i.prices));
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

	function best(row: (typeof ROWS)[number], all: Array<MetricsResult | null> | null): number | null {
		if (!all || items.length < 2) return null;
		const vals = all.map((m) => m?.[period]?.[row.key] as number | undefined);
		let idx: number | null = null;
		vals.forEach((v, i) => {
			if (v === undefined) return;
			if (idx === null || (row.better === 'high' ? v > vals[idx]! : v < vals[idx]!)) idx = i;
		});
		return idx;
	}

	// --- Crises (CR-6): one column per item plus the benchmark.
	$effect(() => {
		void crisis.load();
	});
	const bench = $derived(crisis.benchmarkWeights());
	const crisisReports = $derived<CrisisReport[] | null>(
		items.length && (crisis.model === 'scenarios' || crisis.loaded)
			? items.map((i) => crisis.reportFor(crisis.model, i.weights, i.rebalance))
			: null
	);
	const crisisRows = $derived(
		crisisReports
			? crisisReports[0]!.rows
					.map((row, r) => ({ row, cells: crisisReports.map((rep) => rep.rows[r]!.outcome), bench: row.benchmark }))
					.filter((x) => x.cells.some((c) => c) && x.row.included)
			: []
	);
	/** Tint from red (worst drawdown in the row) to green (best). */
	function heat(value: number | undefined, row: { cells: Array<{ drawdown: number } | null>; bench: { drawdown: number } | null }): string {
		if (value === undefined) return '';
		const all = [...row.cells.map((c) => c?.drawdown), row.bench?.drawdown].filter((v): v is number => v !== undefined);
		const lo = Math.min(...all);
		const hi = Math.max(...all);
		if (hi - lo < 0.005) return '';
		const x = (value - lo) / (hi - lo);
		return x >= 0.5
			? `background: color-mix(in srgb, var(--positive) ${Math.round((x - 0.5) * 36)}%, transparent)`
			: `background: color-mix(in srgb, var(--negative) ${Math.round((0.5 - x) * 36)}%, transparent)`;
	}

	function setItems(nextAssets: string[], nextPortfolios: string[]) {
		const q = new URLSearchParams();
		if (nextAssets.length) q.set('slugs', nextAssets.join(','));
		if (nextPortfolios.length) q.set('portfolios', nextPortfolios.join(','));
		goto(`/compare?${q.toString().replaceAll('%2C', ',')}`, { replace: true, reset: false });
	}
	function remove(item: Item) {
		if (item.kind === 'asset')
			setItems(
				slugs.filter((s) => s !== item.slug),
				portfolioSlugs
			);
		else
			setItems(
				slugs,
				portfolioSlugs.filter((s) => s !== item.slug)
			);
	}
	let adding = $state('');
	const addableAssets = $derived(app.assets.filter((a) => !assets.includes(a)).sort((a, b) => a.name.localeCompare(b.name)));
	const addablePortfolios = $derived(
		app.portfolios
			.filter((p) => !portfolios.includes(p) && (p.allocations.length || app.transactionsOf(p.id).length))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	function add() {
		const [kind, id] = [adding.slice(0, 1), adding.slice(2)];
		if (kind === 'a') setItems([...slugs, app.assetSlug(id)], portfolioSlugs);
		else setItems(slugs, [...portfolioSlugs, app.portfolioSlug(id)]);
		adding = '';
	}
</script>

<PageHeader
	title="Compare"
	back={assets.length || !portfolios.length ? { href: '/assets', label: 'Assets' } : { href: '/portfolios', label: 'Portfolios' }}
	subtitle="Assets and portfolios side by side, in {app.settings
		.mainCurrency}. Portfolios use their backtest, tracked ones their time-weighted return."
/>

<div class="stack" style="--gap: 20px">
	<Card>
		<div class="chips">
			{#each items as item, i (item.key)}
				<span class="chip" style="--c: {colorAt(i)}">
					<i></i>{#if item.kind === 'portfolio'}<Icon name="portfolio" size={14} />{/if}<a href={item.href} class="truncate">{item.name}</a>
					<button aria-label="Remove {item.name}" onclick={() => remove(item)}><Icon name="x" size={14} /></button>
				</span>
			{/each}
			<div class="row add">
				<select class="select" bind:value={adding} aria-label="Add to comparison">
					<option value="">Add asset or portfolio…</option>
					{#if addableAssets.length}<optgroup label="Assets"
							>{#each addableAssets as a (a.id)}<option value="a:{a.id}">{a.name}</option>{/each}</optgroup
						>{/if}
					{#if addablePortfolios.length}<optgroup label="Portfolios"
							>{#each addablePortfolios as p (p.id)}<option value="p:{p.id}">{p.name}</option>{/each}</optgroup
						>{/if}
				</select>
				<Button size="sm" icon="plus" disabled={!adding} onclick={add}>Add</Button>
			</div>
		</div>
	</Card>

	{#if items.length === 0}
		<Card
			><EmptyState icon="compare" title="Nothing to compare yet"
				>Select two or more <a href="/assets">assets</a> or <a href="/portfolios">portfolios</a> and choose Compare, or add them above.</EmptyState
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
							{#each items as item, i (item.key)}<th class="right"><span class="dot" style="background: {colorAt(i)}"></span>{item.name}</th
								>{/each}
						</tr>
					</thead>
					<tbody>
						{#each ROWS as row (row.key)}
							{@const b = best(row, metrics.value)}
							<tr>
								<th scope="row" class="metric">{row.label}</th>
								{#each items as item, i (item.key)}
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
			{#if !common.length}<p class="small muted">The selection has no overlapping period with enough history.</p>{/if}
		</Card>

		<Card title="Performance" subtitle="Rebased to the start of the selected range">
			<LineChart
				series={items.map((s, i) => ({ label: s.name, data: s.prices, color: colorAt(i) }))}
				mode="relative"
				allowRelative
				format="currency"
				currency={app.settings.mainCurrency}
				label="Performance comparison"
			/>
		</Card>

		<Card title="Drawdowns">
			<LineChart
				series={items.map((s, i) => ({ label: s.name, data: drawdownSeries(s.prices), color: colorAt(i) }))}
				format="percent"
				height={220}
				label="Drawdown comparison"
			/>
		</Card>

		<Card title="Crises" subtitle="Drawdown per crisis; second line: time to get back to the previous high">
			<CrisisModelSwitch />
			{#if crisis.model === 'historical'}<CrisisDataNotice />{/if}
			{#if !crisisReports}
				<p class="small muted">Loading crisis data…</p>
			{:else if !crisisRows.length}
				<p class="small muted">None of the selection can be tested in any crisis with the available data.</p>
			{:else}
				<div class="scroll-x">
					<table class="table crisis-table">
						<thead>
							<tr>
								<th>Crisis</th>
								{#each items as item, i (item.key)}<th class="right"
										><span class="dot" style="background: {colorAt(i)}"></span>{item.name}</th
									>{/each}
								{#if bench}<th class="right muted">{bench.name} (benchmark)</th>{/if}
							</tr>
						</thead>
						<tbody>
							{#each crisisRows as x (x.row.crisis.id)}
								<tr>
									<th scope="row" class="metric"
										>{x.row.crisis.name}<span class="xs muted block"
											>{x.row.crisis.scenario
												? `like ${x.row.crisis.examples}`
												: `${CRISIS_TYPE_SHORT[x.row.crisis.type]} · ${x.row.crisis.start.slice(0, 4)}`}</span
										></th
									>
									{#each x.cells as c, i (items[i]!.key)}
										<td class="right num" style={heat(c?.drawdown, x)}
											>{#if c}{fmt.pct(c.drawdown, 1)}<span class="xs muted block">{duration(c.recoveryDays)}</span>{:else}<span
													class="xs muted">no data</span
												>{/if}</td
										>
									{/each}
									{#if bench}
										<td class="right num muted" style={heat(x.bench?.drawdown, x)}
											>{#if x.bench}{fmt.pct(x.bench.drawdown, 1)}<span class="xs block">{duration(x.bench.recoveryDays)}</span>{:else}<span
													class="xs">no data</span
												>{/if}</td
										>
									{/if}
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr>
								<td>{SCORE_LABELS[crisis.prefs.score]}</td>
								{#each crisisReports as rep, i (items[i]!.key)}<td class="right num"
										>{Number.isFinite(rep.score)
											? crisis.prefs.score === 'longestRecovery'
												? duration(-rep.score * 365.25)
												: fmt.pct(rep.score, 1)
											: '–'}</td
									>{/each}
								{#if bench}<td class="right num muted"
										>{Number.isFinite(crisisReports[0]!.benchmarkScore)
											? crisis.prefs.score === 'longestRecovery'
												? duration(-crisisReports[0]!.benchmarkScore * 365.25)
												: fmt.pct(crisisReports[0]!.benchmarkScore, 1)
											: '–'}</td
									>{/if}
							</tr>
							{#if bench}
								<tr>
									<td>vs. benchmark</td>
									{#each crisisReports as rep, i (items[i]!.key)}<td class="right"
											>{#if rep.holdsUp === null}–{:else}<span class="verdict {rep.holdsUp ? 'ok' : 'bad'}"
													>{rep.holdsUp ? 'Holds up' : `Worse in ${rep.worse}`}</span
												>{/if}</td
										>{/each}
									<td></td>
								</tr>
							{/if}
						</tfoot>
					</table>
				</div>
				<p class="xs muted">
					{crisis.model === 'scenarios'
						? 'Crisis types use the assumed behaviour of what each asset invests in (see the asset page), weighted like the portfolio.'
						: "Scores and verdicts cover the crises that can be tested for each item and its benchmark; before an asset's own history, proxies are used (see the portfolio or asset page for details)."}
				</p>
			{/if}
			<div class="crisis-settings"><CrisisSettings /></div>
		</Card>

		<Card title="Details">
			<div class="scroll-x">
				<table class="table">
					<thead
						><tr
							><th>Detail</th>{#each items as item (item.key)}<th>{item.name}</th>{/each}</tr
						></thead
					>
					<tbody>
						<tr
							><th scope="row" class="metric">Type</th>{#each items as item (item.key)}<td>{item.type}</td>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">Currency</th>{#each items as item (item.key)}<td>{item.currency}</td>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">ISIN</th>{#each items as item (item.key)}<td class="mono">{item.isin ?? '–'}</td>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">WKN</th>{#each items as item (item.key)}<td class="mono">{item.wkn ?? '–'}</td>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">History</th>{#each items as item (item.key)}<td class="num"
									>{fmt.date(item.prices[0]?.date)} – {fmt.date(item.prices.at(-1)?.date)}</td
								>{/each}</tr
						>
						<tr
							><th scope="row" class="metric">Data points</th>{#each items as item (item.key)}<td class="num">{item.prices.length}</td
								>{/each}</tr
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
	.block {
		display: block;
		font-weight: 400;
	}
	.verdict {
		font-size: var(--text-xs);
		font-weight: 650;
		padding: 2px 8px;
		border-radius: 999px;
		white-space: nowrap;
	}
	.verdict.ok {
		background: var(--accent-soft);
		color: var(--positive);
	}
	.verdict.bad {
		background: var(--negative-soft);
		color: var(--negative);
	}
	.crisis-settings {
		margin-top: var(--space-3);
	}
</style>
