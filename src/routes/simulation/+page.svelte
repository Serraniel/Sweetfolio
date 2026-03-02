<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import EfficientFrontier from '$lib/charts/EfficientFrontier.svelte';
	import { assets } from '$lib/stores/assets';
	import { settings } from '$lib/stores/settings';
	import { currencies } from '$lib/stores/currencies';
	import { addPortfolio } from '$lib/stores/portfolios';
	import { benchmark as benchmarkStore } from '$lib/stores/benchmark';
	import { simulation, updateConfig, setProgress, setResult, setRunning, saveSimulation } from '$lib/stores/simulation';
	import { createMonteCarloWorker } from '$lib/workers/manager';
	import { annualizedLogReturn } from '$lib/engine/returns';
	import { annualizedVolatility } from '$lib/engine/volatility';
	import { convertPrices } from '$lib/engine/currency';
	import { generateAssetColors } from '$lib/charts/utils';
	import type { AssetMarker } from '$lib/charts/EfficientFrontier.svelte';
	import type { MonteCarloWorkerRequest, MonteCarloWorkerResponse, SimulatedPortfolio, CurrencyRate, PricePoint } from '$lib/types';
	import { slugify } from '$lib/utils/slug';

	let simulationCount = $state(10000);
	let worker: Worker | null = $state(null);
	let selectedPortfolio: SimulatedPortfolio | null = $state(null);
	let savedPortfolioSlug: string | null = $state(null);
	let rendering = $state(false);
	let hoveredAssetName: string | null = $state(null);

	// Derive available assets with selection state
	let assetSelections: Array<{ id: string; name: string; selected: boolean }> = $state([]);

	$effect(() => {
		assetSelections = $assets.map((a) => ({
			id: a.id,
			name: a.name,
			selected: false
		}));
	});

	const mainCurrency = $derived(($settings.mainCurrency as string) ?? 'EUR');

	// Find currency conversion data for an asset
	function findCurrencyConversion(assetCurrency: string, targetCurrency: string, rates: CurrencyRate[]) {
		if (assetCurrency === targetCurrency) return undefined;
		const directPair = assetCurrency + targetCurrency;
		const inversePair = targetCurrency + assetCurrency;
		const rate = rates.find((r) => r.pair === directPair || r.pair === inversePair);
		if (!rate) return undefined;
		return { currencyRate: rate, sourceCurrency: assetCurrency, targetCurrency };
	}

	// Convert asset prices to main currency, returns null if conversion fails
	function convertAssetPrices(assetCurrency: string, prices: PricePoint[]): PricePoint[] | null {
		if (assetCurrency === mainCurrency) return prices;
		const conversion = findCurrencyConversion(assetCurrency, mainCurrency, $currencies);
		if (!conversion) return null;
		return convertPrices(prices, conversion.currencyRate, conversion.sourceCurrency, conversion.targetCurrency);
	}

	// Track which assets have currency conversion issues (independent of selection)
	const assetConversionWarnings = $derived.by((): Set<string> => {
		const warnings = new Set<string>();
		for (const sel of assetSelections) {
			const asset = $assets.find((a) => a.id === sel.id);
			if (!asset || asset.prices.length < 2) continue;
			if (asset.currency !== mainCurrency) {
				const converted = convertAssetPrices(asset.currency, asset.prices);
				if (!converted || converted.length < 2) warnings.add(sel.id);
			}
		}
		return warnings;
	});

	const assetColors = $derived(generateAssetColors(assetSelections.length));
	const isRunning = $derived($simulation.running);
	const progress = $derived(
		$simulation.progress
			? ($simulation.progress.completed / $simulation.progress.total) * 100
			: 0
	);
	const result = $derived($simulation.result);
	const selectedAssets = $derived(assetSelections.filter((a) => a.selected));

	// Compute benchmark as a SimulatedPortfolio for the scatter chart
	// Use log-return-based metrics to match the MC worker's methodology
	const benchmarkPortfolio = $derived.by((): SimulatedPortfolio | null => {
		const bm = $benchmarkStore;
		if (!bm || bm.prices.length < 2) return null;
		// Convert benchmark prices to main currency if needed
		const bmAsset = $assets.find((a) => a.id === bm.ref.id);
		let prices = bm.prices;
		if (bmAsset && bmAsset.currency !== mainCurrency) {
			const converted = convertAssetPrices(bmAsset.currency, bm.prices);
			if (converted && converted.length >= 2) prices = converted;
		}
		const riskFreeRate = (($settings.riskFreeRate as number) ?? 0) / 100;
		const ret = annualizedLogReturn(prices);
		const vol = annualizedVolatility(prices);
		const sharpe = vol > 0 ? (ret - riskFreeRate) / vol : 0;
		return {
			weights: {},
			annualizedReturn: ret,
			volatility: vol,
			sharpeRatio: sharpe
		};
	});

	// Compute per-asset markers using the same log-return-based metrics as the MC worker.
	// Colors match the sidebar dots by using each asset's index in the full assetSelections list.
	// Prices are converted to main currency for consistent comparison.
	const assetMarkerList = $derived.by((): AssetMarker[] => {
		if (!result) return [];
		const markers: AssetMarker[] = [];
		for (let i = 0; i < assetSelections.length; i++) {
			const sel = assetSelections[i];
			if (!sel.selected) continue;
			const asset = $assets.find((a) => a.id === sel.id);
			if (!asset || asset.prices.length < 2) continue;
			const prices = convertAssetPrices(asset.currency, asset.prices) ?? asset.prices;
			if (prices.length < 2) continue;
			markers.push({
				name: asset.name,
				annualizedReturn: annualizedLogReturn(prices),
				volatility: annualizedVolatility(prices),
				color: assetColors[i],
			});
		}
		return markers;
	});

	function handleRun() {
		if (selectedAssets.length < 2) return;

		const assetData = selectedAssets
			.map((sel) => {
				const asset = $assets.find((a) => a.id === sel.id);
				if (!asset) return null;
				// Convert prices to main currency for consistent simulation
				const prices = convertAssetPrices(asset.currency, asset.prices) ?? asset.prices;
				return { id: asset.id, prices };
			})
			.filter((a): a is NonNullable<typeof a> => a !== null);

		if (assetData.length < 2) return;

		const riskFreeRate = (($settings.riskFreeRate as number) ?? 0) / 100;

		updateConfig({
			simulationCount,
			assetIds: assetData.map((a) => a.id),
			riskFreeRate
		});
		setRunning(true);
		selectedPortfolio = null;

		worker = createMonteCarloWorker();

		worker.onmessage = (event: MessageEvent<MonteCarloWorkerResponse>) => {
			const msg = event.data;
			switch (msg.type) {
				case 'simulation-progress':
					setProgress(msg.payload.completed, msg.payload.total);
					// When progress reaches 100%, show the rendering indicator immediately.
					// The result message hasn't arrived yet (worker still computing frontier
					// + structured clone transfer), so this bridges the visual gap.
					if (msg.payload.completed >= msg.payload.total) {
						rendering = true;
						setRunning(false);
					}
					break;
				case 'simulation-result': {
					// The chart render (uPlot) is synchronous and blocks the main thread.
					// We use setTimeout to yield to the browser so it can paint the
					// "Rendering chart..." indicator before the heavy render starts.
					const payload = msg.payload;
					rendering = true;
					setRunning(false);
					// Persist and clean up worker immediately (non-blocking)
					saveSimulation({
						id: crypto.randomUUID(),
						config: {
							simulationCount,
							assetIds: assetData.map((a) => a.id),
							riskFreeRate,
							benchmarkPortfolioId: null
						},
						results: payload,
						createdAt: new Date().toISOString()
					});
					worker?.terminate();
					worker = null;
					// Yield to browser for paint, then trigger the heavy render
					setTimeout(() => {
						setResult(payload);
						rendering = false;
					}, 80);
					break;
				}
				case 'error':
					setRunning(false);
					worker?.terminate();
					worker = null;
					break;
			}
		};

		worker.onerror = () => {
			setRunning(false);
			worker?.terminate();
			worker = null;
		};

		const request: MonteCarloWorkerRequest = {
			type: 'run-simulation',
			payload: {
				config: {
					simulationCount,
					assetIds: assetData.map((a) => a.id),
					riskFreeRate,
					benchmarkPortfolioId: null
				},
				assets: assetData
			}
		};
		worker.postMessage(request);
	}

	function handleCancel() {
		worker?.terminate();
		worker = null;
		setRunning(false);
	}

	function handleSelect(portfolio: SimulatedPortfolio) {
		selectedPortfolio = portfolio;
		savedPortfolioSlug = null;
	}

	// Resolve asset names for inspector, filtering out 0% allocations
	function resolveWeights(weights: Record<string, number>): Array<{ name: string; weight: number }> {
		return Object.entries(weights)
			.filter(([, weight]) => weight > 0)
			.map(([id, weight]) => {
				const asset = $assets.find((a) => a.id === id);
				return { name: asset?.name ?? id.slice(0, 8), weight };
			})
			.sort((a, b) => b.weight - a.weight);
	}

	async function handleSaveAsPortfolio() {
		if (!selectedPortfolio) return;

		const allocations = Object.entries(selectedPortfolio.weights)
			.filter(([, weight]) => weight > 0)
			.map(([assetId, weight]) => ({
				assetId,
				weight
			}));

		const names = resolveWeights(selectedPortfolio.weights).map((w) => w.name);
		const portfolioName = `Simulated (${names.join(', ')})`.slice(0, 60);

		const portfolio = {
			id: crypto.randomUUID(),
			name: portfolioName,
			allocations,
			isBenchmark: false,
			sourceStrategyId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await addPortfolio(portfolio);
		savedPortfolioSlug = slugify(portfolioName);
	}
</script>

<svelte:head>
	<title>Simulation – Sweetfolio</title>
</svelte:head>

<div class="simulation-page">
	<header class="page-header">
		<h1>Monte Carlo Simulation</h1>
		<p class="page-subtitle">Explore the efficient frontier with random portfolio simulations</p>
	</header>

	<div class="simulation-layout">
		<aside class="config-panel">
			<Card>
				<h2>Configuration</h2>

				<div class="config-form">
					<div class="form-field">
						<label for="sim-count">Number of Simulations</label>
						<input
							id="sim-count"
							type="number"
							min="100"
							max="100000"
							step="100"
							bind:value={simulationCount}
							disabled={isRunning}
						/>
						<span class="field-hint">{simulationCount.toLocaleString()} portfolios</span>
					</div>

					<div class="form-field">
						<!-- svelte-ignore a11y_label_has_associated_control -->
					<label>Assets to Include</label>
						{#if assetSelections.length === 0}
							<p class="muted">No assets available. Upload asset data first.</p>
						{:else}
							<div class="asset-checkboxes">
								<label class="checkbox-item select-all">
									<input
										type="checkbox"
										checked={assetSelections.length > 0 && assetSelections.every((a) => a.selected)}
										indeterminate={assetSelections.some((a) => a.selected) && !assetSelections.every((a) => a.selected)}
										onchange={() => {
											const allSelected = assetSelections.every((a) => a.selected);
											assetSelections.forEach((a) => (a.selected = !allSelected));
										}}
										disabled={isRunning}
									/>
									<span>Select all</span>
								</label>
								{#each assetSelections as asset, idx}
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<label
										class="checkbox-item"
										onmouseenter={() => (hoveredAssetName = asset.name)}
										onmouseleave={() => (hoveredAssetName = null)}
									>
										<input type="checkbox" bind:checked={asset.selected} disabled={isRunning} />
										<span class="asset-color-dot" style="background: {assetColors[idx]}"></span>
										<span>{asset.name}</span>
										{#if assetConversionWarnings.has(asset.id)}
											<span class="currency-warning" title="No exchange rate data to convert {$assets.find((a) => a.id === asset.id)?.currency ?? '?'} to {mainCurrency}. Simulation uses unconverted prices.">
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
													<line x1="12" y1="9" x2="12" y2="13"/>
													<line x1="12" y1="17" x2="12.01" y2="17"/>
												</svg>
											</span>
										{/if}
									</label>
								{/each}
							</div>
						{/if}
					</div>

					{#if isRunning}
						<div class="progress-section">
							<div class="progress-bar-track">
								<div class="progress-bar" style="width: {progress}%"></div>
							</div>
							<span class="progress-text">{progress.toFixed(0)}%</span>
						</div>
						<Button variant="danger" onclick={handleCancel}>Cancel</Button>
					{:else if rendering}
						<div class="progress-section">
							<span class="rendering-text">Rendering chart...</span>
						</div>
					{:else}
						<Button variant="primary" onclick={handleRun} disabled={selectedAssets.length < 2}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M13 10V3L4 14h7v7l9-11h-7z"/>
							</svg>
							Run Simulation
						</Button>
						{#if selectedAssets.length < 2 && assetSelections.length > 0}
							<p class="field-hint">Select at least 2 assets to run a simulation.</p>
						{/if}
					{/if}
				</div>
			</Card>
		</aside>

		<div class="results-area">
			{#if rendering}
				<Card padding="lg">
					<div class="chart-placeholder">
						<div class="rendering-spinner"></div>
						<h3>Rendering chart...</h3>
						<p>Drawing {simulationCount.toLocaleString()} portfolios</p>
					</div>
				</Card>
			{:else if result}
				<Card padding="lg">
					<EfficientFrontier
						scatterVolatilities={result.scatterVolatilities}
						scatterReturns={result.scatterReturns}
						portfolioCount={result.portfolioCount}
						efficientFrontier={result.efficientFrontier}
						benchmark={benchmarkPortfolio}
						assetMarkers={assetMarkerList}
						highlightedAsset={hoveredAssetName}
						onselect={handleSelect}
					/>
				</Card>

				<Card>
					<div class="inspector">
						<h3>Portfolio Inspector</h3>
						{#if selectedPortfolio}
							<div class="inspector-data">
								<div class="inspector-metrics">
									<div class="inspector-metric">
										<span class="inspector-label">Annualized Return</span>
										<span class="inspector-value">{(selectedPortfolio.annualizedReturn * 100).toFixed(2)}%</span>
									</div>
									<div class="inspector-metric">
										<span class="inspector-label">Volatility</span>
										<span class="inspector-value">{(selectedPortfolio.volatility * 100).toFixed(2)}%</span>
									</div>
									<div class="inspector-metric">
										<span class="inspector-label">Sharpe Ratio</span>
										<span class="inspector-value">{selectedPortfolio.sharpeRatio.toFixed(3)}</span>
									</div>
								</div>
								<div class="inspector-weights">
									<h4>Allocation</h4>
									{#each resolveWeights(selectedPortfolio.weights) as w}
										<div class="weight-row">
											<span class="weight-name">{w.name}</span>
											<span class="weight-value">{(w.weight * 100).toFixed(1)}%</span>
										</div>
									{/each}
								</div>
								<div class="inspector-actions">
									<Button variant="primary" size="sm" onclick={handleSaveAsPortfolio}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
											<polyline points="17 21 17 13 7 13 7 21"/>
											<polyline points="7 3 7 8 15 8"/>
										</svg>
										Save as Portfolio
									</Button>
									{#if savedPortfolioSlug}
										<a href="/portfolios/{savedPortfolioSlug}" class="open-portfolio-link">
											Open
											<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M5 12h14"/>
												<path d="M12 5l7 7-7 7"/>
											</svg>
										</a>
									{/if}
								</div>
							</div>
						{:else}
							<p class="muted">Click on a point in the scatter plot to inspect the portfolio allocation.</p>
						{/if}
					</div>
				</Card>
			{:else}
				<Card padding="lg">
					<div class="chart-placeholder">
						<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"/>
							<path d="M8 12l2 2 4-4"/>
						</svg>
						<h3>Efficient Frontier</h3>
						<p>Run a simulation to see the risk vs. return scatter plot with the efficient frontier overlay.</p>
					</div>
				</Card>

				<Card>
					<div class="inspector-placeholder">
						<h3>Portfolio Inspector</h3>
						<p class="muted">Click on a point in the scatter plot to inspect the portfolio allocation, return, volatility, and Sharpe ratio.</p>
					</div>
				</Card>
			{/if}
		</div>
	</div>
</div>

<style>
	.simulation-page {
		max-width: 1200px;
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

	.simulation-layout {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: var(--spacing-lg);
		align-items: start;
	}

	@media (max-width: 900px) {
		.simulation-layout {
			grid-template-columns: 1fr;
		}
	}

	.config-panel h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-lg);
	}

	.config-form {
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

	.field-hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.muted {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.asset-checkboxes {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.checkbox-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		cursor: pointer;
		font-size: var(--font-size-sm);
	}

	.asset-color-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.currency-warning {
		display: inline-flex;
		align-items: center;
		margin-left: auto;
		color: var(--color-warning, #e6a700);
		flex-shrink: 0;
		cursor: help;
	}

	.checkbox-item.select-all {
		font-weight: 600;
		padding-bottom: var(--spacing-xs);
		margin-bottom: var(--spacing-xs);
		border-bottom: 1px solid var(--color-border);
	}

	.progress-section {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.progress-bar-track {
		flex: 1;
		height: 8px;
		background: var(--color-bg-tertiary);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, var(--color-deep-teal), var(--color-miku-teal));
		border-radius: 4px;
		transition: width var(--transition-fast);
	}

	.progress-text {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		min-width: 40px;
		text-align: right;
	}

	.rendering-text {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		animation: pulse 1.2s ease-in-out infinite;
	}

	.rendering-spinner {
		width: 36px;
		height: 36px;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}

	.results-area {
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
		min-height: 400px;
		color: var(--color-text-muted);
		text-align: center;
	}

	.chart-placeholder h3 {
		color: var(--color-text-secondary);
		font-size: var(--font-size-lg);
	}

	.chart-placeholder p {
		font-size: var(--font-size-sm);
		max-width: 360px;
	}

	.inspector-placeholder {
		padding: var(--spacing-sm) 0;
	}

	.inspector-placeholder h3 {
		font-size: var(--font-size-base);
		margin-bottom: var(--spacing-xs);
	}

	.inspector h3 {
		font-size: var(--font-size-base);
		margin-bottom: var(--spacing-md);
	}

	.inspector-data {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.inspector-metrics {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--spacing-md);
	}

	.inspector-metric {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.inspector-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.inspector-value {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		font-weight: 600;
	}

	.inspector-weights h4 {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-sm);
	}

	.weight-row {
		display: flex;
		justify-content: space-between;
		padding: var(--spacing-xs) 0;
		font-size: var(--font-size-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.weight-name {
		font-weight: 500;
	}

	.weight-value {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.inspector-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding-top: var(--spacing-sm);
	}

	.open-portfolio-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--font-size-xs);
		color: var(--color-positive);
		font-weight: 500;
		text-decoration: none;
		animation: fadeIn 200ms ease;
	}

	.open-portfolio-link:hover {
		text-decoration: underline;
	}
</style>
