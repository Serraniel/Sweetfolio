<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import FileDropzone from '$lib/components/shared/FileDropzone.svelte';
	import FormatConfigModal from '$lib/components/shared/FormatConfigModal.svelte';
	import { assets, addAsset, removeAsset } from '$lib/stores/assets';
	import { detectFormat } from '$lib/parsers/format-detection';
	import { parseCSV } from '$lib/parsers/normalization';
	import { parseCSVRows } from '$lib/parsers/csv';
	import type { DetectedFormat } from '$lib/types';

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

	// Derive display list from store
	const assetList = $derived(
		$assets.map((a) => ({
			id: a.id,
			name: a.name,
			isin: a.isin,
			currency: a.currency,
			dataPoints: a.prices.length,
			dateRange:
				a.prices.length > 0
					? `${a.prices[0].date} \u2013 ${a.prices[a.prices.length - 1].date}`
					: ''
		}))
	);

	function handleFiles(files: FileList) {
		const file = files[0];
		if (!file) return;

		importFileName = file.name.replace(/\.csv$/i, '');
		assetName = importFileName;

		const reader = new FileReader();
		reader.onload = () => {
			rawText = reader.result as string;
			const fmt = detectFormat(rawText);
			detectedFormat = fmt;
			// Generate preview rows using detected delimiter
			csvPreview = parseCSVRows(rawText, fmt.delimiter).slice(0, 10);
			showFormatModal = true;
		};
		reader.readAsText(file);
	}

	async function handleImportConfirm() {
		const result = parseCSV(rawText, detectedFormat);

		const asset = {
			id: crypto.randomUUID(),
			name: assetName || importFileName,
			isin: null,
			wkn: null,
			currency: assetCurrency,
			prices: result.prices,
			formatConfig: result.detectedFormat,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		await addAsset(asset);

		showFormatModal = false;
		rawText = '';
		csvPreview = [];
		assetName = '';
	}

	async function handleDelete(id: string) {
		if (!confirm('Delete this asset? This cannot be undone.')) return;
		await removeAsset(id);
	}
</script>

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
								<th>Name</th>
								<th>ISIN</th>
								<th>Currency</th>
								<th>Data Points</th>
								<th>Date Range</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each assetList as asset}
								<tr>
									<td>
										<a href="/assets/{asset.id}" class="asset-name">{asset.name}</a>
									</td>
									<td class="mono">{asset.isin ?? '\u2014'}</td>
									<td>{asset.currency}</td>
									<td class="mono">{asset.dataPoints.toLocaleString()}</td>
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
	/>
</div>

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
</style>
