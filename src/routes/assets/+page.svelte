<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import FileDropzone from '$lib/components/shared/FileDropzone.svelte';
	import FormatConfigModal from '$lib/components/shared/FormatConfigModal.svelte';

	let showFormatModal = $state(false);
	let csvPreview: string[][] = $state([]);
	let detectedFormat = $state({
		delimiter: ',',
		decimalSeparator: '.',
		dateFormat: 'YYYY-MM-DD',
		hasHeader: true,
		dateColumn: 0,
		closeColumn: 1
	});

	// Placeholder asset data
	const assets: Array<{
		id: string;
		name: string;
		isin: string | null;
		currency: string;
		dataPoints: number;
		dateRange: string;
	}> = [];

	function handleFiles(files: FileList) {
		// TODO: integrate with CSV parser from dev-core
		showFormatModal = true;
	}

	function handleImportConfirm() {
		// TODO: parse and store asset
		showFormatModal = false;
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
		{#if assets.length === 0}
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
							{#each assets as asset}
								<tr>
									<td>
										<a href="/assets/{asset.id}" class="asset-name">{asset.name}</a>
									</td>
									<td class="mono">{asset.isin ?? '\u2014'}</td>
									<td>{asset.currency}</td>
									<td class="mono">{asset.dataPoints.toLocaleString()}</td>
									<td class="muted">{asset.dateRange}</td>
									<td>
										<Button variant="ghost" size="sm">
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<circle cx="12" cy="12" r="1"/>
												<circle cx="19" cy="12" r="1"/>
												<circle cx="5" cy="12" r="1"/>
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
