<script lang="ts">
	import { page } from '$app/state';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import MetricsTable from '$lib/components/shared/MetricsTable.svelte';

	const portfolioId = $derived(page.params.id);

	// Placeholder
	const portfolio = $derived({
		name: 'Portfolio',
		allocations: [] as Array<{ assetName: string; weight: number }>,
		isBenchmark: false
	});
</script>

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
				<Button variant="default" size="sm">
					{portfolio.isBenchmark ? 'Remove Benchmark' : 'Set as Benchmark'}
				</Button>
				<Button variant="default" size="sm">Edit</Button>
				<Button variant="danger" size="sm">Delete</Button>
			</div>
		</div>
	</header>

	<section class="allocation-section">
		<h2>Allocation</h2>
		<Card>
			{#if portfolio.allocations.length === 0}
				<p class="muted">No allocations configured.</p>
			{:else}
				<div class="allocation-bars">
					{#each portfolio.allocations as alloc}
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
			<MetricsTable metrics={{}} />
		</Card>
	</section>

	<section class="charts-section">
		<h2>Performance</h2>
		<Card padding="lg">
			<div class="chart-placeholder">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
				</svg>
				<p>Performance chart will render here when data is available</p>
			</div>
		</Card>

		<h2>Correlation Matrix</h2>
		<Card padding="lg">
			<div class="chart-placeholder">
				<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="3" width="7" height="7"/>
					<rect x="14" y="3" width="7" height="7"/>
					<rect x="3" y="14" width="7" height="7"/>
					<rect x="14" y="14" width="7" height="7"/>
				</svg>
				<p>Correlation matrix will render here when data is available</p>
			</div>
		</Card>
	</section>
</div>

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
