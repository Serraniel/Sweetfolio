<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import MetricsTable from '$lib/components/shared/MetricsTable.svelte';
	import AllocationChart from '$lib/charts/AllocationChart.svelte';
	import PerformanceChart from '$lib/charts/PerformanceChart.svelte';
	import CorrelationMatrix from '$lib/charts/CorrelationMatrix.svelte';
	import PriceChart from '$lib/charts/PriceChart.svelte';
	import DrawdownChart from '$lib/charts/DrawdownChart.svelte';
	import { portfolios, updatePortfolio, removePortfolio } from '$lib/stores/portfolios';
	import { assets } from '$lib/stores/assets';
	import { settings } from '$lib/stores/settings';
	import { benchmarkRef, benchmark as resolvedBenchmark, setBenchmark } from '$lib/stores/benchmark';
	import { computePortfolioPrices } from '$lib/engine/portfolio';
	import { calculateMetrics, calculateCorrelation } from '$lib/workers/manager';
	import type { MetricsResult, CorrelationMatrix as CorrelationMatrixData } from '$lib/types';

	const portfolioId = $derived(page.params.id ?? '');
	const portfolio = $derived($portfolios.find((p) => p.id === portfolioId));
	const isCurrentBenchmark = $derived(
		$benchmarkRef !== null && $benchmarkRef.type === 'portfolio' && $benchmarkRef.id === portfolioId
	);

	// Edit modal state
	let showEditModal = $state(false);
	let editName = $state('');
	let editAllocations: Array<{ id: string; name: string; weight: number; selected: boolean }> = $state([]);

	function openEditModal() {
		if (!portfolio) return;
		editName = portfolio.name;
		editAllocations = $assets.map((a) => {
			const alloc = portfolio.allocations.find((al) => al.assetId === a.id);
			return {
				id: a.id,
				name: a.name,
				weight: alloc ? Math.round(alloc.weight * 100) : 0,
				selected: !!alloc
			};
		});
		showEditModal = true;
	}

	async function handleEditSave() {
		if (!portfolio) return;
		const selected = editAllocations.filter((a) => a.selected);
		if (selected.length === 0 || !editName.trim()) return;

		const totalWeight = selected.reduce((sum, a) => sum + a.weight, 0);
		const allocations = selected.map((a) => ({
			assetId: a.id,
			weight: totalWeight > 0 ? a.weight / totalWeight : 1 / selected.length
		}));

		await updatePortfolio({
			...portfolio,
			name: editName.trim(),
			allocations,
			updatedAt: new Date().toISOString()
		});
		showEditModal = false;
	}

	// Resolve allocation asset names
	const resolvedAllocations = $derived(
		portfolio
			? portfolio.allocations.map((alloc) => {
					const asset = $assets.find((a) => a.id === alloc.assetId);
					return {
						assetId: alloc.assetId,
						assetName: asset?.name ?? 'Unknown',
						weight: alloc.weight
					};
				})
			: []
	);

	// Build portfolio prices
	const portfolioPrices = $derived(() => {
		if (!portfolio) return [];
		const assetData = portfolio.allocations
			.map((alloc) => {
				const asset = $assets.find((a) => a.id === alloc.assetId);
				if (!asset) return null;
				return { id: asset.id, prices: asset.prices, weight: alloc.weight };
			})
			.filter((a): a is NonNullable<typeof a> => a !== null);
		if (assetData.length === 0) return [];
		return computePortfolioPrices(assetData);
	});

	let metrics: MetricsResult | null = $state(null);
	let metricsLoading = $state(false);
	let correlation: CorrelationMatrixData | null = $state(null);

	// Compute metrics when portfolio changes
	$effect(() => {
		const prices = portfolioPrices();
		if (!portfolio || prices.length < 2) {
			metrics = null;
			return;
		}

		metricsLoading = true;
		const riskFreeRate = (($settings.riskFreeRate as number) ?? 0) / 100;
		calculateMetrics(portfolio.id, prices, riskFreeRate)
			.then((result) => {
				metrics = result;
			})
			.finally(() => {
				metricsLoading = false;
			});
	});

	// Compute correlation matrix
	$effect(() => {
		if (!portfolio || portfolio.allocations.length < 2) {
			correlation = null;
			return;
		}

		const assetData = portfolio.allocations
			.map((alloc) => {
				const asset = $assets.find((a) => a.id === alloc.assetId);
				if (!asset || asset.prices.length < 2) return null;
				return { id: asset.id, prices: asset.prices };
			})
			.filter((a): a is NonNullable<typeof a> => a !== null);

		if (assetData.length < 2) return;

		calculateCorrelation(assetData).then((result) => {
			correlation = result;
		});
	});

	function getCorrelationLabels(): string[] {
		if (!correlation) return [];
		const corr = correlation as CorrelationMatrixData;
		return corr.assetIds.map((id: string) => {
			const asset = $assets.find((a) => a.id === id);
			return asset?.name ?? id.slice(0, 8);
		});
	}

	const correlationLabels = $derived(getCorrelationLabels());

	// Build series for PerformanceChart
	const chartSeries = $derived(() => {
		if (!portfolio) return [];
		return portfolio.allocations
			.map((alloc) => {
				const asset = $assets.find((a) => a.id === alloc.assetId);
				if (!asset) return null;
				return { label: asset.name, prices: asset.prices };
			})
			.filter((s): s is NonNullable<typeof s> => s !== null);
	});

	async function toggleBenchmark() {
		if (!portfolio) return;
		if (isCurrentBenchmark) {
			await setBenchmark(null);
		} else {
			await setBenchmark({ type: 'portfolio', id: portfolioId });
		}
	}

	async function handleDelete() {
		if (!portfolio) return;
		if (!confirm(`Delete "${portfolio.name}"? This cannot be undone.`)) return;
		await removePortfolio(portfolio.id);
		goto('/portfolios');
	}
</script>

{#if !portfolio}
	<div class="portfolio-detail">
		<Card padding="lg">
			<div class="empty-state">
				<h3>Portfolio not found</h3>
				<p>This portfolio may have been deleted.</p>
				<a href="/portfolios">Back to Portfolios</a>
			</div>
		</Card>
	</div>
{:else}
	<div class="portfolio-detail">
		<header class="page-header">
			<div class="page-header-row">
				<div>
					<a href="/portfolios" class="back-link">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="15 18 9 12 15 6"/>
						</svg>
						Portfolios
					</a>
					<div class="title-row">
						<h1>{portfolio.name}</h1>
						{#if isCurrentBenchmark}
							<span class="badge">Benchmark</span>
						{/if}
					</div>
				</div>
				<div class="header-actions">
					<Button variant="default" size="sm" onclick={openEditModal}>Edit</Button>
					<Button variant={isCurrentBenchmark ? 'primary' : 'default'} size="sm" onclick={toggleBenchmark}>
						{isCurrentBenchmark ? 'Remove Benchmark' : 'Set as Benchmark'}
					</Button>
					<Button variant="danger" size="sm" onclick={handleDelete}>Delete</Button>
				</div>
			</div>
		</header>

		<section class="allocation-section">
			<h2>Allocation</h2>
			<Card>
				{#if resolvedAllocations.length === 0}
					<p class="muted">No allocations configured.</p>
				{:else}
					<div class="allocation-layout">
						<div class="allocation-bars">
							{#each resolvedAllocations as alloc}
								<div class="alloc-row">
									<span class="alloc-name">{alloc.assetName}</span>
									<div class="alloc-bar-track">
										<div class="alloc-bar" style="width: {alloc.weight * 100}%"></div>
									</div>
									<span class="alloc-weight">{(alloc.weight * 100).toFixed(1)}%</span>
								</div>
							{/each}
						</div>
						<div class="allocation-chart-container">
							<AllocationChart allocations={resolvedAllocations.map(a => ({ label: a.assetName, weight: a.weight }))} size={180} />
						</div>
					</div>
				{/if}
			</Card>
		</section>

		<section class="metrics-section">
			<h2>Financial Metrics</h2>
			<Card>
				{#if metricsLoading}
					<p class="loading-text">Calculating metrics...</p>
				{:else}
					<MetricsTable metrics={metrics?.periods ?? {}} />
				{/if}
			</Card>
		</section>

		<section class="charts-section">
			{#if portfolioPrices().length > 0}
				<h2>Portfolio Value</h2>
				<Card padding="lg">
					<PriceChart series={[{ label: portfolio.name, prices: portfolioPrices() }]} />
				</Card>

				<h2>Drawdown</h2>
				<Card padding="lg">
					<DrawdownChart prices={portfolioPrices()} />
				</Card>
			{/if}

			{#if chartSeries().length > 0}
				<h2>Performance Comparison</h2>
				<Card padding="lg">
					<PerformanceChart series={chartSeries()} />
				</Card>
			{/if}

			{#if correlation && correlationLabels.length > 0}
				<h2>Correlation Matrix</h2>
				<Card padding="lg">
					<CorrelationMatrix data={correlation} labels={correlationLabels} />
				</Card>
			{/if}
		</section>

		<Modal bind:open={showEditModal} title="Edit Portfolio">
			<div class="edit-form">
				<div class="form-field">
					<label for="edit-portfolio-name">Portfolio Name</label>
					<input id="edit-portfolio-name" type="text" bind:value={editName} />
				</div>

				{#if editAllocations.length === 0}
					<div class="form-notice">
						<p>No assets available.</p>
					</div>
				{:else}
					<div class="form-field">
						<!-- svelte-ignore a11y_label_has_associated_control -->
						<label>Asset Allocation</label>
						<div class="edit-allocation-list">
							{#each editAllocations as asset}
								<div class="edit-allocation-item">
									<label class="allocation-checkbox">
										<input type="checkbox" bind:checked={asset.selected} />
										<span>{asset.name}</span>
									</label>
									{#if asset.selected}
										<div class="edit-allocation-slider">
											<input
												type="range"
												min="0"
												max="100"
												step="1"
												bind:value={asset.weight}
											/>
											<span class="edit-allocation-weight">{asset.weight}%</span>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
			{#snippet footer()}
				<Button variant="ghost" onclick={() => showEditModal = false}>Cancel</Button>
				<Button
					variant="primary"
					onclick={handleEditSave}
					disabled={!editName.trim() || editAllocations.filter((a) => a.selected).length === 0}
				>
					Save
				</Button>
			{/snippet}
		</Modal>
	</div>
{/if}

<style>
	.portfolio-detail {
		max-width: 1100px;
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
		gap: var(--spacing-md);
	}

	.badge {
		font-size: var(--font-size-xs);
		padding: 2px 8px;
		background: rgba(141, 208, 196, 0.15);
		color: var(--color-accent);
		border-radius: 999px;
		font-weight: 500;
	}

	.header-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	section {
		margin-bottom: var(--spacing-xl);
	}

	h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-md);
	}

	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.allocation-bars {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.alloc-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.alloc-name {
		width: 140px;
		font-size: var(--font-size-sm);
		font-weight: 500;
		flex-shrink: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.alloc-bar-track {
		flex: 1;
		height: 8px;
		background: var(--color-bg-tertiary);
		border-radius: 4px;
		overflow: hidden;
	}

	.alloc-bar {
		height: 100%;
		background: linear-gradient(90deg, var(--color-deep-teal), var(--color-miku-teal));
		border-radius: 4px;
		transition: width var(--transition-base);
	}

	.alloc-weight {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		min-width: 50px;
		text-align: right;
		color: var(--color-text-muted);
	}

	.charts-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
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

	.loading-text {
		padding: var(--spacing-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.allocation-layout {
		display: flex;
		gap: var(--spacing-xl);
		align-items: center;
	}

	.allocation-chart-container {
		flex-shrink: 0;
	}

	@media (max-width: 700px) {
		.allocation-layout {
			flex-direction: column;
		}
	}

	.edit-form {
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

	.edit-allocation-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.edit-allocation-item {
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

	.edit-allocation-slider {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding-left: var(--spacing-lg);
	}

	.edit-allocation-slider input[type='range'] {
		flex: 1;
		padding: 0;
		border: none;
		background: transparent;
	}

	.edit-allocation-weight {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		min-width: 40px;
		text-align: right;
	}
</style>
