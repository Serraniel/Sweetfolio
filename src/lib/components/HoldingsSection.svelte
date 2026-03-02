<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import AllocationChart from '$lib/charts/AllocationChart.svelte';
	import type { Holding, Asset, RealizedGain } from '$lib/types';

	let {
		holdings,
		assets,
		realizedGains
	}: {
		holdings: Holding[];
		assets: Asset[];
		realizedGains: RealizedGain[];
	} = $props();

	const assetMap = $derived(
		new Map(assets.map((a) => [a.id, a]))
	);

	function assetName(assetId: string): string {
		return assetMap.get(assetId)?.name ?? 'Unknown';
	}

	function formatNumber(value: number | null | undefined): string {
		if (value == null || isNaN(value)) return '\u2014';
		return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function formatPercent(value: number | null | undefined): string {
		if (value == null || isNaN(value)) return '\u2014';
		return value.toFixed(1) + '%';
	}

	const totalValue = $derived(
		holdings.reduce((sum, h) => sum + h.currentValue, 0)
	);

	const totalCost = $derived(
		holdings.reduce((sum, h) => sum + h.totalCost, 0)
	);

	const totalUnrealizedGain = $derived(
		holdings.reduce((sum, h) => sum + h.unrealizedGain, 0)
	);

	const totalUnrealizedGainPercent = $derived(
		totalCost !== 0 ? (totalUnrealizedGain / totalCost) * 100 : 0
	);

	const totalRealizedGains = $derived(
		realizedGains.reduce((sum, rg) => sum + rg.gain, 0)
	);

	const allocations = $derived(
		holdings.map((h) => ({ label: assetName(h.assetId), weight: h.weight }))
	);
</script>

<section class="holdings-section">
	<div class="section-header">
		<h2>Holdings</h2>
	</div>

	{#if holdings.length === 0}
		<Card>
			<div class="empty-state">
				<p>No holdings yet.</p>
				<p class="empty-hint">Add buy transactions to build your portfolio.</p>
			</div>
		</Card>
	{:else}
		<div class="holdings-layout">
			<div class="holdings-table-col">
				<Card>
					<div class="table-wrapper">
						<table class="holdings-table">
							<thead>
								<tr>
									<th>Asset</th>
									<th class="num-col">Qty</th>
									<th class="num-col">Avg Cost</th>
									<th class="num-col">Price</th>
									<th class="num-col">Value</th>
									<th class="num-col">Gain/Loss</th>
									<th class="num-col">Weight</th>
								</tr>
							</thead>
							<tbody>
								{#each holdings as h (h.assetId)}
									<tr>
										<td class="asset-name">{assetName(h.assetId)}</td>
										<td class="mono num-col">{formatNumber(h.quantity)}</td>
										<td class="mono num-col">{formatNumber(h.avgCostBasis)}</td>
										<td class="mono num-col">{formatNumber(h.currentPrice)}</td>
										<td class="mono num-col">{formatNumber(h.currentValue)}</td>
										<td class="mono num-col" class:gain-positive={h.unrealizedGain > 0} class:gain-negative={h.unrealizedGain < 0}>
											{formatNumber(h.unrealizedGain)} ({formatPercent(h.unrealizedGainPercent * 100)})
										</td>
										<td class="mono num-col">{formatPercent(h.weight * 100)}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot>
								<tr class="summary-row">
									<td colspan="4"><strong>Total</strong></td>
									<td class="mono num-col"><strong>{formatNumber(totalValue)}</strong></td>
									<td class="mono num-col" class:gain-positive={totalUnrealizedGain > 0} class:gain-negative={totalUnrealizedGain < 0}>
										<strong>{formatNumber(totalUnrealizedGain)} ({formatPercent(totalUnrealizedGainPercent)})</strong>
									</td>
									<td class="mono num-col"><strong>100.0%</strong></td>
								</tr>
							</tfoot>
						</table>
					</div>

					{#if realizedGains.length > 0}
						<div class="realized-gains-summary">
							Realized Gains: <span class="mono" class:gain-positive={totalRealizedGains > 0} class:gain-negative={totalRealizedGains < 0}>{formatNumber(totalRealizedGains)}</span>
						</div>
					{/if}
				</Card>
			</div>

			<div class="holdings-chart-col">
				<Card>
					<AllocationChart {allocations} size={240} />
				</Card>
			</div>
		</div>
	{/if}
</section>

<style>
	.holdings-section {
		margin-top: var(--spacing-xl);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.section-header h2 {
		font-size: var(--font-size-lg);
		margin: 0;
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl) var(--spacing-md);
		color: var(--color-text-muted);
	}

	.empty-state p {
		margin: 0;
	}

	.empty-hint {
		font-size: var(--font-size-sm);
		margin-top: var(--spacing-xs) !important;
	}

	.holdings-layout {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--spacing-lg);
		align-items: start;
	}

	@media (max-width: 900px) {
		.holdings-layout {
			grid-template-columns: 1fr;
		}
	}

	.holdings-table-col {
		min-width: 0;
	}

	.table-wrapper {
		overflow-x: auto;
	}

	.holdings-table {
		font-size: var(--font-size-sm);
		width: 100%;
	}

	.holdings-table th {
		font-weight: 600;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
	}

	.holdings-table td {
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	.holdings-table tfoot td {
		border-bottom: none;
		border-top: 2px solid var(--color-border);
	}

	.num-col {
		text-align: right;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
	}

	.asset-name {
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.gain-positive {
		color: var(--color-positive, #22c55e);
	}

	.gain-negative {
		color: var(--color-negative);
	}

	.summary-row td {
		padding-top: var(--spacing-sm);
	}

	.realized-gains-summary {
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-sm);
		border-top: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}
</style>
