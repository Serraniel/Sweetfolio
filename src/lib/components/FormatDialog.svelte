<script lang="ts" module>
	import type { AssetClassification as Cls } from '#lib/domain/types.ts';
	import type { PriceParseResult as PPR } from '#lib/parsers/price-csv.ts';

	export interface FormatDialogResult {
		result: PPR;
		name: string;
		currency: string;
		classification: Cls;
	}
</script>

<script lang="ts">
	/** CSV format review/correction with live preview (AM-3). */
	import {
		COMMON_CURRENCIES,
		DATE_FORMATS,
		ASSET_CLASSIFICATIONS,
		type AssetClassification,
		type DetectedFormat
	} from '#lib/domain/types.ts';
	import { parsePriceCSV, type PriceParseResult } from '#lib/parsers/price-csv.ts';
	import * as fmt from '#lib/format.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';

	let {
		open = $bindable(false),
		text,
		fileName = '',
		initialName = '',
		initialCurrency = 'EUR',
		initialFormat,
		showMeta = true,
		title = 'Check CSV format',
		queue,
		onconfirm,
		onskip
	}: {
		open?: boolean;
		text: string;
		fileName?: string;
		initialName?: string;
		initialCurrency?: string;
		initialFormat?: Partial<DetectedFormat>;
		showMeta?: boolean;
		title?: string;
		queue?: { index: number; total: number };
		onconfirm: (r: FormatDialogResult) => void;
		onskip?: () => void;
	} = $props();

	let override = $state<Partial<DetectedFormat>>({});
	let name = $state('');
	let currency = $state('EUR');
	let classification = $state<AssetClassification>('unknown');

	$effect(() => {
		void text;
		override = { ...(initialFormat ?? {}) };
		name = initialName || fileName.replace(/\.[^.]+$/, '');
		currency = initialCurrency;
		classification = 'unknown';
	});

	const result = $derived(text ? parsePriceCSV(text, override) : null);
	const columns = $derived(Math.max(0, ...(result?.preview ?? []).map((r) => r.length)));
	const headerNames = $derived(
		Array.from({ length: columns }, (_, i) => (result?.format.hasHeader ? result.preview[0]?.[i] : '') || `Column ${i + 1}`)
	);

	function set<K extends keyof DetectedFormat>(key: K, value: DetectedFormat[K]) {
		override = { ...override, [key]: value };
	}
	const DELIMS = [
		{ v: ';', l: 'Semicolon ;' },
		{ v: ',', l: 'Comma ,' },
		{ v: '\t', l: 'Tab' },
		{ v: '|', l: 'Pipe |' }
	];
</script>

<Dialog bind:open {title} size="lg">
	{#if result}
		<div class="stack">
			{#if queue && queue.total > 1}<p class="small muted">
					File {queue.index + 1} of {queue.total}: <b>{fileName}</b>
				</p>{:else if fileName}<p class="small muted">{fileName}</p>{/if}
			{#if result.format.ambiguous}
				<p class="warn small">The date format is ambiguous (day/month vs month/day). Please confirm it.</p>
			{/if}
			{#if showMeta}
				<div class="grid" style="--min: 180px">
					<div><label class="label" for="fd-name">Name</label><input id="fd-name" class="input" bind:value={name} /></div>
					<div>
						<label class="label" for="fd-cur">Currency</label>
						<select id="fd-cur" class="select" bind:value={currency}>
							{#each COMMON_CURRENCIES as c (c)}<option>{c}</option>{/each}
						</select>
					</div>
					<div>
						<label class="label" for="fd-cls">Type</label>
						<select id="fd-cls" class="select" bind:value={classification}>
							{#each ASSET_CLASSIFICATIONS as c (c)}<option value={c}>{c.toUpperCase()}</option>{/each}
						</select>
					</div>
				</div>
			{/if}
			<div class="grid" style="--min: 150px">
				<div>
					<label class="label" for="fd-del">Delimiter</label>
					<select id="fd-del" class="select" value={result.format.delimiter} onchange={(e) => set('delimiter', e.currentTarget.value)}>
						{#each DELIMS as d (d.v)}<option value={d.v}>{d.l}</option>{/each}
					</select>
				</div>
				<div>
					<label class="label" for="fd-dec">Decimal separator</label>
					<select
						id="fd-dec"
						class="select"
						value={result.format.decimalSeparator}
						onchange={(e) => set('decimalSeparator', e.currentTarget.value)}
					>
						<option value=",">Comma (1.234,56)</option>
						<option value=".">Point (1,234.56)</option>
					</select>
				</div>
				<div>
					<label class="label" for="fd-date">Date format</label>
					<select
						id="fd-date"
						class="select"
						value={result.format.dateFormat}
						onchange={(e) => set('dateFormat', e.currentTarget.value as DetectedFormat['dateFormat'])}
					>
						{#each DATE_FORMATS as d (d)}<option>{d}</option>{/each}
					</select>
				</div>
				<div>
					<label class="label" for="fd-dc">Date column</label>
					<select
						id="fd-dc"
						class="select"
						value={result.format.dateColumn}
						onchange={(e) => set('dateColumn', Number(e.currentTarget.value))}
					>
						{#each headerNames as h, i (i)}<option value={i}>{h}</option>{/each}
					</select>
				</div>
				<div>
					<label class="label" for="fd-cc">Price column</label>
					<select
						id="fd-cc"
						class="select"
						value={result.format.closeColumn}
						onchange={(e) => set('closeColumn', Number(e.currentTarget.value))}
					>
						{#each headerNames as h, i (i)}<option value={i}>{h}</option>{/each}
					</select>
				</div>
				<label class="row checkbox small"
					><input type="checkbox" checked={result.format.hasHeader} onchange={(e) => set('hasHeader', e.currentTarget.checked)} />First row
					is a header</label
				>
			</div>

			<div class="row" style="--gap: 6px">
				<Badge tone={result.prices.length ? 'accent' : 'negative'}>{result.prices.length} prices</Badge>
				{#if result.prices.length}<Badge>{fmt.date(result.prices[0]?.date)} – {fmt.date(result.prices.at(-1)?.date)}</Badge>{/if}
				{#if result.warnings.length}<Badge tone="warning">{result.warnings.length} warnings</Badge>{/if}
			</div>

			<div class="scroll-x preview">
				<table class="table">
					<tbody>
						{#each result.preview as row, r (r)}
							<tr class:header={r === 0 && result.format.hasHeader}>
								{#each Array.from({ length: columns }) as _, c (c)}
									<td class:date={c === result.format.dateColumn} class:close={c === result.format.closeColumn}>{row[c] ?? ''}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if result.warnings.length}
				<details class="small">
					<summary>Show warnings</summary>
					<ul>
						{#each result.warnings.slice(0, 50) as w, i (i)}<li>{w}</li>{/each}
					</ul>
				</details>
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		{#if onskip}<Button
				variant="ghost"
				onclick={() => {
					open = false;
					onskip?.();
				}}>Skip file</Button
			>{/if}
		<Button
			variant="primary"
			disabled={!result || result.prices.length < 2 || (showMeta && !name.trim())}
			onclick={() => {
				if (!result) return;
				open = false;
				onconfirm({ result, name: name.trim(), currency, classification });
			}}>Import</Button
		>
	{/snippet}
</Dialog>

<style>
	.warn {
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--warning-soft);
		color: var(--warning);
	}
	.checkbox {
		align-self: end;
		min-height: 40px;
	}
	.preview {
		max-height: 260px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.preview td {
		white-space: nowrap;
		padding: 6px 10px;
		font-family: var(--mono);
		font-size: var(--text-xs);
	}
	.preview tr.header td {
		font-weight: 700;
		font-family: var(--font);
	}
	td.date {
		background: var(--accent-soft);
	}
	td.close {
		background: color-mix(in srgb, var(--chart-4) 14%, transparent);
	}
</style>
