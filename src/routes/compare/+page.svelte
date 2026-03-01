<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import PriceChart from '$lib/charts/PriceChart.svelte';
	import DrawdownChart from '$lib/charts/DrawdownChart.svelte';
	import { assets } from '$lib/stores/assets';
	import { settings } from '$lib/stores/settings';
	import { currencies } from '$lib/stores/currencies';
	import { calculateMetrics } from '$lib/workers/manager';
	import { getAssetColor } from '$lib/charts/utils';
	import {
		formatPercent,
		formatNumber,
		getMetricValue as getMetric,
		valueClass,
		bestInRow as findBestInRow
	} from '$lib/utils/comparison';
	import type { Asset, MetricsResult, PeriodKey, CurrencyRate } from '$lib/types';

	// Parse asset IDs from URL query params
	const compareIds = $derived.by(() => {
		const raw = page.url.searchParams.get('ids') ?? '';
		return raw.split(',').filter((id) => id.length > 0);
	});

	// Resolve to actual assets
	const compareAssets = $derived(
		compareIds
			.map((id) => $assets.find((a) => a.id === id))
			.filter((a): a is Asset => a !== undefined)
	);

	// Assets available to add (not already in comparison)
	const availableAssets = $derived(
		$assets.filter((a) => !compareIds.includes(a.id))
	);

	// Update URL when assets change
	function updateUrl(ids: string[]) {
		const params = new URLSearchParams();
		if (ids.length > 0) params.set('ids', ids.join(','));
		goto(`/compare?${params.toString()}`, { replaceState: true, keepFocus: true });
	}

	function removeFromComparison(assetId: string) {
		updateUrl(compareIds.filter((id) => id !== assetId));
	}

	let addAssetId = $state('');
	function addToComparison() {
		if (!addAssetId) return;
		updateUrl([...compareIds, addAssetId]);
		addAssetId = '';
	}

	// Build chart series for PriceChart
	const priceChartSeries = $derived(
		compareAssets.map((a) => ({
			label: a.name,
			prices: a.prices
		}))
	);

	// Metrics computation
	let metricsMap: Map<string, MetricsResult> = $state(new Map());
	let metricsLoading = $state(false);

	function findCurrencyConversion(assetCurrency: string, mainCurrency: string, rates: CurrencyRate[]) {
		if (assetCurrency === mainCurrency) return undefined;
		const directPair = assetCurrency + mainCurrency;
		const inversePair = mainCurrency + assetCurrency;
		const rate = rates.find((r) => r.pair === directPair || r.pair === inversePair);
		if (!rate) return undefined;
		return {
			currencyRate: rate,
			sourceCurrency: assetCurrency,
			targetCurrency: mainCurrency
		};
	}

	$effect(() => {
		const assetsToCompute = compareAssets.filter((a) => a.prices.length >= 2);
		if (assetsToCompute.length === 0) {
			metricsMap = new Map();
			return;
		}

		metricsLoading = true;
		const riskFreeRate = (($settings.riskFreeRate as number) ?? 0) / 100;
		const mainCurrency = ($settings.mainCurrency as string) ?? 'EUR';

		Promise.all(
			assetsToCompute.map((asset) => {
				const conversion = findCurrencyConversion(asset.currency, mainCurrency, $currencies);
				return calculateMetrics(asset.id, asset.prices, riskFreeRate, conversion);
			})
		)
			.then((results) => {
				const map = new Map<string, MetricsResult>();
				for (const r of results) {
					map.set(r.assetId, r);
				}
				metricsMap = map;
			})
			.finally(() => {
				metricsLoading = false;
			});
	});

	// Metrics table configuration
	const periods: PeriodKey[] = ['1y', '3y', '5y', '10y', '15y', 'all'];
	let selectedPeriod: PeriodKey = $state('all');

	const metricRows = [
		{ key: 'cumulativeReturn', label: 'Cumulative Return', format: formatPercent },
		{ key: 'annualizedReturn', label: 'Annualized Return', format: formatPercent },
		{ key: 'volatility', label: 'Volatility', format: formatPercent },
		{ key: 'sharpeRatio', label: 'Sharpe Ratio', format: formatNumber },
		{ key: 'maxDrawdown', label: 'Max Drawdown', format: formatPercent }
	];

	function getMetricValue(assetId: string, metricKey: string): number | undefined {
		return getMetric(metricsMap, assetId, selectedPeriod, metricKey);
	}

	function bestInRow(metricKey: string): string | null {
		return findBestInRow(
			compareAssets.map((a) => a.id),
			metricKey,
			metricsMap,
			selectedPeriod
		);
	}
</script>

<svelte:head>
	<title>Compare Assets – Sweetfolio</title>
</svelte:head>

<div class="compare-page">
	<header class="page-header">
		<div class="page-header-row">
			<div>
				<a href="/assets" class="back-link">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="15 18 9 12 15 6"/>
					</svg>
					Assets
				</a>
				<h1>Compare Assets</h1>
				<p class="page-subtitle">Side-by-side comparison of financial metrics and charts</p>
			</div>
		</div>
	</header>

	<!-- Asset selection controls -->
	<section class="selection-section">
		<Card>
			<div class="selection-header">
				<h3>Selected Assets ({compareAssets.length})</h3>
				{#if availableAssets.length > 0}
					<div class="add-asset-row">
						<select class="add-asset-select" bind:value={addAssetId}>
							<option value="">Add an asset...</option>
							{#each availableAssets as a}
								<option value={a.id}>{a.name}</option>
							{/each}
						</select>
						<Button variant="primary" size="sm" disabled={!addAssetId} onclick={addToComparison}>
							Add
						</Button>
					</div>
				{/if}
			</div>

			{#if compareAssets.length === 0}
				<p class="empty-hint">No assets selected. Go to <a href="/assets">Assets</a> to select assets for comparison.</p>
			{:else}
				<div class="selected-assets">
					{#each compareAssets as asset, i}
						<div class="asset-chip">
							<span class="chip-color" style="background: {getAssetColor(i)}"></span>
							<span class="chip-name">{asset.name}</span>
							<span class="chip-meta">{asset.currency}</span>
							<button
								class="chip-remove"
								onclick={() => removeFromComparison(asset.id)}
								aria-label="Remove {asset.name} from comparison"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</Card>
	</section>

	{#if compareAssets.length >= 2}
		<!-- Metrics comparison table -->
		<section class="metrics-section">
			<h2>Financial Metrics</h2>
			<Card>
				<div class="period-tabs">
					{#each periods as p}
						<button
							class="period-tab"
							class:active={selectedPeriod === p}
							onclick={() => (selectedPeriod = p)}
						>
							{p === 'all' ? 'ALL' : p.toUpperCase()}
						</button>
					{/each}
				</div>

				{#if metricsLoading}
					<p class="loading-text">Calculating metrics...</p>
				{:else}
					<div class="comparison-table-wrapper">
						<table class="comparison-table">
							<thead>
								<tr>
									<th class="metric-label-col">Metric</th>
									{#each compareAssets as asset, i}
										<th>
											<span class="th-asset">
												<span class="th-color" style="background: {getAssetColor(i)}"></span>
												{asset.name}
											</span>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each metricRows as row}
									{@const best = bestInRow(row.key)}
									<tr>
										<td class="metric-label">{row.label}</td>
										{#each compareAssets as asset}
											{@const val = getMetricValue(asset.id, row.key)}
											<td
												class="metric-value {valueClass(row.key, val)}"
												class:best-value={asset.id === best}
											>
												{row.format(val)}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</Card>
		</section>

		<!-- Price chart overlay -->
		<section class="chart-section">
			<h2>Price History</h2>
			<Card padding="lg">
				<PriceChart series={priceChartSeries} initialMode="relative" />
			</Card>
		</section>

		<!-- Individual drawdown charts -->
		<section class="chart-section">
			<h2>Drawdowns</h2>
			<div class="drawdown-grid">
				{#each compareAssets as asset, i}
					<Card padding="lg">
						<div class="drawdown-header">
							<span class="dd-color" style="background: {getAssetColor(i)}"></span>
							<span class="dd-name">{asset.name}</span>
						</div>
						<DrawdownChart prices={asset.prices} label={asset.name} height={220} />
					</Card>
				{/each}
			</div>
		</section>

		<!-- Asset metadata comparison -->
		<section class="meta-section">
			<h2>Asset Details</h2>
			<Card>
				<div class="comparison-table-wrapper">
					<table class="comparison-table">
						<thead>
							<tr>
								<th class="metric-label-col">Detail</th>
								{#each compareAssets as asset, i}
									<th>
										<span class="th-asset">
											<span class="th-color" style="background: {getAssetColor(i)}"></span>
											{asset.name}
										</span>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="metric-label">Classification</td>
								{#each compareAssets as asset}
									<td class="metric-value">{asset.classification.toUpperCase()}</td>
								{/each}
							</tr>
							<tr>
								<td class="metric-label">Currency</td>
								{#each compareAssets as asset}
									<td class="metric-value">{asset.currency}</td>
								{/each}
							</tr>
							<tr>
								<td class="metric-label">ISIN</td>
								{#each compareAssets as asset}
									<td class="metric-value mono">{asset.isin ?? '\u2014'}</td>
								{/each}
							</tr>
							<tr>
								<td class="metric-label">WKN</td>
								{#each compareAssets as asset}
									<td class="metric-value mono">{asset.wkn ?? '\u2014'}</td>
								{/each}
							</tr>
							<tr>
								<td class="metric-label">Data Points</td>
								{#each compareAssets as asset}
									<td class="metric-value mono">{asset.prices.length.toLocaleString()}</td>
								{/each}
							</tr>
							<tr>
								<td class="metric-label">Date Range</td>
								{#each compareAssets as asset}
									<td class="metric-value">
										{#if asset.prices.length > 0}
											{asset.prices[0].date} – {asset.prices[asset.prices.length - 1].date}
										{:else}
											—
										{/if}
									</td>
								{/each}
							</tr>
						</tbody>
					</table>
				</div>
			</Card>
		</section>
	{:else if compareAssets.length === 1}
		<Card padding="lg">
			<div class="empty-state">
				<p>Add at least one more asset to start comparing.</p>
			</div>
		</Card>
	{/if}
</div>

<style>
	.compare-page {
		max-width: 1200px;
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

	/* Selection section */
	.selection-section {
		margin-bottom: var(--spacing-xl);
	}

	.selection-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-md);
		flex-wrap: wrap;
	}

	.selection-header h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0;
	}

	.add-asset-row {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
	}

	.add-asset-select {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		min-width: 200px;
	}

	.add-asset-select:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.empty-hint {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.empty-hint a {
		color: var(--color-accent);
	}

	.selected-assets {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
	}

	.asset-chip {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
	}

	.chip-color {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.chip-name {
		font-weight: 500;
	}

	.chip-meta {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.chip-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color var(--transition-fast), background var(--transition-fast);
		background: transparent;
		border: none;
		padding: 0;
	}

	.chip-remove:hover {
		color: var(--color-negative);
		background: rgba(232, 23, 93, 0.1);
	}

	/* Period tabs */
	.period-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: var(--spacing-md);
		flex-wrap: wrap;
	}

	.period-tab {
		padding: 4px 12px;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: transparent;
		color: var(--color-text-primary);
		cursor: pointer;
		font-size: 12px;
		font-family: system-ui, -apple-system, sans-serif;
		transition: background 0.15s, color 0.15s;
	}

	.period-tab:hover {
		background: var(--color-accent, #8dd0c4);
		color: var(--color-bg-primary, #fff);
	}

	.period-tab.active {
		background: var(--color-accent-deep, #1a8a8a);
		color: #fff;
		border-color: var(--color-accent-deep, #1a8a8a);
	}

	/* Comparison table */
	.comparison-table-wrapper {
		overflow-x: auto;
	}

	.comparison-table {
		font-size: var(--font-size-sm);
		white-space: nowrap;
	}

	.comparison-table th {
		font-weight: 600;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.comparison-table td {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.metric-label-col {
		text-align: left;
	}

	.metric-label {
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.metric-value {
		text-align: right;
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
	}

	.metric-value.positive {
		color: var(--color-positive);
	}

	.metric-value.negative {
		color: var(--color-negative);
	}

	.metric-value.best-value {
		font-weight: 700;
		background: rgba(141, 208, 196, 0.1);
	}

	.th-asset {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.th-color {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
	}

	/* Sections */
	.metrics-section {
		margin-bottom: var(--spacing-xl);
	}

	.metrics-section h2,
	.chart-section h2,
	.meta-section h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-md);
	}

	.chart-section {
		margin-bottom: var(--spacing-xl);
	}

	.meta-section {
		margin-bottom: var(--spacing-xl);
	}

	/* Drawdown grid */
	.drawdown-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: var(--spacing-md);
	}

	.drawdown-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.dd-color {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dd-name {
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.loading-text {
		padding: var(--spacing-md);
		color: var(--color-text-muted);
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
</style>
