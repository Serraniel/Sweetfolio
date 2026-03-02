<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import type { Asset } from '$lib/types';

	let {
		driftItems,
		rebalanceTrades,
		assets
	}: {
		driftItems: Array<{ assetId: string; modelWeight: number; actualWeight: number; drift: number }>;
		rebalanceTrades: Array<{ assetId: string; action: 'buy' | 'sell'; value: number; currentWeight: number; targetWeight: number }>;
		assets: Asset[];
	} = $props();

	const assetMap = $derived(
		new Map(assets.map((a) => [a.id, a]))
	);

	function assetName(assetId: string): string {
		return assetMap.get(assetId)?.name ?? 'Unknown';
	}

	function formatPercent(value: number): string {
		return (value * 100).toFixed(1) + '%';
	}

	function formatCurrency(value: number): string {
		return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	const maxAbsDrift = $derived(
		driftItems.length > 0
			? Math.max(...driftItems.map((d) => Math.abs(d.drift)))
			: 1
	);
</script>

<section class="drift-section">
	<div class="section-header">
		<h2>Drift Analysis</h2>
	</div>

	{#if driftItems.length === 0}
		<Card>
			<div class="empty-state">
				<p>No drift data available.</p>
				<p class="empty-hint">Add model allocations and transactions to see drift analysis.</p>
			</div>
		</Card>
	{:else}
		<Card>
			<div class="table-wrapper">
				<table class="drift-table">
					<thead>
						<tr>
							<th>Asset</th>
							<th class="num-col">Model %</th>
							<th class="num-col">Actual %</th>
							<th class="num-col">Drift</th>
						</tr>
					</thead>
					<tbody>
						{#each driftItems as item (item.assetId)}
							{@const driftPct = item.drift * 100}
							{@const barWidth = maxAbsDrift > 0 ? (Math.abs(item.drift) / maxAbsDrift) * 30 : 0}
							<tr>
								<td class="asset-name">{assetName(item.assetId)}</td>
								<td class="mono num-col">{formatPercent(item.modelWeight)}</td>
								<td class="mono num-col">{formatPercent(item.actualWeight)}</td>
								<td class="num-col">
									<div class="drift-cell">
										<div class="drift-bar-container">
											{#if item.drift < 0}
												<div class="drift-bar-half drift-bar-left">
													<div
														class="drift-bar drift-bar-negative"
														style="width: {barWidth}px;"
													></div>
												</div>
												<div class="drift-bar-half drift-bar-right"></div>
											{:else}
												<div class="drift-bar-half drift-bar-left"></div>
												<div class="drift-bar-half drift-bar-right">
													<div
														class="drift-bar drift-bar-positive"
														style="width: {barWidth}px;"
													></div>
												</div>
											{/if}
											<div class="drift-bar-center-line"></div>
										</div>
										<span
											class="mono drift-value"
											class:drift-positive={item.drift > 0}
											class:drift-negative={item.drift < 0}
										>
											{item.drift > 0 ? '+' : ''}{driftPct.toFixed(1)}%
										</span>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>

		{#if rebalanceTrades.length > 0}
			<div class="section-header rebalance-header">
				<h2>Rebalancing Suggestions</h2>
			</div>

			<Card>
				<div class="table-wrapper">
					<table class="drift-table">
						<thead>
							<tr>
								<th>Asset</th>
								<th>Action</th>
								<th class="num-col">Value</th>
								<th class="num-col">From %</th>
								<th class="num-col">To %</th>
							</tr>
						</thead>
						<tbody>
							{#each rebalanceTrades as trade (trade.assetId)}
								<tr>
									<td class="asset-name">{assetName(trade.assetId)}</td>
									<td>
										<span class="badge" class:badge-buy={trade.action === 'buy'} class:badge-sell={trade.action === 'sell'}>
											{trade.action === 'buy' ? 'Buy' : 'Sell'}
										</span>
									</td>
									<td class="mono num-col">{formatCurrency(trade.value)}</td>
									<td class="mono num-col">{formatPercent(trade.currentWeight)}</td>
									<td class="mono num-col">{formatPercent(trade.targetWeight)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/if}
	{/if}
</section>

<style>
	.drift-section {
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

	.rebalance-header {
		margin-top: var(--spacing-xl);
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

	.table-wrapper {
		overflow-x: auto;
	}

	.drift-table {
		font-size: var(--font-size-sm);
		width: 100%;
	}

	.drift-table th {
		font-weight: 600;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
	}

	.drift-table td {
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
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

	/* Drift bar visualization */
	.drift-cell {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--spacing-sm);
	}

	.drift-bar-container {
		position: relative;
		display: flex;
		width: 60px;
		height: 14px;
		flex-shrink: 0;
	}

	.drift-bar-half {
		width: 50%;
		display: flex;
		align-items: center;
	}

	.drift-bar-left {
		justify-content: flex-end;
	}

	.drift-bar-right {
		justify-content: flex-start;
	}

	.drift-bar {
		height: 10px;
		border-radius: 2px;
	}

	.drift-bar-positive {
		background: rgba(34, 197, 94, 0.7);
	}

	.drift-bar-negative {
		background: var(--color-negative);
		opacity: 0.7;
	}

	.drift-bar-center-line {
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--color-border);
		transform: translateX(-0.5px);
	}

	.drift-value {
		min-width: 52px;
		text-align: right;
	}

	.drift-positive {
		color: rgba(34, 197, 94, 1);
	}

	.drift-negative {
		color: var(--color-negative);
	}

	/* Rebalancing badges */
	.badge {
		display: inline-block;
		padding: 2px var(--spacing-sm);
		border-radius: 4px;
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.badge-buy {
		background: rgba(34, 197, 94, 0.15);
		color: rgba(34, 197, 94, 1);
	}

	.badge-sell {
		background: rgba(239, 68, 68, 0.15);
		color: var(--color-negative);
	}
</style>
