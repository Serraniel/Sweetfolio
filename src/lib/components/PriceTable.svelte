<script lang="ts">
	/** Paged, editable price data (AM-8). */
	import type { Asset, PricePoint } from '#lib/domain/types.ts';
	import { normalizeSeries } from '#lib/core/series.ts';
	import { isISODate } from '#lib/core/dates.ts';
	import * as fmt from '#lib/format.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';

	let { asset, onsave }: { asset: Asset; onsave: (prices: PricePoint[]) => Promise<void> } = $props();
	const PAGE = 25;
	let page = $state(0);
	let editing = $state<string | null>(null);
	let editValue = $state('');
	let adding = $state(false);
	let newDate = $state('');
	let newClose = $state('');
	let error = $state<string | null>(null);

	const desc = $derived([...asset.prices].reverse());
	const pages = $derived(Math.max(1, Math.ceil(desc.length / PAGE)));
	const visible = $derived(desc.slice(page * PAGE, page * PAGE + PAGE));

	async function saveEdit(date: string) {
		const v = fmt.parseInput(editValue);
		if (v === null || v <= 0) {
			error = 'Enter a positive number.';
			return;
		}
		await onsave(asset.prices.map((p) => (p.date === date ? { date, close: v } : p)));
		editing = null;
		error = null;
	}

	async function remove(date: string) {
		await onsave(asset.prices.filter((p) => p.date !== date));
	}

	async function add() {
		const v = fmt.parseInput(newClose);
		if (!isISODate(newDate) || v === null || v <= 0) {
			error = 'Enter a valid date and a positive price.';
			return;
		}
		await onsave(normalizeSeries([...asset.prices, { date: newDate, close: v }]));
		adding = false;
		newDate = '';
		newClose = '';
		error = null;
	}
</script>

<div class="stack" style="--gap: 12px">
	<div class="spread">
		<span class="small muted">{asset.prices.length} prices</span>
		<Button size="sm" icon="plus" onclick={() => (adding = !adding)}>Add price</Button>
	</div>
	{#if adding}
		<div class="row add">
			<input class="input" type="date" bind:value={newDate} aria-label="Date" />
			<input class="input" type="text" inputmode="decimal" bind:value={newClose} placeholder="Close" aria-label="Close price" />
			<Button size="sm" variant="primary" onclick={add}>Save</Button>
		</div>
	{/if}
	{#if error}<p class="error-text">{error}</p>{/if}
	<div class="scroll-x">
		<table class="table">
			<thead
				><tr><th>Date</th><th class="right">Close ({asset.currency})</th><th class="right"><span class="sr-only">Actions</span></th></tr
				></thead
			>
			<tbody>
				{#each visible as p (p.date)}
					<tr>
						<td>{fmt.date(p.date)}</td>
						<td class="right num">
							{#if editing === p.date}
								<input
									class="input edit"
									type="text"
									inputmode="decimal"
									bind:value={editValue}
									aria-label="New close"
									onkeydown={(e) => e.key === 'Enter' && saveEdit(p.date)}
								/>
							{:else}{fmt.num(p.close, 4, 2)}{/if}
						</td>
						<td class="right acts">
							{#if editing === p.date}
								<button aria-label="Save" onclick={() => saveEdit(p.date)}><Icon name="check" size={16} /></button>
								<button aria-label="Cancel" onclick={() => (editing = null)}><Icon name="x" size={16} /></button>
							{:else}
								<button
									aria-label="Edit price of {p.date}"
									onclick={() => {
										editing = p.date;
										editValue = String(p.close);
									}}><Icon name="edit" size={16} /></button
								>
								<button aria-label="Delete price of {p.date}" onclick={() => remove(p.date)}><Icon name="trash" size={16} /></button>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if pages > 1}
		<div class="row pager">
			<Button size="sm" variant="ghost" icon="chevronLeft" disabled={page === 0} onclick={() => page--} aria-label="Newer" />
			<span class="small muted">Page {page + 1} of {pages}</span>
			<Button size="sm" variant="ghost" icon="chevronRight" disabled={page >= pages - 1} onclick={() => page++} aria-label="Older" />
		</div>
	{/if}
</div>

<style>
	.add {
		flex-wrap: nowrap;
	}
	.add .input {
		min-width: 0;
	}
	.edit {
		width: 110px;
		min-height: 30px;
		padding: 2px 8px;
		text-align: right;
	}
	.acts button {
		border: none;
		background: none;
		color: var(--muted);
		padding: 4px;
	}
	.acts button:hover {
		color: var(--accent);
	}
	.acts {
		white-space: nowrap;
	}
	.pager {
		justify-content: center;
	}
</style>
