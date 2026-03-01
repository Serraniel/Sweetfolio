<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import type { SharePayload } from '$lib/sharing/codec';
	import { assets, addAsset } from '$lib/stores/assets';
	import { addPortfolio } from '$lib/stores/portfolios';
	import { addStrategy } from '$lib/stores/strategies';
	import { fetchByISIN } from '$lib/scraper/index';
	import type { Asset, AssetClassification, StrategyNode } from '$lib/types';

	let {
		open = $bindable(false),
		payload
	}: {
		open?: boolean;
		payload: SharePayload | null;
	} = $props();

	interface ResolvedItem {
		isin: string;
		weight?: number;
		existingAsset: Asset | null;
		status: 'ready' | 'fetching' | 'fetched' | 'error';
		fetchedName?: string;
		error?: string;
	}

	let items: ResolvedItem[] = $state([]);
	let importing = $state(false);
	let importDone = $state(false);
	let importError: string | null = $state(null);

	// Resolve items whenever payload changes
	$effect(() => {
		if (!payload) {
			items = [];
			importDone = false;
			importError = null;
			return;
		}

		if (payload.type === 'strategy') {
			// Strategies don't need ISIN resolution
			items = [];
			importDone = false;
			importError = null;
			return;
		}

		const isins =
			payload.type === 'portfolio'
				? payload.allocations.map((a) => a.isin)
				: payload.isins;

		items = isins.map((isin, i) => {
			const existing = $assets.find(
				(a) => a.isin?.toUpperCase() === isin.toUpperCase()
			);
			return {
				isin,
				weight: payload.type === 'portfolio' ? payload.allocations[i].weight : undefined,
				existingAsset: existing ?? null,
				status: existing ? 'ready' : ('ready' as const)
			};
		});

		importDone = false;
		importError = null;
	});

	const allReady = $derived(
		items.length > 0 && items.every((it) => it.status !== 'fetching')
	);

	const needsFetch = $derived(items.some((it) => !it.existingAsset && it.status !== 'fetched'));

	async function fetchMissing() {
		const toFetch = items.filter((it) => !it.existingAsset && it.status !== 'fetched');
		if (toFetch.length === 0) return;

		for (const item of toFetch) {
			item.status = 'fetching';
		}

		// Force reactivity
		items = [...items];

		for (const item of toFetch) {
			try {
				const outcome = await fetchByISIN(item.isin);
				if (outcome.success) {
					const now = new Date().toISOString();
					const asset: Asset = {
						id: crypto.randomUUID(),
						name: outcome.data.name ?? item.isin,
						isin: item.isin,
						wkn: null,
						currency: outcome.data.currency ?? 'EUR',
						classification: (outcome.data.classification as AssetClassification) ?? 'unknown',
						prices: outcome.data.prices,
						formatConfig: null,
						rawCSV: null,
						rawCSVStoredAt: null,
						createdAt: now,
						updatedAt: now,
						lastRefreshedAt: now
					};
					await addAsset(asset);
					item.existingAsset = asset;
					item.fetchedName = asset.name;
					item.status = 'fetched';
				} else {
					item.status = 'error';
					item.error = outcome.error.message;
				}
			} catch {
				item.status = 'error';
				item.error = 'Unexpected error fetching data';
			}
			items = [...items];
		}
	}

	function reIdTree(node: StrategyNode): StrategyNode {
		if (node.type === 'leaf') {
			return { ...node, id: crypto.randomUUID() };
		}
		return { ...node, id: crypto.randomUUID(), children: node.children.map(reIdTree) };
	}

	async function handleImport() {
		if (!payload) return;

		if (payload.type === 'strategy') {
			importing = true;
			importError = null;
			try {
				const now = new Date().toISOString();
				const newRoot = reIdTree(payload.root);
				if (newRoot.type !== 'group') throw new Error('Invalid strategy root');
				await addStrategy({
					id: crypto.randomUUID(),
					name: payload.name,
					root: newRoot,
					generatedPortfolioIds: [],
					createdAt: now,
					updatedAt: now,
				});
				importDone = true;
			} catch {
				importError = 'An error occurred importing the strategy.';
			} finally {
				importing = false;
			}
			return;
		}

		// Fetch missing assets first
		if (needsFetch) {
			await fetchMissing();
			// Check if all fetches succeeded
			if (items.some((it) => it.status === 'error')) {
				importError = 'Some assets could not be fetched. You can still import the ones that succeeded.';
			}
		}

		importing = true;
		importError = null;

		try {
			if (payload.type === 'portfolio') {
				// Build allocations from resolved assets
				const allocations: Array<{ assetId: string; weight: number }> = [];
				for (const item of items) {
					if (!item.existingAsset) continue;
					allocations.push({
						assetId: item.existingAsset.id,
						weight: item.weight ?? 1 / items.length
					});
				}

				if (allocations.length === 0) {
					importError = 'No assets could be resolved. Cannot create portfolio.';
					importing = false;
					return;
				}

				// Normalize weights
				const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0);
				const normalized = allocations.map((a) => ({
					...a,
					weight: totalWeight > 0 ? a.weight / totalWeight : 1 / allocations.length
				}));

				const now = new Date().toISOString();
				await addPortfolio({
					id: crypto.randomUUID(),
					name: payload.name,
					allocations: normalized,
					isBenchmark: false,
					sourceStrategyId: null,
					createdAt: now,
					updatedAt: now
				});
			}
			// For asset lists, assets were already added during fetchMissing

			importDone = true;
		} catch {
			importError = 'An error occurred during import.';
		} finally {
			importing = false;
		}
	}

	function handleClose() {
		open = false;
		items = [];
		importDone = false;
		importError = null;
	}
</script>

<Modal bind:open title={payload?.type === 'portfolio' ? 'Shared Portfolio' : payload?.type === 'strategy' ? 'Shared Strategy' : 'Shared Assets'}>
	{#if !payload}
		<p class="muted">Invalid share link.</p>
	{:else if importDone}
		<div class="success-state">
			<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
				<polyline points="22 4 12 14.01 9 11.01"/>
			</svg>
			{#if payload.type === 'portfolio'}
				<h4>Portfolio "{payload.name}" imported</h4>
				<p class="muted">The portfolio and its assets have been added to your library.</p>
			{:else if payload.type === 'strategy'}
				<h4>Strategy "{payload.name}" imported</h4>
				<p class="muted">The strategy has been added to your library.</p>
			{:else}
				<h4>Assets imported</h4>
				<p class="muted">{items.filter((it) => it.existingAsset).length} asset(s) added to your library.</p>
			{/if}
		</div>
	{:else}
		{#if payload.type === 'strategy'}
			<div class="share-info">
				<h4>{payload.name}</h4>
				<p class="muted">Someone shared a strategy with you. Import it to add it to your library.</p>
			</div>
		{:else if payload.type === 'portfolio'}
			<div class="share-info">
				<h4>{payload.name}</h4>
				<p class="muted">Someone shared a portfolio with you.</p>
			</div>
		{:else}
			<div class="share-info">
				<p class="muted">Someone shared {payload.isins.length} asset(s) with you.</p>
			</div>
		{/if}

		<div class="item-list">
			{#each items as item}
				<div class="item-row">
					<span class="item-isin">{item.isin}</span>
					{#if item.weight !== undefined}
						<span class="item-weight">{(item.weight * 100).toFixed(1)}%</span>
					{/if}
					<span class="item-status">
						{#if item.existingAsset}
							<span class="status-badge status-ready" title={item.existingAsset.name}>
								{item.fetchedName ? 'Fetched' : 'Loaded'}
							</span>
						{:else if item.status === 'fetching'}
							<span class="status-badge status-fetching">Fetching...</span>
						{:else if item.status === 'error'}
							<span class="status-badge status-error" title={item.error}>Failed</span>
						{:else}
							<span class="status-badge status-pending">Not loaded</span>
						{/if}
					</span>
				</div>
			{/each}
		</div>

		{#if importError}
			<div class="error-box">{importError}</div>
		{/if}
	{/if}

	{#snippet footer()}
		{#if importDone}
			<Button variant="primary" onclick={handleClose}>Done</Button>
		{:else}
			<Button variant="ghost" onclick={handleClose}>Cancel</Button>
			<Button
				variant="primary"
				onclick={handleImport}
				disabled={importing || items.length === 0}
			>
				{#if importing}
					Importing...
				{:else if needsFetch}
					Fetch & Import
				{:else}
					Import
				{/if}
			</Button>
		{/if}
	{/snippet}
</Modal>

<style>
	.share-info {
		margin-bottom: var(--spacing-md);
	}

	.share-info h4 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-bottom: var(--spacing-xs);
	}

	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.item-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.item-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
	}

	.item-isin {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		flex: 1;
	}

	.item-weight {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		min-width: 50px;
		text-align: right;
	}

	.status-badge {
		font-size: var(--font-size-xs);
		padding: 1px 6px;
		border-radius: var(--radius-sm);
		white-space: nowrap;
	}

	.status-ready {
		color: var(--color-accent);
		background: rgba(141, 208, 196, 0.1);
	}

	.status-fetching {
		color: var(--color-text-muted);
		background: var(--color-bg-tertiary);
	}

	.status-error {
		color: var(--color-negative, #e55);
		background: rgba(232, 23, 93, 0.08);
		cursor: help;
	}

	.status-pending {
		color: var(--color-text-muted);
	}

	.error-box {
		margin-top: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		background: rgba(232, 23, 93, 0.08);
		border: 1px solid rgba(232, 23, 93, 0.2);
		border-radius: var(--radius-sm);
		color: var(--color-negative, #e55);
		font-size: var(--font-size-sm);
	}

	.success-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		text-align: center;
		padding: var(--spacing-lg) 0;
	}

	.success-state svg {
		color: var(--color-accent);
	}

	.success-state h4 {
		font-size: var(--font-size-base);
		font-weight: 600;
	}
</style>
