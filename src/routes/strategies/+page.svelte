<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import { strategies, addStrategy, removeStrategy } from '$lib/stores/strategies';
	import { getLeafCount, getMaxDepth } from '$lib/engine/strategy';
	import { slugify } from '$lib/utils/slug';
	import { goto } from '$app/navigation';

	let showCreateModal = $state(false);
	let newStrategyName = $state('');

	const strategyList = $derived(
		$strategies.map((s) => ({
			id: s.id,
			name: s.name,
			leafCount: getLeafCount(s.root),
			maxDepth: getMaxDepth(s.root),
			portfolioCount: s.generatedPortfolioIds.length
		}))
	);

	async function handleCreate() {
		const name = newStrategyName.trim();
		if (!name) return;

		const strategy = {
			id: crypto.randomUUID(),
			name,
			root: {
				type: 'group' as const,
				id: crypto.randomUUID(),
				label: name,
				weight: 1,
				children: []
			},
			generatedPortfolioIds: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await addStrategy(strategy);
		showCreateModal = false;
		newStrategyName = '';
		goto(`/strategies/${slugify(name)}`);
	}

	function openCreateModal() {
		newStrategyName = '';
		showCreateModal = true;
	}

	async function handleDelete(id: string) {
		await removeStrategy(id);
	}
</script>

<svelte:head>
	<title>Strategies – Sweetfolio</title>
</svelte:head>

<div class="strategies-page">
	<header class="page-header">
		<div class="page-header-row">
			<div>
				<h1>Strategies</h1>
				<p class="page-subtitle">Design allocation strategies with nested asset groups</p>
			</div>
			<Button variant="primary" onclick={openCreateModal}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" y1="5" x2="12" y2="19"/>
					<line x1="5" y1="12" x2="19" y2="12"/>
				</svg>
				New Strategy
			</Button>
		</div>
	</header>

	{#if strategyList.length === 0}
		<Card padding="lg">
			<div class="empty-state">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="5" r="2"/>
					<line x1="12" y1="7" x2="12" y2="12"/>
					<line x1="12" y1="12" x2="6" y2="18"/>
					<line x1="12" y1="12" x2="18" y2="18"/>
					<circle cx="6" cy="19" r="1.5"/>
					<circle cx="18" cy="19" r="1.5"/>
				</svg>
				<h3>No strategies yet</h3>
				<p>Create a strategy to define nested allocation structures for generating portfolios.</p>
				<Button variant="primary" onclick={openCreateModal}>Create Strategy</Button>
			</div>
		</Card>
	{:else}
		<div class="strategy-grid">
			{#each strategyList as strategy}
				<div class="strategy-card-wrapper">
					<a href="/strategies/{slugify(strategy.name)}" class="strategy-link">
						<Card>
							<div class="strategy-card">
								<div class="strategy-card-header">
									<h3>{strategy.name}</h3>
								</div>
								<div class="strategy-meta">
									<span>{strategy.leafCount} asset{strategy.leafCount !== 1 ? 's' : ''}</span>
									<span class="meta-separator">&middot;</span>
									<span>{strategy.maxDepth} level{strategy.maxDepth !== 1 ? 's' : ''}</span>
									<span class="meta-separator">&middot;</span>
									<span>{strategy.portfolioCount} portfolio{strategy.portfolioCount !== 1 ? 's' : ''}</span>
								</div>
							</div>
						</Card>
					</a>
					<button class="delete-btn" onclick={() => handleDelete(strategy.id)} title="Delete strategy">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="3 6 5 6 21 6"/>
							<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<Modal bind:open={showCreateModal} title="Create Strategy">
		<div class="create-form">
			<div class="form-field">
				<label for="strategy-name">Strategy Name</label>
				<input
					id="strategy-name"
					type="text"
					placeholder="e.g. Global Growth Strategy"
					bind:value={newStrategyName}
				/>
			</div>
		</div>

		{#snippet footer()}
			<Button variant="ghost" onclick={() => showCreateModal = false}>Cancel</Button>
			<Button
				variant="primary"
				onclick={handleCreate}
				disabled={!newStrategyName.trim()}
			>
				Create
			</Button>
		{/snippet}
	</Modal>
</div>

<style>
	.strategies-page {
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

	.strategy-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--spacing-md);
	}

	.strategy-card-wrapper {
		position: relative;
	}

	.strategy-link {
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

	.strategy-card-wrapper:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: var(--color-negative);
		color: #fff;
	}

	.strategy-card-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.strategy-card-header h3 {
		font-size: var(--font-size-base);
	}

	.strategy-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.meta-separator {
		color: var(--color-text-muted);
		opacity: 0.5;
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
</style>
