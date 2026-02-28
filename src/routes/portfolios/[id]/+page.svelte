<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import MetricsTable from '$lib/components/shared/MetricsTable.svelte';
	import PerformanceChart from '$lib/charts/PerformanceChart.svelte';
	import CorrelationMatrix from '$lib/charts/CorrelationMatrix.svelte';
	import { portfolios, updatePortfolio, removePortfolio } from '$lib/stores/portfolios';
	import { assets } from '$lib/stores/assets';
	import { settings } from '$lib/stores/settings';
	import { computePortfolioPrices } from '$lib/engine/portfolio';
	import { calculateMetrics, calculateCorrelation } from '$lib/workers/manager';
	import type { MetricsResult, CorrelationMatrix as CorrelationMatrixData } from '$lib/types';

	const portfolioId = $derived(page.params.id);
	const portfolio = $derived($portfolios.find((p) => p.id === portfolioId));

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
		await updatePortfolio({
			...portfolio,
			isBenchmark: !portfolio.isBenchmark,
			updatedAt: new Date().toISOString()
		});
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
						{#if portfolio.isBenchmark}
							<span class="badge">Benchmark</span>
						{/if}
					</div>
				</div>
				<div class="header-actions">
					<Button variant="default" size="sm" onclick={toggleBenchmark}>
						{portfolio.isBenchmark ? 'Remove Benchmark' : 'Set as Benchmark'}
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
			{#if chartSeries().length > 0}
				<h2>Performance</h2>
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
</style>
