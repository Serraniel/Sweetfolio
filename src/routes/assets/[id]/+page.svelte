<script lang="ts">
	import { page } from '$app/state';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import MetricsTable from '$lib/components/shared/MetricsTable.svelte';

	const assetId = $derived(page.params.id);

	// Placeholder -- will be populated from stores
	const asset = $derived({
		name: 'Asset',
		isin: null as string | null,
		wkn: null as string | null,
		currency: 'EUR',
		dataPoints: 0,
		dateRange: ''
	});
</script>

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
				<Button variant="default" size="sm">Edit</Button>
				<Button variant="danger" size="sm">Delete</Button>
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
					<span class="meta-value mono">{asset.dataPoints.toLocaleString()}</span>
				</div>
				<div class="meta-item">
					<span class="meta-label">Date Range</span>
					<span class="meta-value">{asset.dateRange || '\u2014'}</span>
				</div>
			</div>
		</Card>
	</section>

	<section class="asset-metrics">
		<h2>Financial Metrics</h2>
		<Card>
			<MetricsTable metrics={{}} />
		</Card>
	</section>

	<section class="asset-charts">
		<h2>Price History</h2>
		<Card padding="lg">
			<div class="chart-placeholder">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
				</svg>
				<p>Price chart will render here when data is available</p>
			</div>
		</Card>

		<h2>Drawdown</h2>
		<Card padding="lg">
			<div class="chart-placeholder">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
					<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
				</svg>
				<p>Drawdown chart will render here when data is available</p>
			</div>
		</Card>
	</section>
</div>

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
</style>
