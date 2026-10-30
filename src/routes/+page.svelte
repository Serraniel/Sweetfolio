<script lang="ts">
	import { app } from '#lib/state/app.svelte.ts';
	import { asyncDerived } from '#lib/state/async.svelte.ts';
	import * as calc from '#lib/workers/client.ts';
	import { computeHoldings } from '#lib/core/tracking.ts';
	import { convertAmount } from '#lib/core/currency.ts';
	import * as fmt from '#lib/format.ts';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Stat from '#lib/ui/Stat.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Heatmap from '#lib/charts/Heatmap.svelte';
	import LineChart from '#lib/charts/LineChart.svelte';

	const main = $derived(app.settings.mainCurrency);
	const empty = $derived(app.assets.length === 0);

	const correlationAssets = $derived(
		[...app.assets]
			.filter((a) => a.prices.length > 20)
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, 24)
	);
	const correlation = asyncDerived(() =>
		correlationAssets.length >= 2 ? calc.correlation(correlationAssets.map((a) => ({ id: a.id, prices: app.converted(a).prices }))) : null
	);
	const labels = $derived(new Map(app.assets.map((a) => [a.id, a.name])));

	const benchmarkSeries = $derived(app.benchmarkResolved ? app.benchmarkSeries() : null);
	const benchmarkMetrics = asyncDerived(() =>
		benchmarkSeries && benchmarkSeries.length > 1 ? calc.metrics(benchmarkSeries, app.riskFreeRate) : null
	);

	const tracked = $derived(
		app.portfolios
			.filter((p) => p.mode !== 'model')
			.map((p) => {
				const latest = (id: string) => {
					const a = app.assetById.get(id);
					const last = a?.prices.at(-1);
					if (!a || !last) return null;
					return convertAmount(last.close, last.date, a.currency, p.cashCurrency, app.currencies);
				};
				const s = computeHoldings(app.transactionsOf(p.id), latest, { trackCash: p.trackCash });
				return { p, s };
			})
	);

	const steps = $derived([
		{
			done: app.assets.length > 0,
			title: 'Add assets',
			text: 'Look up an ISIN/WKN or upload CSV price histories.',
			href: '/assets',
			cta: 'Add assets'
		},
		{
			done: app.portfolios.length > 0,
			title: 'Build a portfolio',
			text: 'Combine assets with weights and backtest it — or track real transactions.',
			href: '/portfolios',
			cta: 'Create portfolio'
		},
		{
			done: !!app.settings.benchmark,
			title: 'Pick a benchmark',
			text: 'Mark an asset or portfolio as benchmark to compare everything against it.',
			href: '/assets',
			cta: 'Choose benchmark'
		},
		{
			done: false,
			title: 'Run a simulation',
			text: 'Find efficient allocations with a Monte Carlo simulation.',
			href: '/simulation',
			cta: 'Simulate'
		}
	]);
</script>

<PageHeader title="Dashboard" subtitle="Plan, backtest and track your portfolios — privately, in your browser." />

<div class="stack" style="--gap: 20px">
	<div class="stats">
		<a class="stat-card" href="/assets"><Stat label="Assets" value={String(app.assets.length)} /></a>
		<a class="stat-card" href="/portfolios"><Stat label="Portfolios" value={String(app.portfolios.length)} /></a>
		<a class="stat-card" href="/strategies"><Stat label="Strategies" value={String(app.strategies.length)} /></a>
		<a class="stat-card" href="/settings"
			><Stat label="Currency" value={main} sub={`Risk-free ${fmt.num(app.settings.riskFreeRate, 2, 0)} %`} /></a
		>
	</div>

	{#if empty || steps.filter((s) => s.done).length < 3}
		<Card title="Getting started">
			<ol class="steps">
				{#each steps as s, i (s.title)}
					<li class:done={s.done}>
						<span class="badge"
							>{#if s.done}<Icon name="check" size={14} />{:else}{i + 1}{/if}</span
						>
						<div>
							<h3>{s.title}</h3>
							<p class="small muted">{s.text}</p>
						</div>
						{#if !s.done}<Button size="sm" href={s.href}>{s.cta}</Button>{/if}
					</li>
				{/each}
			</ol>
		</Card>
	{/if}

	{#if tracked.length}
		<Card title="Tracked portfolios">
			<div class="tracked">
				{#each tracked as { p, s } (p.id)}
					<a class="tracked-item" href="/portfolios/{app.portfolioSlug(p.id)}">
						<span class="truncate strong">{p.name}</span>
						<span class="num big">{fmt.money(s.totalValue, p.cashCurrency)}</span>
						<span class="num small {fmt.signClass(s.totalReturn)}"
							>{fmt.money(s.totalReturn, p.cashCurrency, { signed: true })} · {fmt.pct(s.totalReturnPercent, 1, true)}</span
						>
					</a>
				{/each}
			</div>
		</Card>
	{/if}

	{#if app.benchmarkResolved && benchmarkSeries}
		<Card title="Benchmark" subtitle={app.benchmarkResolved.name}>
			{#snippet actions()}
				<Button
					size="sm"
					variant="ghost"
					href={app.benchmarkResolved?.kind === 'asset'
						? `/assets/${app.assetSlug(app.benchmarkResolved.ref.id)}`
						: `/portfolios/${app.portfolioSlug(app.benchmarkResolved?.ref.id ?? '')}`}>Open</Button
				>
			{/snippet}
			<div class="bench-stats">
				{#each [['1y', '1Y'], ['5y', '5Y'], ['all', 'All']] as const as [k, l] (k)}
					{@const m = benchmarkMetrics.value?.[k]}
					<Stat label="Return p.a. {l}" value={fmt.pct(m?.annualizedReturn)} tone={fmt.signClass(m?.annualizedReturn)} />
				{/each}
				<Stat label="Volatility" value={fmt.pct(benchmarkMetrics.value?.all?.volatility)} />
			</div>
			<LineChart
				series={[{ label: app.benchmarkResolved.name, data: benchmarkSeries, fill: true }]}
				height={180}
				showRange={false}
				label="Benchmark history"
			/>
		</Card>
	{/if}

	{#if correlationAssets.length >= 2}
		<Card title="Asset correlations" subtitle="Pearson correlation of daily log returns on common dates">
			{#if correlation.value}
				<Heatmap
					matrix={correlation.value}
					{labels}
					onselect={(a, b) => goto(`/compare?slugs=${[a, b].map((id) => app.assetSlug(id)).join(',')}`)}
				/>
			{:else}
				<p class="muted small">Calculating…</p>
			{/if}
			{#if app.assets.length > correlationAssets.length}<p class="xs muted">
					Showing {correlationAssets.length} of {app.assets.length} assets.
				</p>{/if}
		</Card>
	{/if}

	<Card title="Quick actions">
		<div class="row">
			<Button icon="upload" href="/assets">Add assets</Button>
			<Button icon="portfolio" href="/portfolios">Portfolios</Button>
			<Button icon="simulation" href="/simulation">Run simulation</Button>
			<Button icon="download" href="/settings#data">Backup &amp; import</Button>
		</div>
	</Card>
</div>

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-3);
	}
	@media (min-width: 900px) {
		.stats {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.stat-card {
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		color: inherit;
		text-decoration: none;
		transition: border-color 0.15s;
	}
	.stat-card:hover {
		border-color: var(--accent);
		text-decoration: none;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-3);
	}
	.steps li {
		display: grid;
		grid-template-columns: 28px 1fr auto;
		gap: var(--space-3);
		align-items: center;
	}
	.steps li.done {
		opacity: 0.6;
	}
	.badge {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 700;
		font-size: var(--text-sm);
	}
	.done .badge {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.tracked {
		display: grid;
		gap: var(--space-3);
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	}
	.tracked-item {
		display: grid;
		gap: 2px;
		padding: var(--space-3);
		border-radius: var(--radius);
		background: var(--surface-2);
		color: inherit;
		text-decoration: none;
	}
	.strong {
		font-weight: 600;
	}
	.big {
		font-size: var(--text-xl);
		font-weight: 650;
	}
	.bench-stats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
</style>
