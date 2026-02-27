<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import ThemeToggle from '$lib/components/layout/ThemeToggle.svelte';
	import { theme } from '$lib/stores/theme';

	let mainCurrency = $state('EUR');
	let riskFreeRate = $state(0);

	const currencies = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK'];

	function handleSave() {
		// TODO: integrate with settings store
	}
</script>

<div class="settings-page">
	<header class="page-header">
		<h1>Settings</h1>
		<p class="page-subtitle">Configure application preferences</p>
	</header>

	<div class="settings-sections">
		<Card>
			<div class="setting-section">
				<h2>Appearance</h2>
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Theme</span>
						<span class="setting-description">Switch between light and dark mode</span>
					</div>
					<div class="setting-control">
						<button
							class="theme-switch"
							onclick={() => theme.toggle()}
						>
							<span class="theme-option" class:active={$theme === 'light'}>Light</span>
							<span class="theme-option" class:active={$theme === 'dark'}>Dark</span>
						</button>
					</div>
				</div>
			</div>
		</Card>

		<Card>
			<div class="setting-section">
				<h2>Currency</h2>
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Main Currency</span>
						<span class="setting-description">All values will be displayed in this currency</span>
					</div>
					<div class="setting-control">
						<select bind:value={mainCurrency}>
							{#each currencies as c}
								<option value={c}>{c}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</Card>

		<Card>
			<div class="setting-section">
				<h2>Calculations</h2>
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Risk-Free Rate</span>
						<span class="setting-description">Used for Sharpe ratio calculations (annual rate)</span>
					</div>
					<div class="setting-control">
						<div class="input-with-suffix">
							<input
								type="number"
								min="0"
								max="100"
								step="0.01"
								bind:value={riskFreeRate}
							/>
							<span class="suffix">%</span>
						</div>
					</div>
				</div>
			</div>
		</Card>

		<Card>
			<div class="setting-section">
				<h2>Data</h2>
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Storage</span>
						<span class="setting-description">All data is stored locally in your browser using IndexedDB</span>
					</div>
					<div class="setting-control">
						<Button variant="danger" size="sm">Clear All Data</Button>
					</div>
				</div>
			</div>
		</Card>
	</div>
</div>

<style>
	.settings-page {
		max-width: 720px;
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

	.settings-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.setting-section h2 {
		font-size: var(--font-size-base);
		margin-bottom: var(--spacing-lg);
		color: var(--color-text-secondary);
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-lg);
	}

	@media (max-width: 600px) {
		.setting-row {
			flex-direction: column;
			align-items: flex-start;
		}
	}

	.setting-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.setting-label {
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.setting-description {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.setting-control {
		flex-shrink: 0;
	}

	.setting-control select {
		min-width: 100px;
	}

	.theme-switch {
		display: flex;
		background: var(--color-bg-tertiary);
		border-radius: var(--radius-sm);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	.theme-option {
		padding: var(--spacing-xs) var(--spacing-md);
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.theme-option.active {
		background: var(--color-accent);
		color: #fff;
	}

	.input-with-suffix {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.input-with-suffix input {
		width: 80px;
		text-align: right;
	}

	.suffix {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
</style>
