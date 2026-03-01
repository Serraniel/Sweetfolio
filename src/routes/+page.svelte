<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import CorrelationMatrix from '$lib/charts/CorrelationMatrix.svelte';
	import { assets } from '$lib/stores/assets';
	import { portfolios } from '$lib/stores/portfolios';
	import { strategies } from '$lib/stores/strategies';
	import { calculateCorrelation } from '$lib/workers/manager';
	import type { CorrelationMatrix as CorrelationMatrixData } from '$lib/types';

	let correlation: CorrelationMatrixData | null = $state(null);
	let correlationLoading = $state(false);

	// Compute correlation when we have 2+ assets
	let correlationSeq = 0;
	$effect(() => {
		const assetData = $assets
			.filter((a) => a.prices.length >= 2)
			.map((a) => ({ id: a.id, prices: a.prices }));

		if (assetData.length < 2) {
			correlation = null;
			return;
		}

		correlationLoading = true;
		const seq = ++correlationSeq;
		calculateCorrelation(assetData)
			.then((result) => {
				if (seq === correlationSeq) {
					correlation = result;
					correlationLoading = false;
				}
			})
			.catch(() => {
				if (seq === correlationSeq) {
					correlationLoading = false;
				}
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
</script>

<svelte:head>
	<title>Dashboard – Sweetfolio</title>
</svelte:head>

<div class="dashboard">
	<header class="page-header">
		<h1>Dashboard</h1>
		<p class="page-subtitle">Overview of your portfolio data</p>
	</header>

	<div class="summary-cards">
		<Card variant="accent">
			<div class="summary-card">
				<div class="summary-icon assets-icon">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
					</svg>
				</div>
				<div class="summary-info">
					<span class="summary-value">{$assets.length}</span>
					<span class="summary-label">Assets</span>
				</div>
			</div>
		</Card>

		<Card variant="accent">
			<div class="summary-card">
				<div class="summary-icon strategies-icon">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="5" r="2"/>
						<line x1="12" y1="7" x2="12" y2="12"/>
						<line x1="12" y1="12" x2="6" y2="18"/>
						<line x1="12" y1="12" x2="18" y2="18"/>
						<circle cx="6" cy="19" r="1.5"/>
						<circle cx="18" cy="19" r="1.5"/>
					</svg>
				</div>
				<div class="summary-info">
					<span class="summary-value">{$strategies.length}</span>
					<span class="summary-label">Strategies</span>
				</div>
			</div>
		</Card>

		<Card variant="accent">
			<div class="summary-card">
				<div class="summary-icon portfolios-icon">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
					</svg>
				</div>
				<div class="summary-info">
					<span class="summary-value">{$portfolios.length}</span>
					<span class="summary-label">Portfolios</span>
				</div>
			</div>
		</Card>

	</div>

	<section class="quick-actions">
		<h2>Quick Actions</h2>
		<div class="action-grid">
			<a href="/assets" class="action-card">
				<Card>
					<div class="action-content">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
							<polyline points="17 8 12 3 7 8"/>
							<line x1="12" y1="3" x2="12" y2="15"/>
						</svg>
						<span>Upload Asset Data</span>
					</div>
				</Card>
			</a>

			<a href="/portfolios" class="action-card">
				<Card>
					<div class="action-content">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<line x1="12" y1="5" x2="12" y2="19"/>
							<line x1="5" y1="12" x2="19" y2="12"/>
						</svg>
						<span>Create Portfolio</span>
					</div>
				</Card>
			</a>

			<a href="/simulation" class="action-card">
				<Card>
					<div class="action-content">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M13 10V3L4 14h7v7l9-11h-7z"/>
						</svg>
						<span>Run Simulation</span>
					</div>
				</Card>
			</a>
		</div>
	</section>

	{#if correlation && correlationLabels.length > 0}
		<section class="correlation-section">
			<h2>Asset Correlations</h2>
			<Card padding="lg">
				<CorrelationMatrix data={correlation} labels={correlationLabels} />
			</Card>
		</section>
	{/if}

	<section class="getting-started">
		<Card padding="lg">
			<h2>Getting Started</h2>
			<p class="muted">
				Upload historical price data as CSV files to begin analyzing your portfolio.
				Sweetfolio processes all data locally in your browser -- nothing leaves your device.
			</p>
			<div class="steps">
				<div class="step">
					<span class="step-number">1</span>
					<div>
						<strong>Upload Assets</strong>
						<p class="muted">Import CSV files with historical price data for your securities.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-number">2</span>
					<div>
						<strong>Build Portfolios</strong>
						<p class="muted">Combine assets with custom weight allocations.</p>
					</div>
				</div>
				<div class="step">
					<span class="step-number">3</span>
					<div>
						<strong>Run Simulations</strong>
						<p class="muted">Use Monte Carlo simulations to explore the efficient frontier.</p>
					</div>
				</div>
			</div>
		</Card>
	</section>
</div>

<style>
	.dashboard {
		max-width: 1100px;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		margin-bottom: var(--spacing-xs);
	}

	.page-subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-base);
	}

	.summary-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-2xl);
	}

	.summary-card {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.summary-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-md);
		flex-shrink: 0;
	}

	.assets-icon {
		background: rgba(141, 208, 196, 0.15);
		color: var(--color-miku-teal);
	}

	.strategies-icon {
		background: rgba(83, 173, 163, 0.15);
		color: #53ada3;
	}

	.portfolios-icon {
		background: rgba(26, 138, 138, 0.15);
		color: var(--color-deep-teal);
	}

	.summary-info {
		display: flex;
		flex-direction: column;
	}

	.summary-value {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		line-height: 1.2;
	}

	.summary-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.quick-actions {
		margin-bottom: var(--spacing-2xl);
	}

	.quick-actions h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-md);
	}

	.action-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--spacing-md);
	}

	.action-card {
		color: var(--color-text-primary);
	}

	.action-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		text-align: center;
		color: var(--color-text-secondary);
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.action-card:hover .action-content {
		color: var(--color-accent);
	}

	.correlation-section {
		margin-bottom: var(--spacing-2xl);
	}

	.correlation-section h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-md);
	}

	.getting-started h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-sm);
	}

	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
		margin-top: var(--spacing-lg);
	}

	.step {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-md);
	}

	.step-number {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-deep-teal), var(--color-miku-teal));
		color: #fff;
		font-size: var(--font-size-sm);
		font-weight: 700;
		flex-shrink: 0;
	}

	.step strong {
		display: block;
		margin-bottom: var(--spacing-xs);
		font-size: var(--font-size-sm);
	}
</style>
