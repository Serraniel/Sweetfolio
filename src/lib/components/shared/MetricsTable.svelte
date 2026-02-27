<script lang="ts">
	interface PeriodMetrics {
		cumulativeReturn: number;
		annualizedReturn: number;
		volatility: number;
		sharpeRatio: number;
		maxDrawdown: number;
	}

	let {
		metrics = {}
	}: {
		metrics?: Partial<Record<string, PeriodMetrics | null>>;
	} = $props();

	const periods = ['1y', '3y', '5y', '10y', '15y', 'ALL'];

	const rows = [
		{ key: 'cumulativeReturn', label: 'Cumulative Return', format: formatPercent },
		{ key: 'annualizedReturn', label: 'Annualized Return', format: formatPercent },
		{ key: 'volatility', label: 'Volatility', format: formatPercent },
		{ key: 'sharpeRatio', label: 'Sharpe Ratio', format: formatNumber },
		{ key: 'maxDrawdown', label: 'Max Drawdown', format: formatPercent }
	];

	function formatPercent(value: number | undefined): string {
		if (value === undefined || value === null) return '\u2014';
		return (value * 100).toFixed(2) + '%';
	}

	function formatNumber(value: number | undefined): string {
		if (value === undefined || value === null) return '\u2014';
		return value.toFixed(3);
	}

	function getValue(period: string, key: string): number | undefined {
		const p = metrics[period.toLowerCase()];
		if (!p) return undefined;
		return (p as unknown as Record<string, number>)[key];
	}

	function valueClass(key: string, value: number | undefined): string {
		if (value === undefined || value === null) return '';
		if (key === 'maxDrawdown') return 'negative';
		if (key === 'cumulativeReturn' || key === 'annualizedReturn') {
			return value >= 0 ? 'positive' : 'negative';
		}
		return '';
	}
</script>

<div class="metrics-table-wrapper">
	<table class="metrics-table">
		<thead>
			<tr>
				<th class="metric-label-col">Metric</th>
				{#each periods as period}
					<th>{period}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row}
				<tr>
					<td class="metric-label">{row.label}</td>
					{#each periods as period}
						{@const val = getValue(period, row.key)}
						<td class="metric-value {valueClass(row.key, val)}">
							{row.format(val)}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.metrics-table-wrapper {
		overflow-x: auto;
	}

	.metrics-table {
		font-size: var(--font-size-sm);
		white-space: nowrap;
	}

	.metrics-table th {
		font-weight: 600;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.metrics-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.metric-label-col {
		text-align: left;
	}

	.metric-label {
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.metric-value {
		text-align: right;
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
	}

	.metric-value.positive {
		color: var(--color-positive);
	}

	.metric-value.negative {
		color: var(--color-negative);
	}
</style>
