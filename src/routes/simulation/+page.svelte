<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';

	let simulationCount = $state(10000);
	let isRunning = $state(false);
	let progress = $state(0);

	// Placeholder
	const availableAssets: Array<{ id: string; name: string; selected: boolean }> = [];

	function handleRun() {
		// TODO: integrate with Monte Carlo worker
		isRunning = true;
		progress = 0;
	}

	function handleCancel() {
		isRunning = false;
		progress = 0;
	}
</script>

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
						{#if availableAssets.length === 0}
							<p class="muted">No assets available. Upload asset data first.</p>
						{:else}
							<div class="asset-checkboxes">
								{#each availableAssets as asset}
									<label class="checkbox-item">
										<input type="checkbox" bind:checked={asset.selected} disabled={isRunning} />
										<span>{asset.name}</span>
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
					{:else}
						<Button variant="primary" onclick={handleRun} disabled={availableAssets.length === 0}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M13 10V3L4 14h7v7l9-11h-7z"/>
							</svg>
							Run Simulation
						</Button>
					{/if}
				</div>
			</Card>
		</aside>

		<div class="results-area">
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
</style>
