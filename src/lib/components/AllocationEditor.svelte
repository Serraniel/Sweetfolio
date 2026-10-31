<script lang="ts">
	/** Weights editor: slider + numeric percent per asset (PM-1). */
	import type { Allocation, Asset } from '#lib/domain/types.ts';
	import * as fmt from '#lib/format.ts';
	import Icon from '#lib/ui/Icon.svelte';

	let { allocations = $bindable<Allocation[]>([]), assets }: { allocations?: Allocation[]; assets: readonly Asset[] } = $props();
	let adding = $state('');
	const byId = $derived(new Map(assets.map((a) => [a.id, a])));
	const total = $derived(allocations.reduce((s, a) => s + a.weight, 0));
	const available = $derived(
		assets.filter((a) => !allocations.some((x) => x.assetId === a.id)).sort((a, b) => a.name.localeCompare(b.name))
	);

	function setWeight(i: number, pct: number) {
		allocations = allocations.map((a, k) => (k === i ? { ...a, weight: Math.max(0, Math.min(100, pct)) / 100 } : a));
	}
	function remove(i: number) {
		allocations = allocations.filter((_, k) => k !== i);
	}
	function add() {
		if (!adding) return;
		const remaining = Math.max(0, 1 - total);
		allocations = [...allocations, { assetId: adding, weight: allocations.length ? remaining : 1 }];
		adding = '';
	}
	function normalize() {
		if (total > 0) allocations = allocations.map((a) => ({ ...a, weight: a.weight / total }));
	}
	function equal() {
		allocations = allocations.map((a) => ({ ...a, weight: 1 / allocations.length }));
	}
</script>

<div class="alloc">
	{#each allocations as a, i (a.assetId)}
		<div class="item">
			<div class="spread top">
				<span class="truncate small name">{byId.get(a.assetId)?.name ?? 'Unknown asset'}</span>
				<div class="row" style="--gap: 4px">
					<input
						class="input pct num"
						type="text"
						inputmode="decimal"
						aria-label="Weight of {byId.get(a.assetId)?.name} in percent"
						value={fmt.num(a.weight * 100, 2, 0)}
						onchange={(e) => setWeight(i, fmt.parseInput(e.currentTarget.value) ?? 0)}
					/>
					<span class="muted small">%</span>
					<button type="button" class="rm" aria-label="Remove {byId.get(a.assetId)?.name}" onclick={() => remove(i)}
						><Icon name="x" size={16} /></button
					>
				</div>
			</div>
			<input
				type="range"
				min="0"
				max="100"
				step="0.5"
				value={a.weight * 100}
				oninput={(e) => setWeight(i, Number(e.currentTarget.value))}
				aria-label="Weight slider"
			/>
		</div>
	{/each}
	<div class="row add">
		<select class="select" bind:value={adding} aria-label="Add asset">
			<option value="">Add asset…</option>
			{#each available as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
		</select>
		<button type="button" class="btn-add" disabled={!adding} onclick={add}><Icon name="plus" size={16} />Add</button>
	</div>
	<div class="spread total small">
		<span>Total <b class="num" class:neg={Math.abs(total - 1) > 0.0001 && allocations.length > 0}>{fmt.pct(total, 1)}</b></span>
		<span class="row" style="--gap: 12px">
			<button type="button" class="link" onclick={equal} disabled={!allocations.length}>Equal weights</button>
			<button type="button" class="link" onclick={normalize} disabled={!allocations.length}>Normalize to 100 %</button>
		</span>
	</div>
	{#if allocations.length && Math.abs(total - 1) > 0.0001}<p class="hint">Weights are normalized to 100 % when saving.</p>{/if}
</div>

<style>
	.alloc {
		display: grid;
		gap: 12px;
	}
	.item {
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.top {
		flex-wrap: nowrap;
	}
	.name {
		font-weight: 550;
	}
	.pct {
		width: 76px;
		min-height: 32px;
		padding: 4px 8px;
		text-align: right;
	}
	.rm {
		border: none;
		background: none;
		color: var(--muted);
		display: grid;
		padding: 4px;
	}
	.add {
		flex-wrap: nowrap;
	}
	.btn-add {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border: 1px solid var(--border-strong);
		background: var(--surface-solid);
		border-radius: 999px;
		padding: 8px 14px;
		font-weight: 600;
		font-size: var(--text-sm);
	}
	.btn-add:disabled {
		opacity: 0.5;
	}
	.link {
		border: none;
		background: none;
		color: var(--accent);
		padding: 0;
		font-size: inherit;
	}
	.link:disabled {
		color: var(--muted);
	}
</style>
