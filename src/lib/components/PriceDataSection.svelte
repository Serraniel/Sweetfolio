<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import FormatConfigModal from '$lib/components/shared/FormatConfigModal.svelte';
	import { updateAsset } from '$lib/stores/assets';
	import { parseCSV } from '$lib/parsers/normalization';
	import { parseCSVRows } from '$lib/parsers/csv';
	import type { Asset, DetectedFormat, PricePoint } from '$lib/types';

	const PAGE_SIZE = 50;
	const RAW_CSV_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

	let { asset }: { asset: Asset } = $props();

	let currentPage = $state(0);
	let editingIndex: number | null = $state(null);
	let editDate = $state('');
	let editClose = $state('');
	let addingRow = $state(false);
	let addDate = $state('');
	let addClose = $state('');

	// Re-parse modal state
	let showReparseModal = $state(false);
	let reparseFormat: DetectedFormat = $state({
		delimiter: ',',
		decimalSeparator: '.',
		dateFormat: 'YYYY-MM-DD',
		hasHeader: true,
		dateColumn: 0,
		closeColumn: 1
	});
	let reparsePreview: string[][] = $state([]);
	let reparseName = $state('');
	let reparseCurrency = $state('');

	const rawCSVAvailable = $derived(
		!!asset.rawCSV && !!asset.rawCSVStoredAt && !isExpired(asset.rawCSVStoredAt)
	);

	const rawCSVExpiryDate = $derived(
		asset.rawCSVStoredAt
			? new Date(new Date(asset.rawCSVStoredAt).getTime() + RAW_CSV_TTL_MS).toLocaleDateString()
			: null
	);

	function isExpired(storedAt: string): boolean {
		return Date.now() - new Date(storedAt).getTime() > RAW_CSV_TTL_MS;
	}

	// Purge expired raw CSV on mount
	$effect(() => {
		if (asset.rawCSV && asset.rawCSVStoredAt && isExpired(asset.rawCSVStoredAt)) {
			updateAsset({
				...asset,
				rawCSV: null,
				rawCSVStoredAt: null,
				updatedAt: new Date().toISOString()
			});
		}
	});

	const totalPages = $derived(Math.max(1, Math.ceil(asset.prices.length / PAGE_SIZE)));
	const pagedPrices = $derived(
		asset.prices.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
	);
	const startIndex = $derived(currentPage * PAGE_SIZE);

	function startEdit(globalIndex: number, price: PricePoint) {
		editingIndex = globalIndex;
		editDate = price.date;
		editClose = String(price.close);
		addingRow = false;
	}

	function cancelEdit() {
		editingIndex = null;
		editDate = '';
		editClose = '';
	}

	async function saveEdit() {
		if (editingIndex === null) return;
		const close = parseFloat(editClose);
		if (!editDate || isNaN(close)) return;

		const newPrices = [...asset.prices];
		newPrices[editingIndex] = { date: editDate, close };
		newPrices.sort((a, b) => a.date.localeCompare(b.date));

		await updateAsset({
			...asset,
			prices: newPrices,
			updatedAt: new Date().toISOString()
		});
		cancelEdit();
	}

	async function deleteRow(globalIndex: number) {
		const price = asset.prices[globalIndex];
		if (!confirm(`Delete price point ${price.date} = ${price.close}?`)) return;

		const newPrices = asset.prices.filter((_, i) => i !== globalIndex);
		await updateAsset({
			...asset,
			prices: newPrices,
			updatedAt: new Date().toISOString()
		});
	}

	function startAdd() {
		addingRow = true;
		addDate = '';
		addClose = '';
		editingIndex = null;
	}

	function cancelAdd() {
		addingRow = false;
		addDate = '';
		addClose = '';
	}

	async function saveAdd() {
		const close = parseFloat(addClose);
		if (!addDate || isNaN(close)) return;

		const newPrices = [...asset.prices, { date: addDate, close }];
		newPrices.sort((a, b) => a.date.localeCompare(b.date));

		await updateAsset({
			...asset,
			prices: newPrices,
			updatedAt: new Date().toISOString()
		});
		cancelAdd();
	}

	function openReparse() {
		if (!asset.rawCSV) return;
		const fmt = asset.formatConfig ?? {
			delimiter: ',',
			decimalSeparator: '.',
			dateFormat: 'YYYY-MM-DD',
			hasHeader: true,
			dateColumn: 0,
			closeColumn: 1
		};
		reparseFormat = { ...fmt };
		reparsePreview = parseCSVRows(asset.rawCSV, fmt.delimiter).slice(0, 10);
		reparseName = asset.name;
		reparseCurrency = asset.currency;
		showReparseModal = true;
	}

	async function handleReparseConfirm() {
		if (!asset.rawCSV) return;
		const result = parseCSV(asset.rawCSV, reparseFormat);

		if (result.prices.length === 0) {
			if (!confirm('Re-parse produced 0 data points. Save anyway?')) return;
		}

		await updateAsset({
			...asset,
			name: reparseName || asset.name,
			currency: reparseCurrency || asset.currency,
			prices: result.prices,
			formatConfig: result.detectedFormat,
			rawCSVStoredAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});

		showReparseModal = false;
		currentPage = 0;
	}

	function formatLabel(key: string, value: string | number | boolean): string {
		if (key === 'delimiter') {
			if (value === ';') return 'Semicolon (;)';
			if (value === ',') return 'Comma (,)';
			if (value === '\t') return 'Tab';
			return String(value);
		}
		if (key === 'decimalSeparator') {
			return value === ',' ? 'Comma (1.234,56)' : 'Period (1,234.56)';
		}
		return String(value);
	}
</script>

<section class="price-data-section">
	<div class="section-header">
		<h2>Price Data</h2>
		<div class="section-actions">
			{#if rawCSVAvailable}
				<Button variant="default" size="sm" onclick={openReparse}>Re-parse CSV</Button>
			{/if}
			<Button variant="default" size="sm" onclick={startAdd}>Add Row</Button>
		</div>
	</div>

	{#if asset.formatConfig}
		<div class="format-info">
			<span class="format-tag">
				Delimiter: {formatLabel('delimiter', asset.formatConfig.delimiter)}
			</span>
			<span class="format-tag">
				Decimal: {formatLabel('decimalSeparator', asset.formatConfig.decimalSeparator)}
			</span>
			<span class="format-tag">
				Date: {asset.formatConfig.dateFormat}
			</span>
			<span class="format-tag">
				Columns: date={asset.formatConfig.dateColumn}, close={asset.formatConfig.closeColumn}
			</span>
			{#if rawCSVAvailable}
				<span class="format-tag raw-csv-tag">Raw CSV stored (expires {rawCSVExpiryDate})</span>
			{:else if asset.rawCSVStoredAt}
				<span class="format-tag raw-csv-expired">Raw CSV expired</span>
			{/if}
		</div>
	{/if}

	<Card>
		<div class="table-wrapper">
			<table class="price-table">
				<thead>
					<tr>
						<th class="row-num">#</th>
						<th>Date</th>
						<th class="num-col">Close</th>
						<th class="actions-col">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#if addingRow}
						<tr class="editing-row">
							<td class="row-num">+</td>
							<td>
								<input type="date" class="inline-input" bind:value={addDate} />
							</td>
							<td class="num-col">
								<input
									type="number"
									class="inline-input inline-input--num"
									step="any"
									bind:value={addClose}
									onkeydown={(e) => { if (e.key === 'Enter') saveAdd(); if (e.key === 'Escape') cancelAdd(); }}
								/>
							</td>
							<td class="actions-col">
								<Button variant="primary" size="sm" onclick={saveAdd}>Save</Button>
								<Button variant="ghost" size="sm" onclick={cancelAdd}>Cancel</Button>
							</td>
						</tr>
					{/if}
					{#each pagedPrices as price, i}
						{@const globalIndex = startIndex + i}
						{#if editingIndex === globalIndex}
							<tr class="editing-row">
								<td class="row-num mono">{globalIndex + 1}</td>
								<td>
									<input type="date" class="inline-input" bind:value={editDate} />
								</td>
								<td class="num-col">
									<input
										type="number"
										class="inline-input inline-input--num"
										step="any"
										bind:value={editClose}
										onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
									/>
								</td>
								<td class="actions-col">
									<Button variant="primary" size="sm" onclick={saveEdit}>Save</Button>
									<Button variant="ghost" size="sm" onclick={cancelEdit}>Cancel</Button>
								</td>
							</tr>
						{:else}
							<tr>
								<td class="row-num mono">{globalIndex + 1}</td>
								<td class="mono">{price.date}</td>
								<td class="mono num-col">{price.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
								<td class="actions-col">
									<button class="icon-btn" title="Edit" onclick={() => startEdit(globalIndex, price)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
											<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
										</svg>
									</button>
									<button class="icon-btn icon-btn--danger" title="Delete" onclick={() => deleteRow(globalIndex)}>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="3 6 5 6 21 6"/>
											<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
										</svg>
									</button>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>

		{#if totalPages > 1}
			<div class="pagination">
				<span class="pagination-info">
					Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, asset.prices.length)} of {asset.prices.length.toLocaleString()}
				</span>
				<div class="pagination-controls">
					<Button variant="ghost" size="sm" disabled={currentPage === 0} onclick={() => currentPage--}>Prev</Button>
					<span class="pagination-page">{currentPage + 1} / {totalPages}</span>
					<Button variant="ghost" size="sm" disabled={currentPage >= totalPages - 1} onclick={() => currentPage++}>Next</Button>
				</div>
			</div>
		{/if}
	</Card>

	<FormatConfigModal
		bind:open={showReparseModal}
		bind:detectedFormat={reparseFormat}
		preview={reparsePreview}
		onconfirm={handleReparseConfirm}
		bind:assetName={reparseName}
		bind:assetCurrency={reparseCurrency}
		title="Re-parse CSV"
		confirmLabel="Re-parse"
	/>
</section>

<style>
	.price-data-section {
		margin-top: var(--spacing-xl);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.section-header h2 {
		font-size: var(--font-size-lg);
		margin: 0;
	}

	.section-actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.format-info {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-md);
	}

	.format-tag {
		font-size: var(--font-size-xs);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		background: var(--color-bg-tertiary);
		color: var(--color-text-muted);
	}

	.raw-csv-tag {
		background: rgba(141, 208, 196, 0.1);
		color: var(--color-accent);
	}

	.raw-csv-expired {
		background: rgba(232, 23, 93, 0.08);
		color: var(--color-text-muted);
	}

	.table-wrapper {
		overflow-x: auto;
	}

	.price-table {
		font-size: var(--font-size-sm);
		width: 100%;
	}

	.price-table th {
		font-weight: 600;
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		border-bottom: 1px solid var(--color-border);
	}

	.price-table td {
		border-bottom: 1px solid var(--color-border);
		vertical-align: middle;
	}

	.row-num {
		width: 50px;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.num-col {
		text-align: right;
	}

	.actions-col {
		width: 80px;
		text-align: right;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		transition: color var(--transition-fast), background var(--transition-fast);
	}

	.icon-btn:hover {
		color: var(--color-accent);
		background: rgba(141, 208, 196, 0.1);
	}

	.icon-btn--danger:hover {
		color: var(--color-negative, #e55);
		background: rgba(232, 23, 93, 0.08);
	}

	.editing-row {
		background: rgba(141, 208, 196, 0.05);
	}

	.inline-input {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		font-family: var(--font-mono);
		background: var(--color-bg-primary);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		color: var(--color-text-primary);
		width: 100%;
	}

	.inline-input--num {
		text-align: right;
		max-width: 160px;
	}

	.inline-input:focus {
		outline: none;
		box-shadow: 0 0 0 2px rgba(141, 208, 196, 0.2);
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-sm) var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.pagination-info {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.pagination-controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.pagination-page {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		min-width: 60px;
		text-align: center;
	}
</style>
