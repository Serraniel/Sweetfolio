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
		{ key: 'cumulativeReturn', label: 'Cumulative Return', format: formatPercent,
			tooltip: 'Total percentage gain or loss over the entire period, without annualizing.' },
		{ key: 'annualizedReturn', label: 'Annualized Return', format: formatPercent,
			tooltip: 'Average yearly return, compounded. Lets you compare investments held for different lengths of time.' },
		{ key: 'volatility', label: 'Volatility', format: formatPercent,
			tooltip: 'Annualized standard deviation of returns. Higher values mean larger price swings and more risk.' },
		{ key: 'sharpeRatio', label: 'Sharpe Ratio', format: formatNumber,
			tooltip: 'Excess return per unit of risk: (return \u2212 risk-free rate) \u00F7 volatility. Higher is better; above 1 is generally considered good.' },
		{ key: 'maxDrawdown', label: 'Max Drawdown', format: formatPercent,
			tooltip: 'Largest peak-to-trough decline. Shows the worst-case loss you would have experienced if you bought at the peak.' }
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
					<td class="metric-label">
						{row.label}
						<span class="info-icon" tabindex="0" role="button" aria-label="Info">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="10"/>
								<line x1="12" y1="16" x2="12" y2="12"/>
								<line x1="12" y1="8" x2="12.01" y2="8"/>
							</svg>
							<span class="tooltip">{row.tooltip}</span>
						</span>
					</td>
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
		text-align: right;
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

	.info-icon {
		position: relative;
		display: inline-flex;
		align-items: center;
		vertical-align: middle;
		margin-left: 4px;
		color: var(--color-text-muted);
		cursor: help;
		outline: none;
	}

	.info-icon:hover,
	.info-icon:focus {
		color: var(--color-accent);
	}

	.tooltip {
		display: none;
		position: absolute;
		left: 50%;
		bottom: calc(100% + 8px);
		transform: translateX(-50%);
		width: 240px;
		padding: 8px 10px;
		font-size: var(--font-size-xs);
		font-weight: 400;
		line-height: 1.45;
		white-space: normal;
		color: var(--color-text-primary);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 10;
		pointer-events: none;
	}

	.info-icon:hover .tooltip,
	.info-icon:focus .tooltip {
		display: block;
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
