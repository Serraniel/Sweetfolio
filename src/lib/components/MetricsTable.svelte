<script lang="ts">
	/**
	 * Metrics per period with explanations (FM-7). With a benchmark, each cell shows the
	 * benchmark's value below, muted green when it did better and muted red when worse.
	 */
	import { PERIOD_KEYS, type MetricsResult, type PeriodKey, type PeriodMetrics } from '#lib/domain/types.ts';
	import * as fmt from '#lib/format.ts';

	let {
		metrics,
		loading = false,
		benchmark = null,
		benchmarkLabel = 'Benchmark',
		correlation = null
	}: {
		metrics: MetricsResult | null;
		loading?: boolean;
		/** Benchmark metrics over the same dates as `metrics`. */
		benchmark?: MetricsResult | null;
		benchmarkLabel?: string;
		/** Correlation with the benchmark per period. */
		correlation?: Record<PeriodKey, number | null> | null;
	} = $props();

	/** Whether a higher value is better; volatility is the only "lower is better" metric. */
	const HIGHER_IS_BETTER: Record<keyof PeriodMetrics, boolean> = {
		cumulativeReturn: true,
		annualizedReturn: true,
		volatility: false,
		sharpeRatio: true,
		maxDrawdown: true,
		startDate: true,
		endDate: true
	};
	function compareClass(key: keyof PeriodMetrics, own: number | undefined, bench: number | undefined): string {
		if (own === undefined || bench === undefined || !Number.isFinite(own) || !Number.isFinite(bench)) return '';
		const diff = HIGHER_IS_BETTER[key] ? bench - own : own - bench;
		return Math.abs(diff) < 1e-9 ? '' : diff > 0 ? 'b-better' : 'b-worse';
	}

	const LABELS: Record<PeriodKey, string> = { '1y': '1Y', '3y': '3Y', '5y': '5Y', '10y': '10Y', '15y': '15Y', all: 'All' };
	const ROWS: Array<{ key: keyof PeriodMetrics; label: string; info: string; kind: 'pct' | 'num' }> = [
		{ key: 'cumulativeReturn', label: 'Total return', info: 'Price change over the period: end ÷ start − 1.', kind: 'pct' },
		{ key: 'annualizedReturn', label: 'Return p.a.', info: 'Compound annual growth rate over the period.', kind: 'pct' },
		{
			key: 'volatility',
			label: 'Volatility',
			info: 'Annualized standard deviation of daily log returns (× √252). Higher = bumpier.',
			kind: 'pct'
		},
		{
			key: 'sharpeRatio',
			label: 'Sharpe ratio',
			info: '(Return p.a. − risk-free rate) ÷ volatility. Return per unit of risk; above 1 is good.',
			kind: 'num'
		},
		{ key: 'maxDrawdown', label: 'Max drawdown', info: 'Largest fall from a previous high within the period.', kind: 'pct' }
	];
	let openInfo = $state<string | null>(null);
	const periods = $derived(PERIOD_KEYS.filter((p) => !metrics || metrics[p] !== null || p === 'all'));
</script>

<div class="scroll-x">
	<table class="table metrics" aria-busy={loading}>
		<thead>
			<tr>
				<th scope="col">Metric</th>
				{#each periods as p (p)}<th scope="col" class="right">{LABELS[p]}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each ROWS as row (row.key)}
				<tr>
					<th scope="row" class="metric">
						<button class="info" aria-expanded={openInfo === row.key} onclick={() => (openInfo = openInfo === row.key ? null : row.key)}>
							{row.label}<span aria-hidden="true">ⓘ</span>
						</button>
						{#if openInfo === row.key}<p class="xs muted explain">{row.info}</p>{/if}
					</th>
					{#each periods as p (p)}
						{@const v = metrics?.[p]?.[row.key] as number | undefined}
						{@const b = benchmark?.[p]?.[row.key] as number | undefined}
						<td class="right num {row.key === 'volatility' ? '' : fmt.signClass(v)}">
							{#if loading && !metrics}<span class="skeleton"></span>{:else}{row.kind === 'pct' ? fmt.pct(v) : fmt.num(v)}{/if}
							{#if benchmark && b !== undefined}<span
									class="bench xs {compareClass(row.key, v, b)}"
									title="{benchmarkLabel}: {row.kind === 'pct' ? fmt.pct(b) : fmt.num(b)}"
									>{row.kind === 'pct' ? fmt.pct(b) : fmt.num(b)}</span
								>{/if}
						</td>
					{/each}
				</tr>
			{/each}
			{#if correlation}
				<tr>
					<th scope="row" class="metric">
						<button class="info" aria-expanded={openInfo === 'corr'} onclick={() => (openInfo = openInfo === 'corr' ? null : 'corr')}>
							Correlation with benchmark<span aria-hidden="true">ⓘ</span>
						</button>
						{#if openInfo === 'corr'}<p class="xs muted explain">
								Pearson correlation of daily log returns with {benchmarkLabel} on common dates. 1 = moves in lockstep, 0 = unrelated, −1 = opposite.
							</p>{/if}
					</th>
					{#each periods as p (p)}
						<td class="right num">{fmt.num(correlation[p] ?? undefined)}</td>
					{/each}
				</tr>
			{/if}
		</tbody>
	</table>
</div>

<style>
	.metrics th.metric {
		text-transform: none;
		letter-spacing: 0;
		font-size: var(--text-sm);
		color: var(--text);
		font-weight: 550;
		min-width: 130px;
		white-space: normal;
	}
	.info {
		border: none;
		background: none;
		padding: 0;
		display: inline-flex;
		gap: 4px;
		align-items: center;
		font-weight: 550;
	}
	.info span {
		color: var(--muted);
		font-size: 0.8em;
	}
	.explain {
		font-weight: 400;
		max-width: 260px;
		margin-top: 4px;
	}
	.bench {
		display: block;
		margin-top: 2px;
		color: var(--muted);
		font-weight: 400;
	}
	/* Muted versions of the positive / negative colours: the benchmark did better / worse. */
	.bench.b-better {
		color: color-mix(in srgb, var(--positive) 55%, var(--muted));
	}
	.bench.b-worse {
		color: color-mix(in srgb, var(--negative) 55%, var(--muted));
	}
	.skeleton {
		display: inline-block;
		width: 48px;
		height: 12px;
		border-radius: 4px;
		background: var(--surface-3);
		animation: pulse 1.2s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.5;
		}
	}
</style>
