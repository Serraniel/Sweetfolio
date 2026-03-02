<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import type { Transaction, Asset } from '$lib/types';

	let {
		transactions,
		assets,
		portfolioId,
		onadd,
		onedit,
		ondelete
	}: {
		transactions: Transaction[];
		assets: Asset[];
		portfolioId: string;
		onadd: () => void;
		onedit: (tx: Transaction) => void;
		ondelete: (tx: Transaction) => void;
	} = $props();

	const assetMap = $derived(
		new Map(assets.map((a) => [a.id, a]))
	);

	const sortedTransactions = $derived(
		[...transactions].sort((a, b) => b.date.localeCompare(a.date))
	);

	function assetName(assetId: string): string {
		return assetMap.get(assetId)?.name ?? 'Unknown';
	}

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function formatNumber(value: number | null): string {
		if (value === null) return '—';
		return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function computeTotal(tx: Transaction): string {
		if (tx.amount !== null) return formatNumber(tx.amount);
		if (tx.quantity !== null && tx.price !== null) {
			const subtotal = tx.quantity * tx.price;
			const total = tx.type === 'sell' ? subtotal - tx.fee : subtotal + tx.fee;
			return formatNumber(total);
		}
		return '—';
	}

	function typeLabel(type: Transaction['type']): string {
		return type.charAt(0).toUpperCase() + type.slice(1);
	}
</script>

<section class="transactions-section">
	<div class="section-header">
		<h2>Transactions</h2>
		<div class="section-actions">
			<Button variant="primary" size="sm" onclick={onadd}>Add Transaction</Button>
		</div>
	</div>

	<Card>
		{#if sortedTransactions.length === 0}
			<div class="empty-state">
				<p>No transactions yet.</p>
				<p class="empty-hint">Add your first transaction to start tracking this portfolio.</p>
			</div>
		{:else}
			<div class="table-wrapper">
				<table class="tx-table">
					<thead>
						<tr>
							<th>Date</th>
							<th>Type</th>
							<th>Asset</th>
							<th class="num-col">Qty</th>
							<th class="num-col">Price</th>
							<th class="num-col">Fee</th>
							<th class="num-col">Total</th>
							<th class="actions-col">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each sortedTransactions as tx (tx.id)}
							<tr>
								<td class="mono">{formatDate(tx.date)}</td>
								<td>
									<span class="type-badge type-badge--{tx.type}">
										{typeLabel(tx.type)}
									</span>
								</td>
								<td class="asset-name">{assetName(tx.assetId)}</td>
								<td class="mono num-col">{formatNumber(tx.quantity)}</td>
								<td class="mono num-col">{formatNumber(tx.price)}</td>
								<td class="mono num-col">{formatNumber(tx.fee)}</td>
								<td class="mono num-col">{computeTotal(tx)}</td>
								<td class="actions-col">
									<button class="icon-btn" title="Edit" onclick={() => onedit(tx)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
											<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
										</svg>
									</button>
									<button class="icon-btn icon-btn--danger" title="Delete" onclick={() => ondelete(tx)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="3 6 5 6 21 6"/>
											<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
										</svg>
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>
</section>

<style>
	.transactions-section {
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

	.section-actions {
		display: flex;
		gap: var(--spacing-sm);
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

	.tx-table {
		font-size: var(--font-size-sm);
		width: 100%;
	}

	.tx-table th {
		font-weight: 600;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
	}

	.tx-table td {
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	.num-col {
		text-align: right;
	}

	.actions-col {
		width: 80px;
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

	/* Type badges */
	.type-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.type-badge--buy {
		background: rgba(34, 197, 94, 0.12);
		color: #22c55e;
	}

	.type-badge--sell {
		background: rgba(232, 23, 93, 0.1);
		color: var(--color-negative);
	}

	.type-badge--dividend {
		background: rgba(141, 208, 196, 0.15);
		color: var(--color-accent);
	}

	/* Icon buttons */
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		transition: color var(--transition-fast), background var(--transition-fast);
	}

	.icon-btn:hover {
		color: var(--color-accent);
		background: rgba(141, 208, 196, 0.1);
	}

	.icon-btn--danger:hover {
		color: var(--color-negative, #e55);
		background: rgba(232, 23, 93, 0.08);
	}
</style>
