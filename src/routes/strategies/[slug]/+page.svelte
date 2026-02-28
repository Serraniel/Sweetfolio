<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import StrategyTreeEditor from '$lib/components/strategy/StrategyTreeEditor.svelte';
	import SunburstChart from '$lib/charts/SunburstChart.svelte';
	import IcicleChart from '$lib/charts/IcicleChart.svelte';
	import GenerateSleevesDialog from '$lib/components/strategy/GenerateSleevesDialog.svelte';
	import { strategies, updateStrategy, removeStrategy } from '$lib/stores/strategies';
	import { assets } from '$lib/stores/assets';
	import { portfolios, addPortfolio } from '$lib/stores/portfolios';
	import { slugify } from '$lib/utils/slug';
	import { flattenStrategy, getLeafCount } from '$lib/engine/strategy';
	import type { Sleeve, SleeveMode } from '$lib/engine/sleeves';
	import type { Strategy, Portfolio } from '$lib/types';

	let chartMode: 'sunburst' | 'icicle' = $state('sunburst');

	const slug = $derived(page.params.slug ?? '');
	const strategy = $derived($strategies.find((s) => slugify(s.name) === slug));

	// Resolve generated portfolios
	const generatedPortfolios = $derived(
		strategy
			? strategy.generatedPortfolioIds
					.map((pid) => $portfolios.find((p) => p.id === pid))
					.filter((p): p is NonNullable<typeof p> => p != null)
			: []
	);

	// Build asset name map for charts
	const assetNames = $derived(
		Object.fromEntries($assets.map((a) => [a.id, a.name]))
	);

	// Flattened allocations for info display
	const flatAllocations = $derived(
		strategy ? flattenStrategy(strategy.root) : []
	);

	let showGenerateDialog = $state(false);

	let editingName = $state(false);
	let nameInput = $state('');

	function startEditName() {
		if (!strategy) return;
		nameInput = strategy.name;
		editingName = true;
	}

	async function saveName() {
		if (!strategy || !nameInput.trim()) return;
		const newName = nameInput.trim();
		await updateStrategy({ ...strategy, name: newName, updatedAt: new Date().toISOString() });
		editingName = false;
		const newSlug = slugify(newName);
		if (newSlug !== slug) {
			goto(`/strategies/${newSlug}`, { replaceState: true });
		}
	}

	async function handleSave(updated: Strategy) {
		await updateStrategy(updated);
	}

	async function handleDelete() {
		if (!strategy) return;
		if (!confirm(`Delete strategy "${strategy.name}"? Generated portfolios will be kept but unlinked.`)) return;
		await removeStrategy(strategy.id);
		goto('/strategies');
	}

	async function handleGenerateSleeves(sleeves: Sleeve[], mode: SleeveMode) {
		if (!strategy) return;
		const now = new Date().toISOString();
		const newIds: string[] = [];
		for (const sleeve of sleeves) {
			const portfolio: Portfolio = {
				id: crypto.randomUUID(),
				name: `${strategy.name} - ${sleeve.label}`,
				allocations: sleeve.allocations,
				isBenchmark: false,
				sourceStrategyId: strategy.id,
				createdAt: now,
				updatedAt: now,
			};
			await addPortfolio(portfolio);
			newIds.push(portfolio.id);
		}
		await updateStrategy({
			...strategy,
			generatedPortfolioIds: [...strategy.generatedPortfolioIds, ...newIds],
			updatedAt: now,
		});
	}

	function isOutOfSync(portfolioUpdatedAt: string): boolean {
		if (!strategy) return false;
		return strategy.updatedAt > portfolioUpdatedAt;
	}
</script>

<svelte:head>
	<title>{strategy ? `${strategy.name} – Sweetfolio` : 'Strategy not found – Sweetfolio'}</title>
</svelte:head>

{#if !strategy}
	<div class="strategy-detail">
		<Card padding="lg">
			<div class="empty-state">
				<h3>Strategy not found</h3>
				<p>This strategy may have been deleted.</p>
				<a href="/strategies">Back to Strategies</a>
			</div>
		</Card>
	</div>
{:else}
	<div class="strategy-detail">
		<header class="page-header">
			<div class="page-header-row">
				<div>
					<a href="/strategies" class="back-link">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="15 18 9 12 15 6" />
						</svg>
						Strategies
					</a>
					<div class="title-row">
						{#if editingName}
							<input
								class="name-edit-input"
								type="text"
								bind:value={nameInput}
								onkeydown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') editingName = false; }}
							/>
							<Button variant="primary" size="sm" onclick={saveName}>Save</Button>
							<Button variant="ghost" size="sm" onclick={() => (editingName = false)}>Cancel</Button>
						{:else}
							<h1>{strategy.name}</h1>
							<button class="edit-name-btn" onclick={startEditName} title="Edit name">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
									<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
								</svg>
							</button>
						{/if}
					</div>
				</div>
				<div class="header-actions">
					<Button variant="danger" size="sm" onclick={handleDelete}>Delete</Button>
				</div>
			</div>
		</header>

		<div class="two-column-layout">
			<section class="tree-panel">
				<h2>Allocation Tree</h2>
				<Card padding="md">
					<StrategyTreeEditor
						{strategy}
						assets={$assets}
						onsave={handleSave}
					/>
				</Card>

				{#if strategy.root.children.length > 0}
					<div class="generate-btn-row">
						<Button variant="default" onclick={() => (showGenerateDialog = true)}>Generate Portfolios</Button>
					</div>
				{/if}

				{#if flatAllocations.length > 0}
					<div class="flat-summary">
						<h3>Flattened Weights</h3>
						<div class="flat-list">
							{#each flatAllocations as alloc}
								<div class="flat-item">
									<span class="flat-name">{assetNames[alloc.assetId] ?? 'Unknown'}</span>
									<span class="flat-weight">{(alloc.weight * 100).toFixed(1)}%</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</section>

			<section class="chart-panel">
				<h2>Visualization</h2>
				<div class="chart-toggle">
					<button
						class="toggle-btn"
						class:active={chartMode === 'sunburst'}
						onclick={() => (chartMode = 'sunburst')}
					>Sunburst</button>
					<button
						class="toggle-btn"
						class:active={chartMode === 'icicle'}
						onclick={() => (chartMode = 'icicle')}
					>Icicle</button>
				</div>
				<Card padding="lg">
					{#if strategy.root.children.length === 0}
						<div class="chart-placeholder">
							<p>Add nodes to the tree to see the visualization.</p>
						</div>
					{:else if chartMode === 'sunburst'}
						<SunburstChart root={strategy.root} size={380} {assetNames} />
					{:else}
						<IcicleChart root={strategy.root} width={500} rowHeight={40} {assetNames} />
					{/if}
				</Card>

				{#if generatedPortfolios.length > 0}
					<h2>Generated Portfolios</h2>
					<Card padding="md">
						<div class="generated-list">
							{#each generatedPortfolios as portfolio}
								<a href="/portfolios/{slugify(portfolio.name)}" class="generated-item">
									<span class="generated-name">{portfolio.name}</span>
									{#if isOutOfSync(portfolio.updatedAt)}
										<span class="badge out-of-sync">Out of sync</span>
									{:else}
										<span class="badge synced">Synced</span>
									{/if}
								</a>
							{/each}
						</div>
					</Card>
				{/if}
			</section>
		</div>

		<GenerateSleevesDialog
			{strategy}
			{assetNames}
			bind:open={showGenerateDialog}
			ongenerate={handleGenerateSleeves}
		/>
	</div>
{/if}

<style>
	.strategy-detail {
		max-width: 1200px;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.back-link:hover {
		color: var(--color-accent);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.edit-name-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		background: none;
		border: none;
	}

	.edit-name-btn:hover {
		background: var(--color-border);
		color: var(--color-text-primary);
	}

	.name-edit-input {
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-text-primary);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.header-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	.two-column-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-xl);
		align-items: start;
	}

	@media (max-width: 900px) {
		.two-column-layout {
			grid-template-columns: 1fr;
		}
	}

	h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-md);
	}

	.chart-toggle {
		display: flex;
		gap: 2px;
		margin-bottom: var(--spacing-sm);
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-sm);
		padding: 2px;
		width: fit-content;
	}

	.toggle-btn {
		padding: var(--spacing-xs) var(--spacing-md);
		font-size: var(--font-size-xs);
		font-weight: 500;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		background: transparent;
		color: var(--color-text-muted);
		transition: all var(--transition-fast);
	}

	.toggle-btn.active {
		background: var(--color-bg-secondary);
		color: var(--color-accent);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.chart-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
		min-height: 300px;
	}

	.chart-placeholder p {
		margin-top: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.generate-btn-row {
		margin-top: var(--spacing-md);
		display: flex;
		justify-content: flex-end;
	}

	.flat-summary {
		margin-top: var(--spacing-lg);
	}

	.flat-summary h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-sm);
	}

	.flat-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.flat-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.flat-name {
		color: var(--color-text-secondary);
	}

	.flat-weight {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.generated-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.generated-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm);
		border-radius: var(--radius-sm);
		transition: background-color var(--transition-fast);
	}

	.generated-item:hover {
		background: var(--color-bg-tertiary);
	}

	.generated-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.badge {
		font-size: var(--font-size-xs);
		padding: 2px 8px;
		border-radius: 999px;
		font-weight: 500;
	}

	.badge.synced {
		background: rgba(141, 208, 196, 0.15);
		color: var(--color-accent);
	}

	.badge.out-of-sync {
		background: rgba(255, 183, 77, 0.15);
		color: #f0a030;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		text-align: center;
		padding: var(--spacing-xl) 0;
		color: var(--color-text-muted);
	}

	.empty-state h3 {
		color: var(--color-text-secondary);
	}
</style>
