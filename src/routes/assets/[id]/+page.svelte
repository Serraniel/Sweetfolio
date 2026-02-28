<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import MetricsTable from '$lib/components/shared/MetricsTable.svelte';
	import PriceChart from '$lib/charts/PriceChart.svelte';
	import DrawdownChart from '$lib/charts/DrawdownChart.svelte';
	import { assets, removeAsset } from '$lib/stores/assets';
	import { settings } from '$lib/stores/settings';
	import { calculateMetrics } from '$lib/workers/manager';
	import type { MetricsResult } from '$lib/types';

	const assetId = $derived(page.params.id);
	const asset = $derived($assets.find((a) => a.id === assetId));

	let metrics: MetricsResult | null = $state(null);
	let metricsLoading = $state(false);

	// Compute metrics when asset changes
	$effect(() => {
		if (!asset || asset.prices.length < 2) {
			metrics = null;
			return;
		}

		metricsLoading = true;
		const riskFreeRate = (($settings.riskFreeRate as number) ?? 0) / 100;
		calculateMetrics(asset.id, asset.prices, riskFreeRate)
			.then((result) => {
				metrics = result;
			})
			.finally(() => {
				metricsLoading = false;
			});
	});

	const dateRange = $derived(
		asset && asset.prices.length > 0
			? `${asset.prices[0].date} \u2013 ${asset.prices[asset.prices.length - 1].date}`
			: ''
	);

	async function handleDelete() {
		if (!asset) return;
		if (!confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;
		await removeAsset(asset.id);
		goto('/assets');
	}
</script>

{#if !asset}
	<div class="asset-detail">
		<Card padding="lg">
			<div class="empty-state">
				<h3>Asset not found</h3>
				<p>This asset may have been deleted.</p>
				<a href="/assets">Back to Assets</a>
			</div>
		</Card>
	</div>
{:else}
	<div class="asset-detail">
		<header class="page-header">
			<div class="page-header-row">
				<div>
					<a href="/assets" class="back-link">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="15 18 9 12 15 6"/>
						</svg>
						Assets
					</a>
					<h1>{asset.name}</h1>
				</div>
				<div class="header-actions">
					<Button variant="danger" size="sm" onclick={handleDelete}>Delete</Button>
				</div>
			</div>
		</header>

		<section class="asset-meta">
			<Card>
				<div class="meta-grid">
					<div class="meta-item">
						<span class="meta-label">ISIN</span>
						<span class="meta-value mono">{asset.isin ?? '\u2014'}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">WKN</span>
						<span class="meta-value mono">{asset.wkn ?? '\u2014'}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Currency</span>
						<span class="meta-value">{asset.currency}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Data Points</span>
						<span class="meta-value mono">{asset.prices.length.toLocaleString()}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Date Range</span>
						<span class="meta-value">{dateRange || '\u2014'}</span>
					</div>
				</div>
			</Card>
		</section>

		<section class="asset-metrics">
			<h2>Financial Metrics</h2>
			<Card>
				{#if metricsLoading}
					<p class="loading-text">Calculating metrics...</p>
				{:else}
					<MetricsTable metrics={metrics?.periods ?? {}} />
				{/if}
			</Card>
		</section>

		<section class="asset-charts">
			{#if asset.prices.length > 0}
				<h2>Price History</h2>
				<Card padding="lg">
					<PriceChart series={[{ label: asset.name, prices: asset.prices }]} />
				</Card>

				<h2>Drawdown</h2>
				<Card padding="lg">
					<DrawdownChart prices={asset.prices} />
				</Card>
			{:else}
				<Card padding="lg">
					<div class="chart-placeholder">
						<p>No price data available for charts.</p>
					</div>
				</Card>
			{/if}
		</section>
	</div>
{/if}

<style>
	.asset-detail {
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

	.page-header h1 {
		margin-bottom: 0;
	}

	.header-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	.asset-meta {
		margin-bottom: var(--spacing-xl);
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--spacing-lg);
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.meta-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.meta-value {
		font-size: var(--font-size-base);
		font-weight: 500;
	}

	.mono {
		font-family: var(--font-mono);
	}

	.asset-metrics {
		margin-bottom: var(--spacing-xl);
	}

	.asset-metrics h2,
	.asset-charts h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-md);
	}

	.asset-charts {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.chart-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		min-height: 300px;
		color: var(--color-text-muted);
		text-align: center;
		font-size: var(--font-size-sm);
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
