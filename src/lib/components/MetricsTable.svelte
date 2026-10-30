<script lang="ts">
	/** Metrics per period with explanations (FM-7). */
	import { PERIOD_KEYS, type MetricsResult, type PeriodKey, type PeriodMetrics } from '#lib/domain/types.ts';
	import * as fmt from '#lib/format.ts';

	let { metrics, loading = false }: { metrics: MetricsResult | null; loading?: boolean } = $props();

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
						<td class="right num {row.key === 'volatility' ? '' : fmt.signClass(v)}">
							{#if loading && !metrics}<span class="skeleton"></span>{:else}{row.kind === 'pct' ? fmt.pct(v) : fmt.num(v)}{/if}
						</td>
					{/each}
				</tr>
			{/each}
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
