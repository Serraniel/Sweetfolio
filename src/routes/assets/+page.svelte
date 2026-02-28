<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import FileDropzone from '$lib/components/shared/FileDropzone.svelte';
	import FormatConfigModal from '$lib/components/shared/FormatConfigModal.svelte';
	import { assets, addAsset, removeAsset } from '$lib/stores/assets';
	import { validateISIN, validateWKN, fetchByISIN, fetchByWKN, type ScraperResult } from '$lib/scraper/index';
	import { detectFormat, isFormatConfident } from '$lib/parsers/format-detection';
	import { parseCSV } from '$lib/parsers/normalization';
	import { parseCSVRows } from '$lib/parsers/csv';
	import { settings } from '$lib/stores/settings';
	import { benchmarkRef, setBenchmark } from '$lib/stores/benchmark';
	import { resolveAssetFromFilename } from '$lib/utils/resolve-asset';
	import { computeAssetHealth, type AssetHealthMetrics } from '$lib/engine/data-quality';
	import { slugify } from '$lib/utils/slug';
	import type { DetectedFormat } from '$lib/types';

	function isBenchmark(assetId: string): boolean {
		const ref = $benchmarkRef;
		return ref !== null && ref.type === 'asset' && ref.id === assetId;
	}

	async function toggleBenchmark(assetId: string) {
		if (isBenchmark(assetId)) {
			await setBenchmark(null);
		} else {
			await setBenchmark({ type: 'asset', id: assetId });
		}
	}

	let showFormatModal = $state(false);
	let csvPreview: string[][] = $state([]);
	let detectedFormat: DetectedFormat = $state({
		delimiter: ',',
		decimalSeparator: '.',
		dateFormat: 'YYYY-MM-DD',
		hasHeader: true,
		dateColumn: 0,
		closeColumn: 1
	});
	let rawText = $state('');
	let importFileName = $state('');
	let assetName = $state('');
	let assetCurrency = $state('EUR');
	let assetIsin: string | null = $state(null);
	let assetWkn: string | null = $state(null);

	// Toast notifications for auto-import feedback
	let toasts: Array<{ id: number; message: string }> = $state([]);
	let toastCounter = 0;

	function showToast(message: string) {
		const id = ++toastCounter;
		toasts = [...toasts, { id, message }];
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 4000);
	}

	const autoImportEnabled = $derived($settings.autoImportMode !== false);
	const autoResolveEnabled = $derived($settings.autoResolveNames !== false);
	let resolving = $state(false);

	// Identifier lookup state
	let lookupInput = $state('');
	let lookupFetching = $state(false);
	let lookupError: string | null = $state(null);
	let lookupResult: ScraperResult | null = $state(null);
	let lookupEditName = $state('');
	let lookupEditCurrency = $state('');
	let fetchedIdentifier: string | null = $state(null);
	let fetchedIdentifierType: IdentifierType = $state(null);

	type IdentifierType = 'isin' | 'wkn' | null;

	const lookupIdentifierType: IdentifierType = $derived.by(() => {
		const v = lookupInput.trim().toUpperCase();
		if (v.length === 0) return null;
		if (validateISIN(v)) return 'isin';
		if (validateWKN(v)) return 'wkn';
		return null;
	});

	const lookupValid = $derived(lookupIdentifierType !== null);
	const lookupHint = $derived.by(() => {
		const v = lookupInput.trim();
		if (v.length === 0) return '';
		if (lookupIdentifierType === 'isin') return 'Valid ISIN';
		if (lookupIdentifierType === 'wkn') return 'Valid WKN';
		return 'Not a valid ISIN or WKN';
	});

	async function handleLookup() {
		const identifier = lookupInput.trim().toUpperCase();
		if (!lookupValid || lookupFetching) return;

		lookupFetching = true;
		lookupError = null;
		lookupResult = null;
		fetchedIdentifier = identifier;
		fetchedIdentifierType = lookupIdentifierType;

		try {
			const outcome = fetchedIdentifierType === 'isin'
				? await fetchByISIN(identifier)
				: await fetchByWKN(identifier);

			if (outcome.success) {
				lookupResult = outcome.data;
				lookupEditName = outcome.data.name ?? identifier;
				lookupEditCurrency = outcome.data.currency ?? 'EUR';
			} else {
				lookupError = outcome.error.message;
			}
		} catch {
			lookupError = 'An unexpected error occurred. Please try again or upload a CSV file instead.';
		} finally {
			lookupFetching = false;
		}
	}

	async function handleLookupConfirm() {
		if (!lookupResult || !fetchedIdentifier) return;

		const asset = {
			id: crypto.randomUUID(),
			name: lookupEditName || fetchedIdentifier,
			isin: fetchedIdentifierType === 'isin' ? fetchedIdentifier : null,
			wkn: fetchedIdentifierType === 'wkn' ? fetchedIdentifier : null,
			currency: lookupEditCurrency,
			prices: $state.snapshot(lookupResult.prices),
			formatConfig: null,
			rawCSV: null,
			rawCSVStoredAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await addAsset(asset);
		showToast(`Imported "${asset.name}" (${asset.prices.length} data points)`);
		handleLookupCancel();
	}

	function handleLookupCancel() {
		lookupInput = '';
		lookupResult = null;
		lookupError = null;
		lookupEditName = '';
		lookupEditCurrency = '';
		fetchedIdentifier = null;
		fetchedIdentifierType = null;
	}

	// Queue for multi-file import
	let pendingFiles: File[] = $state([]);
	let currentFileIndex = $state(0);
	let totalFiles = $state(0);

	// Derive display list from store with health metrics
	const assetList = $derived(
		$assets.map((a) => {
			const health = computeAssetHealth(a.prices);
			return {
				id: a.id,
				name: a.name,
				isin: a.isin,
				currency: a.currency,
				dataPoints: a.prices.length,
				dateRange:
					a.prices.length > 0
						? `${a.prices[0].date} \u2013 ${a.prices[a.prices.length - 1].date}`
						: '',
				health
			};
		})
	);

	function handleFiles(files: FileList) {
		if (files.length === 0) return;

		const fileArray = Array.from(files);

		if (autoImportEnabled) {
			processFilesWithAutoImport(fileArray);
		} else {
			pendingFiles = fileArray;
			currentFileIndex = 0;
			totalFiles = fileArray.length;
			loadFileIntoModal(fileArray[0]);
		}
	}

	function readFileAsText(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsText(file);
		});
	}

	async function processFilesWithAutoImport(files: File[]) {
		const ambiguousFiles: File[] = [];

		for (const file of files) {
			const text = await readFileAsText(file);
			const fmt = detectFormat(text);

			if (isFormatConfident(text, fmt)) {
				let name = file.name.replace(/\.csv$/i, '');
				let isin: string | null = null;
				let wkn: string | null = null;
				let currency = assetCurrency;

				if (autoResolveEnabled) {
					const resolved = await resolveAssetFromFilename(file.name);
					if (resolved) {
						name = resolved.name;
						isin = resolved.isin;
						wkn = resolved.wkn;
						if (resolved.currency) currency = resolved.currency;
					}
				}

				const result = parseCSV(text, fmt);

				const asset = {
					id: crypto.randomUUID(),
					name,
					isin,
					wkn,
					currency,
					prices: result.prices,
					formatConfig: result.detectedFormat,
					rawCSV: text,
					rawCSVStoredAt: new Date().toISOString(),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				};

				await addAsset(asset);
				showToast(`Imported "${name}" (${result.prices.length} data points)`);
			} else {
				ambiguousFiles.push(file);
			}
		}

		// Queue ambiguous files for manual configuration
		if (ambiguousFiles.length > 0) {
			pendingFiles = ambiguousFiles;
			currentFileIndex = 0;
			totalFiles = ambiguousFiles.length;
			loadFileIntoModal(ambiguousFiles[0]);
		}
	}

	async function loadFileIntoModal(file: File) {
		importFileName = file.name.replace(/\.csv$/i, '');
		assetName = importFileName;

		rawText = await readFileAsText(file);
		const fmt = detectFormat(rawText);
		detectedFormat = fmt;
		csvPreview = parseCSVRows(rawText, fmt.delimiter).slice(0, 10);
		showFormatModal = true;

		// Resolve asset name from ISIN/WKN in filename (non-blocking)
		assetIsin = null;
		assetWkn = null;
		if (autoResolveEnabled) {
			resolving = true;
			resolveAssetFromFilename(file.name)
				.then((resolved) => {
					if (resolved && showFormatModal) {
						assetName = resolved.name;
						assetIsin = resolved.isin;
						assetWkn = resolved.wkn;
						if (resolved.currency) assetCurrency = resolved.currency;
					}
				})
				.finally(() => {
					resolving = false;
				});
		}
	}

	async function handleImportConfirm() {
		const result = parseCSV(rawText, detectedFormat);

		const asset = {
			id: crypto.randomUUID(),
			name: assetName || importFileName,
			isin: assetIsin,
			wkn: assetWkn,
			currency: assetCurrency,
			prices: result.prices,
			formatConfig: result.detectedFormat,
			rawCSV: rawText,
			rawCSVStoredAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await addAsset(asset);

		showFormatModal = false;
		rawText = '';
		csvPreview = [];
		assetName = '';
		assetIsin = null;
		assetWkn = null;

		// Process next file in the queue
		currentFileIndex++;
		if (currentFileIndex < pendingFiles.length) {
			loadFileIntoModal(pendingFiles[currentFileIndex]);
		} else {
			pendingFiles = [];
			currentFileIndex = 0;
			totalFiles = 0;
		}
	}

	async function handleDelete(id: string) {
		if (!confirm('Delete this asset? This cannot be undone.')) return;
		await removeAsset(id);
	}
</script>

<svelte:head>
	<title>Assets – Sweetfolio</title>
</svelte:head>

<div class="assets-page">
	<header class="page-header">
		<div class="page-header-row">
			<div>
				<h1>Assets</h1>
				<p class="page-subtitle">Manage your uploaded securities data</p>
			</div>
		</div>
	</header>

	<section class="upload-section">
		<FileDropzone onfiles={handleFiles} />
	</section>

	<section class="lookup-section">
		<Card>
			<div class="lookup-header">
				<h3>Or look up by identifier</h3>
				<p class="lookup-subtitle">Fetch historical price data by ISIN or WKN from Onvista</p>
			</div>

			<div class="lookup-input-row">
				<div class="lookup-field">
					<input
						type="text"
						class="lookup-input"
						placeholder="Enter ISIN or WKN..."
						bind:value={lookupInput}
						disabled={lookupFetching}
						onkeydown={(e) => { if (e.key === 'Enter' && lookupValid) handleLookup(); }}
					/>
					{#if lookupHint}
						<span class="lookup-hint" class:valid={lookupValid} class:invalid={!lookupValid}>
							{lookupHint}
						</span>
					{/if}
				</div>
				<Button
					variant="primary"
					disabled={!lookupValid || lookupFetching}
					onclick={handleLookup}
				>
					{#if lookupFetching}
						Fetching...
					{:else}
						Fetch
					{/if}
				</Button>
			</div>

			{#if lookupError}
				<div class="lookup-error">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<line x1="15" y1="9" x2="9" y2="15"/>
						<line x1="9" y1="9" x2="15" y2="15"/>
					</svg>
					<span>{lookupError}</span>
				</div>
			{/if}

			{#if lookupResult}
				<div class="lookup-preview">
					<div class="preview-grid">
						<label class="preview-label">
							Name
							<input
								type="text"
								class="preview-input"
								bind:value={lookupEditName}
							/>
						</label>
						<label class="preview-label">
							Currency
							<input
								type="text"
								class="preview-input preview-input--short"
								bind:value={lookupEditCurrency}
							/>
						</label>
						<div class="preview-meta">
							<span class="mono">{fetchedIdentifier}</span>
							<span class="muted">{lookupResult.prices.length.toLocaleString()} data points</span>
							{#if lookupResult.prices.length >= 2}
								<span class="muted">
									{lookupResult.prices[0].date} – {lookupResult.prices[lookupResult.prices.length - 1].date}
								</span>
							{/if}
							<span class="muted">Source: {lookupResult.source}</span>
						</div>
					</div>
					<div class="preview-actions">
						<Button variant="primary" onclick={handleLookupConfirm}>Add Asset</Button>
						<Button variant="ghost" onclick={handleLookupCancel}>Cancel</Button>
					</div>
				</div>
			{/if}
		</Card>
	</section>

	<section class="asset-list">
		{#if assetList.length === 0}
			<Card padding="lg">
				<div class="empty-state">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
					</svg>
					<h3>No assets yet</h3>
					<p>Upload a CSV file with historical price data to get started.</p>
				</div>
			</Card>
		{:else}
			<Card>
				<div class="table-wrapper">
					<table class="asset-table">
						<thead>
							<tr>
								<th class="bm-col" title="Set as benchmark for comparison">Benchmark</th>
								<th>Name</th>
								<th>ISIN</th>
								<th>Currency</th>
								<th class="num-col">Return</th>
								<th class="num-col">Volatility</th>
								<th class="num-col">Data Points</th>
								<th>Date Range</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each assetList as asset}
								<tr class:benchmark-row={isBenchmark(asset.id)} class:has-warnings={asset.health.warnings.length > 0}>
									<td class="bm-col">
										<button
											class="bm-toggle"
											class:active={isBenchmark(asset.id)}
											onclick={() => toggleBenchmark(asset.id)}
											aria-label={isBenchmark(asset.id)
												? `${asset.name} is the current benchmark. Click to remove.`
												: `Set ${asset.name} as benchmark`}
										>
											{#if isBenchmark(asset.id)}
												<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<circle cx="12" cy="12" r="10"/>
												</svg>
											{:else}
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
													<circle cx="12" cy="12" r="10"/>
												</svg>
											{/if}
										</button>
									</td>
									<td>
										<span class="asset-name-cell">
											<a href="/assets/{slugify(asset.name)}" class="asset-name">{asset.name}</a>
											{#if asset.health.warnings.length > 0}
												<span class="warning-badge" title={asset.health.warnings.map((w) => w.message).join('\n')}>
													<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
														<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
														<line x1="12" y1="9" x2="12" y2="13"/>
														<line x1="12" y1="17" x2="12.01" y2="17"/>
													</svg>
													{asset.health.warnings.length}
												</span>
											{/if}
										</span>
									</td>
									<td class="mono">{asset.isin ?? '\u2014'}</td>
									<td>{asset.currency}</td>
									<td class="mono num-col" class:metric-negative={asset.health.annualizedReturn < -0.1}>
										{asset.dataPoints >= 2 ? (asset.health.annualizedReturn * 100).toFixed(1) + '%' : '\u2014'}
									</td>
									<td class="mono num-col" class:metric-warning={asset.health.volatility > 0.8}>
										{asset.dataPoints >= 2 ? (asset.health.volatility * 100).toFixed(1) + '%' : '\u2014'}
									</td>
									<td class="mono num-col">{asset.dataPoints.toLocaleString()}</td>
									<td class="muted">{asset.dateRange}</td>
									<td>
										<Button variant="ghost" size="sm" onclick={() => handleDelete(asset.id)}>
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<polyline points="3 6 5 6 21 6"/>
												<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
											</svg>
										</Button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		{/if}
	</section>

	<FormatConfigModal
		bind:open={showFormatModal}
		bind:detectedFormat
		preview={csvPreview}
		onconfirm={handleImportConfirm}
		bind:assetName
		bind:assetCurrency
		title={totalFiles > 1 ? `CSV Import (${currentFileIndex + 1} of ${totalFiles})` : 'CSV Import Configuration'}
	/>
</div>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div class="toast">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
					<polyline points="22 4 12 14.01 9 11.01"/>
				</svg>
				<span>{toast.message}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.assets-page {
		max-width: 1100px;
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

	.upload-section {
		margin-bottom: var(--spacing-xl);
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
		font-size: var(--font-size-lg);
	}

	.empty-state p {
		font-size: var(--font-size-sm);
	}

	.table-wrapper {
		overflow-x: auto;
	}

	.asset-table {
		font-size: var(--font-size-sm);
	}

	.asset-table th {
		font-weight: 600;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
	}

	.asset-table td {
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	.asset-name {
		font-weight: 500;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
	}

	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.bm-col {
		width: 40px;
		text-align: center;
		padding-left: var(--spacing-sm);
		padding-right: 0;
	}

	.bm-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		color: var(--color-text-muted);
		transition: color var(--transition-fast), background var(--transition-fast);
	}

	.bm-toggle:hover {
		color: var(--color-accent);
		background: rgba(141, 208, 196, 0.1);
	}

	.bm-toggle.active {
		color: var(--color-accent);
	}

	.benchmark-row {
		background: rgba(141, 208, 196, 0.05);
	}

	.num-col {
		text-align: right;
	}

	.asset-name-cell {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.warning-badge {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: var(--color-warning, #e6a817);
		font-size: var(--font-size-xs);
		font-weight: 600;
		cursor: help;
	}

	.warning-badge svg {
		flex-shrink: 0;
	}

	.metric-negative {
		color: var(--color-negative, #e55);
	}

	.metric-warning {
		color: var(--color-warning, #e6a817);
	}

	.has-warnings td:first-child {
		border-left: 2px solid var(--color-warning, #e6a817);
	}

	:global(.toast-container) {
		position: fixed;
		bottom: var(--spacing-lg);
		right: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		z-index: 1000;
	}

	:global(.toast) {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
		font-size: var(--font-size-sm);
		color: var(--color-text-primary);
		animation: toast-slide-in 0.3s ease-out;
		backdrop-filter: blur(12px);
	}

	:global(.toast svg) {
		color: var(--color-accent);
		flex-shrink: 0;
	}

	@keyframes toast-slide-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.lookup-section {
		margin-bottom: var(--spacing-xl);
	}

	.lookup-header {
		margin-bottom: var(--spacing-md);
	}

	.lookup-header h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-bottom: var(--spacing-xs);
	}

	.lookup-subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.lookup-input-row {
		display: flex;
		gap: var(--spacing-sm);
		align-items: flex-start;
	}

	.lookup-field {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.lookup-input {
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
		font-family: var(--font-mono);
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		letter-spacing: 0.05em;
		transition: border-color var(--transition-fast);
	}

	.lookup-input:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.lookup-input:disabled {
		opacity: 0.6;
	}

	.lookup-hint {
		font-size: var(--font-size-xs);
	}

	.lookup-hint.valid {
		color: var(--color-accent);
	}

	.lookup-hint.invalid {
		color: var(--color-text-muted);
	}

	.lookup-error {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		background: rgba(232, 23, 93, 0.08);
		border: 1px solid rgba(232, 23, 93, 0.2);
		border-radius: var(--radius-sm);
		color: var(--color-negative, #e55);
		font-size: var(--font-size-sm);
	}

	.lookup-error svg {
		flex-shrink: 0;
		margin-top: 1px;
	}

	.lookup-preview {
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.preview-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
	}

	.preview-label {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.preview-input {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
	}

	.preview-input:focus {
		outline: none;
		border-color: var(--color-accent);
	}

	.preview-input--short {
		max-width: 120px;
	}

	.preview-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
	}

	.preview-actions {
		display: flex;
		gap: var(--spacing-sm);
	}
</style>
