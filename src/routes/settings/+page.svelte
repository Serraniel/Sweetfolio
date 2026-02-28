<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import FileDropzone from '$lib/components/shared/FileDropzone.svelte';
	import FormatConfigModal from '$lib/components/shared/FormatConfigModal.svelte';
	import { theme } from '$lib/stores/theme';
	import { settings, setSetting } from '$lib/stores/settings';
	import { currencies, addCurrencyRate, removeCurrencyRate, loadCurrencies } from '$lib/stores/currencies';
	import { detectFormat } from '$lib/parsers/format-detection';
	import { parseCSV } from '$lib/parsers/normalization';
	import { parseCSVRows } from '$lib/parsers/csv';
	import type { DetectedFormat } from '$lib/types';

	let mainCurrency = $state('EUR');
	let riskFreeRate = $state(0);
	let autoImportMode = $state(true);
	let autoResolveNames = $state(true);
	let alphaVantageApiKey = $state('');
	let corsProxyUrl = $state('');
	let dataSourcePrimary = $state('onvista');
	let saving = $state(false);

	const supportedCurrencies = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK'];

	// Currency upload state
	let showCurrencyModal = $state(false);
	let currencyRawText = $state('');
	let currencyPreview: string[][] = $state([]);
	let currencyFormat: DetectedFormat = $state({
		delimiter: ',',
		decimalSeparator: '.',
		dateFormat: 'YYYY-MM-DD',
		hasHeader: true,
		dateColumn: 0,
		closeColumn: 1
	});
	let currencyPairSource = $state('USD');
	let currencyPairTarget = $state('EUR');
	let currencyAssetName = $state('');
	let currencyAssetCurrency = $state('EUR');

	// Initialize from store
	$effect(() => {
		const s = $settings;
		if (s.mainCurrency) mainCurrency = s.mainCurrency as string;
		if (s.riskFreeRate !== undefined) riskFreeRate = s.riskFreeRate as number;
		if (s.autoImportMode !== undefined) autoImportMode = s.autoImportMode as boolean;
		if (s.autoResolveNames !== undefined) autoResolveNames = s.autoResolveNames as boolean;
		if (s.alphaVantageApiKey !== undefined) alphaVantageApiKey = s.alphaVantageApiKey as string;
		if (s.corsProxyUrl !== undefined) corsProxyUrl = s.corsProxyUrl as string;
		if (s.dataSourcePrimary) dataSourcePrimary = s.dataSourcePrimary as string;
	});

	// Load currencies on mount
	$effect(() => {
		loadCurrencies();
	});

	async function handleSave() {
		saving = true;
		await Promise.all([
			setSetting('mainCurrency', mainCurrency),
			setSetting('riskFreeRate', riskFreeRate),
			setSetting('autoImportMode', autoImportMode),
			setSetting('autoResolveNames', autoResolveNames),
			setSetting('alphaVantageApiKey', alphaVantageApiKey),
			setSetting('corsProxyUrl', corsProxyUrl),
			setSetting('dataSourcePrimary', dataSourcePrimary),
		]);
		saving = false;
	}

	function handleCurrencyFiles(files: FileList) {
		if (files.length === 0) return;
		const file = files[0];
		const reader = new FileReader();
		reader.onload = () => {
			currencyRawText = reader.result as string;
			const fmt = detectFormat(currencyRawText);
			currencyFormat = fmt;
			currencyPreview = parseCSVRows(currencyRawText, fmt.delimiter).slice(0, 10);
			currencyAssetName = file.name.replace(/\.csv$/i, '');
			showCurrencyModal = true;
		};
		reader.readAsText(file);
	}

	async function handleCurrencyImportConfirm() {
		const result = parseCSV(currencyRawText, currencyFormat);
		const pair = currencyPairSource + currencyPairTarget;
		const rates = result.prices.map((p) => ({ date: p.date, rate: p.close }));

		await addCurrencyRate({ pair, rates });

		showCurrencyModal = false;
		currencyRawText = '';
		currencyPreview = [];
	}

	async function handleDeleteCurrency(pair: string) {
		if (!confirm(`Delete currency pair ${pair}?`)) return;
		await removeCurrencyRate(pair);
	}

	async function handleClearData() {
		if (!confirm('This will permanently delete all your data. Are you sure?')) return;
		indexedDB.deleteDatabase('sweetfolio');
		window.location.reload();
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
				<h2>Data Sources</h2>
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Primary Source</span>
						<span class="setting-description">Preferred data source for ISIN/WKN lookups</span>
					</div>
					<div class="setting-control">
						<select bind:value={dataSourcePrimary}>
							<option value="onvista">Onvista (default)</option>
						</select>
					</div>
				</div>

				<div class="setting-row" style="margin-top: var(--spacing-lg);">
					<div class="setting-info">
						<span class="setting-label">Alpha Vantage API Key</span>
						<span class="setting-description">Optional. Enables Alpha Vantage as a secondary data source</span>
					</div>
					<div class="setting-control">
						<input
							type="password"
							placeholder="Enter API key"
							bind:value={alphaVantageApiKey}
							autocomplete="off"
							class="api-key-input"
						/>
					</div>
				</div>

				<div class="setting-row" style="margin-top: var(--spacing-lg);">
					<div class="setting-info">
						<span class="setting-label">CORS Proxy URL</span>
						<span class="setting-description">Optional. For power users who want Yahoo Finance via a CORS proxy</span>
					</div>
					<div class="setting-control">
						<input
							type="url"
							placeholder="https://proxy.example.com"
							bind:value={corsProxyUrl}
							autocomplete="off"
							class="api-key-input"
						/>
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
							{#each supportedCurrencies as c}
								<option value={c}>{c}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</Card>

		<Card>
			<div class="setting-section">
				<h2>Exchange Rates</h2>
				<p class="section-description">Upload historical exchange rate CSV files for cross-currency conversion.</p>

				<div class="currency-pair-selector">
					<div class="pair-select-row">
						<div class="pair-select-field">
							<label for="pair-source">Source</label>
							<select id="pair-source" bind:value={currencyPairSource}>
								{#each supportedCurrencies as c}
									<option value={c}>{c}</option>
								{/each}
							</select>
						</div>
						<span class="pair-arrow">&rarr;</span>
						<div class="pair-select-field">
							<label for="pair-target">Target</label>
							<select id="pair-target" bind:value={currencyPairTarget}>
								{#each supportedCurrencies as c}
									<option value={c}>{c}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>

				<div class="currency-upload-area">
					<FileDropzone onfiles={handleCurrencyFiles} />
				</div>

				{#if $currencies.length > 0}
					<div class="currency-pairs">
						<h3>Loaded Pairs</h3>
						<div class="currency-pair-list">
							{#each $currencies as cr}
								<div class="currency-pair-row">
									<span class="pair-name">{cr.pair.slice(0, 3)}/{cr.pair.slice(3)}</span>
									<span class="pair-count">{cr.rates.length.toLocaleString()} rates</span>
									<span class="pair-range">
										{#if cr.rates.length > 0}
											{cr.rates[0].date} &ndash; {cr.rates[cr.rates.length - 1].date}
										{/if}
									</span>
									<Button variant="ghost" size="sm" onclick={() => handleDeleteCurrency(cr.pair)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="3 6 5 6 21 6"/>
											<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
										</svg>
									</Button>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</Card>

		<Card>
			<div class="setting-section">
				<h2>Import</h2>
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">Auto-Resolve Names</span>
						<span class="setting-description">Automatically look up asset names from ISIN/WKN detected in filenames</span>
					</div>
					<div class="setting-control">
						<button
							class="theme-switch"
							onclick={() => autoResolveNames = !autoResolveNames}
						>
							<span class="theme-option" class:active={autoResolveNames}>On</span>
							<span class="theme-option" class:active={!autoResolveNames}>Off</span>
						</button>
					</div>
				</div>

				<div class="setting-row" style="margin-top: var(--spacing-lg);">
					<div class="setting-info">
						<span class="setting-label">Auto-Import Mode</span>
						<span class="setting-description">Skip the format configuration modal when CSV format is detected with full confidence</span>
					</div>
					<div class="setting-control">
						<button
							class="theme-switch"
							onclick={() => autoImportMode = !autoImportMode}
						>
							<span class="theme-option" class:active={autoImportMode}>On</span>
							<span class="theme-option" class:active={!autoImportMode}>Off</span>
						</button>
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
						<Button variant="danger" size="sm" onclick={handleClearData}>Clear All Data</Button>
					</div>
				</div>
			</div>
		</Card>

		<div class="save-row">
			<Button variant="primary" onclick={handleSave} disabled={saving}>
				{saving ? 'Saving...' : 'Save Settings'}
			</Button>
		</div>
	</div>

	{#if showCurrencyModal}
		<FormatConfigModal
			bind:open={showCurrencyModal}
			bind:detectedFormat={currencyFormat}
			preview={currencyPreview}
			onconfirm={handleCurrencyImportConfirm}
			bind:assetName={currencyAssetName}
			bind:assetCurrency={currencyAssetCurrency}
			title="Currency Rate Import"
		/>
		<!-- Pair selection is handled inside the modal via the assetName field;
		     the pair is derived from source/target selectors below the modal -->
	{/if}
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

	.api-key-input {
		min-width: 220px;
		font-size: var(--font-size-sm);
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

	.save-row {
		display: flex;
		justify-content: flex-end;
	}

	.section-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.currency-pair-selector {
		margin-bottom: var(--spacing-md);
	}

	.pair-select-row {
		display: flex;
		align-items: flex-end;
		gap: var(--spacing-md);
	}

	.pair-select-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.pair-select-field label {
		font-size: var(--font-size-xs);
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.pair-arrow {
		font-size: var(--font-size-lg);
		color: var(--color-text-muted);
		padding-bottom: var(--spacing-sm);
	}

	.currency-upload-area {
		margin-bottom: var(--spacing-lg);
	}

	.currency-pairs {
		margin-top: var(--spacing-lg);
	}

	.currency-pairs h3 {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-sm);
	}

	.currency-pair-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.currency-pair-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
	}

	.pair-name {
		font-weight: 600;
		font-family: var(--font-mono);
		min-width: 80px;
	}

	.pair-count {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		min-width: 80px;
	}

	.pair-range {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		flex: 1;
	}
</style>
