<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import { assets } from '$lib/stores/assets';
	import { portfolios, addPortfolio, removePortfolio } from '$lib/stores/portfolios';

	let showCreateModal = $state(false);
	let newPortfolioName = $state('');
	let isBenchmark = $state(false);

	// Derive available assets with selection state from store
	let assetSelections: Array<{ id: string; name: string; weight: number; selected: boolean }> = $state([]);

	$effect(() => {
		assetSelections = $assets.map((a) => ({
			id: a.id,
			name: a.name,
			weight: Math.round(100 / Math.max($assets.length, 1)),
			selected: false
		}));
	});

	// Derive display list from store
	const portfolioList = $derived(
		$portfolios.map((p) => ({
			id: p.id,
			name: p.name,
			assetCount: p.allocations.length,
			isBenchmark: p.isBenchmark
		}))
	);

	async function handleCreate() {
		const selected = assetSelections.filter((a) => a.selected);
		if (selected.length === 0 || !newPortfolioName.trim()) return;

		// Normalize weights to sum to 1.0
		const totalWeight = selected.reduce((sum, a) => sum + a.weight, 0);
		const allocations = selected.map((a) => ({
			assetId: a.id,
			weight: totalWeight > 0 ? a.weight / totalWeight : 1 / selected.length
		}));

		const portfolio = {
			id: crypto.randomUUID(),
			name: newPortfolioName.trim(),
			allocations,
			isBenchmark,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await addPortfolio(portfolio);

		showCreateModal = false;
		newPortfolioName = '';
		isBenchmark = false;
	}

	function openCreateModal() {
		// Reset selections when opening
		assetSelections = $assets.map((a) => ({
			id: a.id,
			name: a.name,
			weight: Math.round(100 / Math.max($assets.length, 1)),
			selected: false
		}));
		newPortfolioName = '';
		isBenchmark = false;
		showCreateModal = true;
	}

	async function handleDelete(id: string) {
		if (!confirm('Delete this portfolio? This cannot be undone.')) return;
		await removePortfolio(id);
	}
</script>

<div class="portfolios-page">
	<header class="page-header">
		<div class="page-header-row">
			<div>
				<h1>Portfolios</h1>
				<p class="page-subtitle">Build and backtest portfolio allocations</p>
			</div>
			<Button variant="primary" onclick={openCreateModal}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="5" x2="12" y2="19"/>
					<line x1="5" y1="12" x2="19" y2="12"/>
				</svg>
				New Portfolio
			</Button>
		</div>
	</header>

	{#if portfolioList.length === 0}
		<Card padding="lg">
			<div class="empty-state">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
					<path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
				</svg>
				<h3>No portfolios yet</h3>
				<p>Create a portfolio by selecting assets and assigning weight allocations.</p>
				<Button variant="primary" onclick={openCreateModal}>Create Portfolio</Button>
			</div>
		</Card>
	{:else}
		<div class="portfolio-grid">
			{#each portfolioList as portfolio}
				<div class="portfolio-card-wrapper">
					<a href="/portfolios/{portfolio.id}" class="portfolio-link">
						<Card>
							<div class="portfolio-card">
								<div class="portfolio-card-header">
									<h3>{portfolio.name}</h3>
									{#if portfolio.isBenchmark}
										<span class="badge">Benchmark</span>
									{/if}
								</div>
								<p class="portfolio-meta">{portfolio.assetCount} asset{portfolio.assetCount !== 1 ? 's' : ''}</p>
							</div>
						</Card>
					</a>
					<button class="delete-btn" onclick={() => handleDelete(portfolio.id)} title="Delete portfolio">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="3 6 5 6 21 6"/>
							<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<Modal bind:open={showCreateModal} title="Create Portfolio">
		<div class="create-form">
			<div class="form-field">
				<label for="portfolio-name">Portfolio Name</label>
				<input
					id="portfolio-name"
					type="text"
					placeholder="e.g. My Growth Portfolio"
					bind:value={newPortfolioName}
				/>
			</div>

			<div class="form-field inline">
				<label>
					<input type="checkbox" bind:checked={isBenchmark} />
					Use as benchmark
				</label>
			</div>

			{#if assetSelections.length === 0}
				<div class="form-notice">
					<p>No assets available. Upload asset data first to create a portfolio.</p>
				</div>
			{:else}
				<div class="form-field">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label>Asset Allocation</label>
					<div class="allocation-list">
						{#each assetSelections as asset}
							<div class="allocation-item">
								<label class="allocation-checkbox">
									<input type="checkbox" bind:checked={asset.selected} />
									<span>{asset.name}</span>
								</label>
								{#if asset.selected}
									<div class="allocation-slider">
										<input
											type="range"
											min="0"
											max="100"
											step="1"
											bind:value={asset.weight}
										/>
										<span class="allocation-weight">{asset.weight}%</span>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#snippet footer()}
			<Button variant="ghost" onclick={() => showCreateModal = false}>Cancel</Button>
			<Button
				variant="primary"
				onclick={handleCreate}
				disabled={!newPortfolioName.trim() || assetSelections.filter((a) => a.selected).length === 0}
			>
				Create
			</Button>
		{/snippet}
	</Modal>
</div>

<style>
	.portfolios-page {
		max-width: 1100px;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		margin-bottom: var(--spacing-xs);
	}

	.page-header-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
	}

	.page-subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-base);
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
		font-size: var(--font-size-lg);
	}

	.empty-state p {
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-sm);
	}

	.portfolio-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--spacing-md);
	}

	.portfolio-card-wrapper {
		position: relative;
	}

	.portfolio-link {
		color: var(--color-text-primary);
	}

	.delete-btn {
		position: absolute;
		top: var(--spacing-sm);
		right: var(--spacing-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		background: transparent;
		opacity: 0;
		transition: opacity var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
	}

	.portfolio-card-wrapper:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: var(--color-negative);
		color: #fff;
	}

	.portfolio-card-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.portfolio-card-header h3 {
		font-size: var(--font-size-base);
	}

	.badge {
		font-size: var(--font-size-xs);
		padding: 2px 8px;
		background: rgba(141, 208, 196, 0.15);
		color: var(--color-accent);
		border-radius: 999px;
		font-weight: 500;
	}

	.portfolio-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	/* Create form */
	.create-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.form-field > label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.form-field.inline label {
		flex-direction: row;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		cursor: pointer;
	}

	.form-notice {
		padding: var(--spacing-md);
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.allocation-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.allocation-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.allocation-checkbox {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		cursor: pointer;
		font-size: var(--font-size-sm);
	}

	.allocation-slider {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding-left: var(--spacing-lg);
	}

	.allocation-slider input[type='range'] {
		flex: 1;
		padding: 0;
		border: none;
		background: transparent;
	}

	.allocation-weight {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		min-width: 40px;
		text-align: right;
	}
</style>
