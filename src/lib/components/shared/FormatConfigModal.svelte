<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import { ASSET_CLASSIFICATIONS, type AssetClassification } from '$lib/types';

	const currencies = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK'];

	let {
		open = $bindable(false),
		detectedFormat = $bindable({
			delimiter: ',',
			decimalSeparator: '.',
			dateFormat: 'YYYY-MM-DD',
			hasHeader: true,
			dateColumn: 0,
			closeColumn: 1
		}),
		preview = [],
		onconfirm,
		assetName = $bindable(''),
		assetCurrency = $bindable('EUR'),
		assetClassification = $bindable('unknown' as AssetClassification),
		title = 'CSV Import Configuration',
		confirmLabel = 'Import'
	}: {
		open?: boolean;
		detectedFormat?: {
			delimiter: string;
			decimalSeparator: string;
			dateFormat: string;
			hasHeader: boolean;
			dateColumn: number;
			closeColumn: number;
		};
		preview?: string[][];
		onconfirm?: () => void;
		assetName?: string;
		assetCurrency?: string;
		assetClassification?: AssetClassification;
		title?: string;
		confirmLabel?: string;
	} = $props();

	const dateFormats = [
		'YYYY-MM-DD',
		'DD.MM.YYYY',
		'DD/MM/YYYY',
		'MM/DD/YYYY',
		'DD-MM-YYYY',
		'MM-DD-YYYY'
	];

	const delimiters = [
		{ value: ',', label: 'Comma (,)' },
		{ value: ';', label: 'Semicolon (;)' },
		{ value: '\t', label: 'Tab' }
	];

	const decimalSeparators = [
		{ value: '.', label: 'Period (1,234.56)' },
		{ value: ',', label: 'Comma (1.234,56)' }
	];
</script>

<Modal bind:open {title}>
	<div class="format-config">
		<div class="format-field">
			<label for="asset-name">Asset Name</label>
			<input id="asset-name" type="text" placeholder="e.g. MSCI World" bind:value={assetName} />
		</div>

		<div class="format-field">
			<label for="asset-currency">Currency</label>
			<select id="asset-currency" bind:value={assetCurrency}>
				{#each currencies as c}
					<option value={c}>{c}</option>
				{/each}
			</select>
		</div>

		<div class="format-field">
			<label for="asset-classification">Classification</label>
			<select id="asset-classification" bind:value={assetClassification}>
				{#each ASSET_CLASSIFICATIONS as cls}
					<option value={cls}>{cls.toUpperCase()}</option>
				{/each}
			</select>
		</div>

		<hr class="divider" />

		<div class="format-field">
			<label for="delimiter">Delimiter</label>
			<select id="delimiter" bind:value={detectedFormat.delimiter}>
				{#each delimiters as d}
					<option value={d.value}>{d.label}</option>
				{/each}
			</select>
		</div>

		<div class="format-field">
			<label for="date-format">Date Format</label>
			<select id="date-format" bind:value={detectedFormat.dateFormat}>
				{#each dateFormats as fmt}
					<option value={fmt}>{fmt}</option>
				{/each}
			</select>
		</div>

		<div class="format-field">
			<label for="decimal-sep">Decimal Separator</label>
			<select id="decimal-sep" bind:value={detectedFormat.decimalSeparator}>
				{#each decimalSeparators as sep}
					<option value={sep.value}>{sep.label}</option>
				{/each}
			</select>
		</div>

		<div class="format-field inline">
			<label>
				<input type="checkbox" bind:checked={detectedFormat.hasHeader} />
				First row is header
			</label>
		</div>

		<div class="format-row">
			<div class="format-field">
				<label for="date-col">Date Column</label>
				<input id="date-col" type="number" min="0" bind:value={detectedFormat.dateColumn} />
			</div>
			<div class="format-field">
				<label for="close-col">Price Column</label>
				<input id="close-col" type="number" min="0" bind:value={detectedFormat.closeColumn} />
			</div>
		</div>

		{#if preview.length > 0}
			<div class="preview">
				<h4>Preview</h4>
				<div class="preview-table-wrapper">
					<table class="preview-table">
						<tbody>
							{#each preview.slice(0, 5) as row, i}
								<tr class:header-row={i === 0 && detectedFormat.hasHeader}>
									{#each row as cell, j}
										<td
											class:date-col={j === detectedFormat.dateColumn}
											class:close-col={j === detectedFormat.closeColumn}
										>{cell}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => open = false}>Cancel</Button>
		<Button variant="primary" onclick={onconfirm} disabled={!assetName.trim()}>{confirmLabel}</Button>
	{/snippet}
</Modal>

<style>
	.format-config {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.format-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.format-field label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.format-field.inline label {
		flex-direction: row;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		cursor: pointer;
	}

	.format-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-md);
	}

	.divider {
		border: none;
		border-top: 1px solid var(--color-border);
		margin: var(--spacing-xs) 0;
	}

	.preview {
		margin-top: var(--spacing-md);
	}

	.preview h4 {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.preview-table-wrapper {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.preview-table {
		font-size: var(--font-size-xs);
		font-family: var(--font-mono);
	}

	.preview-table td {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.header-row td {
		font-weight: 600;
		background: var(--color-bg-tertiary);
	}

	.date-col {
		background: rgba(141, 208, 196, 0.1);
	}

	.close-col {
		background: rgba(26, 138, 138, 0.1);
	}
</style>
