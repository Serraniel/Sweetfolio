<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import { refreshProgress, resolveConflicts } from '$lib/stores/auto-refresh';
	import type { PriceConflict } from '$lib/engine/price-merge';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const conflicts = $derived($refreshProgress.conflicts);

	// Track user choices: assetId -> date -> useNew
	let choices: Record<string, Record<string, boolean>> = $state({});

	// Initialize choices when conflicts change
	$effect(() => {
		const init: Record<string, Record<string, boolean>> = {};
		for (const ac of conflicts) {
			init[ac.assetId] = {};
			for (const c of ac.conflicts) {
				// Default to "keep existing" (useNew = false)
				init[ac.assetId][c.date] = choices[ac.assetId]?.[c.date] ?? false;
			}
		}
		choices = init;
	});

	function setAllForAsset(assetId: string, useNew: boolean) {
		const updated = { ...choices };
		if (updated[assetId]) {
			for (const date of Object.keys(updated[assetId])) {
				updated[assetId][date] = useNew;
			}
		}
		choices = updated;
	}

	function toggleChoice(assetId: string, date: string) {
		const updated = { ...choices };
		if (updated[assetId]) {
			updated[assetId][date] = !updated[assetId][date];
		}
		choices = updated;
	}

	async function handleApply() {
		const resolutions = conflicts.map((ac) => ({
			assetId: ac.assetId,
			resolved: ac.conflicts.map((c) => ({
				date: c.date,
				useNew: choices[ac.assetId]?.[c.date] ?? false,
				newClose: c.fetchedClose,
			})),
		}));
		await resolveConflicts(resolutions);
		open = false;
	}

	function handleDismiss() {
		// Clear conflicts without applying changes
		refreshProgress.update((p) => ({ ...p, conflicts: [] }));
		open = false;
	}

	function formatPrice(price: number): string {
		return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function deviationPercent(existing: number, fetched: number): string {
		const pct = ((fetched - existing) / existing) * 100;
		return (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
	}
</script>

<Modal bind:open title="Price Conflicts">
	{#snippet children()}
		<p class="conflict-intro">
			The following price data differs from your existing records by more than 1%.
			Choose which values to keep for each date.
		</p>

		{#each conflicts as ac (ac.assetId)}
			<div class="conflict-asset">
				<div class="asset-header">
					<span class="asset-name">{ac.assetName}</span>
					<span class="conflict-count">{ac.conflicts.length} conflict{ac.conflicts.length > 1 ? 's' : ''}</span>
					<div class="bulk-actions">
						<button class="bulk-btn" onclick={() => setAllForAsset(ac.assetId, false)}>Keep all existing</button>
						<button class="bulk-btn" onclick={() => setAllForAsset(ac.assetId, true)}>Use all new</button>
					</div>
				</div>

				<table class="conflict-table">
					<thead>
						<tr>
							<th>Date</th>
							<th class="num">Existing</th>
							<th class="num">New</th>
							<th class="num">Diff</th>
							<th>Choice</th>
						</tr>
					</thead>
					<tbody>
						{#each ac.conflicts as c (c.date)}
							{@const useNew = choices[ac.assetId]?.[c.date] ?? false}
							<tr>
								<td class="mono">{c.date}</td>
								<td class="num" class:chosen={!useNew}>{formatPrice(c.existingClose)}</td>
								<td class="num" class:chosen={useNew}>{formatPrice(c.fetchedClose)}</td>
								<td class="num deviation">{deviationPercent(c.existingClose, c.fetchedClose)}</td>
								<td>
									<button
										class="choice-toggle"
										class:use-new={useNew}
										onclick={() => toggleChoice(ac.assetId, c.date)}
									>
										{useNew ? 'Use new' : 'Keep existing'}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/each}
	{/snippet}

	{#snippet footer()}
		<Button variant="ghost" onclick={handleDismiss}>Dismiss</Button>
		<Button variant="primary" onclick={handleApply}>Apply Choices</Button>
	{/snippet}
</Modal>

<style>
	.conflict-intro {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.conflict-asset {
		margin-bottom: var(--spacing-lg);
	}

	.conflict-asset:last-child {
		margin-bottom: 0;
	}

	.asset-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.asset-name {
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.conflict-count {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.bulk-actions {
		display: flex;
		gap: var(--spacing-xs);
		margin-left: auto;
	}

	.bulk-btn {
		font-size: var(--font-size-xs);
		padding: 2px var(--spacing-xs);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		background: transparent;
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast);
	}

	.bulk-btn:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.conflict-table {
		width: 100%;
		font-size: var(--font-size-xs);
	}

	.conflict-table th {
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
		padding: var(--spacing-xs);
	}

	.conflict-table td {
		padding: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	.mono {
		font-family: var(--font-mono);
	}

	.num {
		text-align: right;
		font-family: var(--font-mono);
	}

	.chosen {
		font-weight: 600;
		color: var(--color-accent);
	}

	.deviation {
		color: var(--color-warning, #e6a817);
	}

	.choice-toggle {
		font-size: var(--font-size-xs);
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		white-space: nowrap;
		transition: all var(--transition-fast);
	}

	.choice-toggle:hover {
		border-color: var(--color-accent);
	}

	.choice-toggle.use-new {
		background: rgba(141, 208, 196, 0.1);
		border-color: var(--color-accent);
		color: var(--color-accent);
	}
</style>
