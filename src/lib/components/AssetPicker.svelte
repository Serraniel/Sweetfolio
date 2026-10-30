<script lang="ts">
	/** Searchable multi-select of assets. */
	import type { Asset } from '#lib/domain/types.ts';
	import Icon from '#lib/ui/Icon.svelte';

	let {
		assets,
		selected = $bindable<string[]>([]),
		max,
		warnings = new Map()
	}: { assets: readonly Asset[]; selected?: string[]; max?: number; warnings?: Map<string, string> } = $props();
	let query = $state('');
	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const list = q
			? assets.filter((a) => a.name.toLowerCase().includes(q) || a.isin?.toLowerCase().includes(q) || a.wkn?.toLowerCase().includes(q))
			: assets;
		return [...list].sort((a, b) => a.name.localeCompare(b.name));
	});

	function toggle(id: string) {
		if (selected.includes(id)) selected = selected.filter((x) => x !== id);
		else if (!max || selected.length < max) selected = [...selected, id];
	}
</script>

<div class="picker">
	<div class="search">
		<Icon name="search" size={16} />
		<input class="input" type="search" placeholder="Search assets" bind:value={query} aria-label="Search assets" />
	</div>
	<div class="row xs muted actions">
		<span>{selected.length} selected</span>
		<button type="button" class="link" onclick={() => (selected = filtered.map((a) => a.id).slice(0, max ?? Infinity))}>Select all</button>
		<button type="button" class="link" onclick={() => (selected = [])}>Clear</button>
	</div>
	<ul class="list">
		{#each filtered as a (a.id)}
			<li>
				<label class:checked={selected.includes(a.id)}>
					<input type="checkbox" checked={selected.includes(a.id)} onchange={() => toggle(a.id)} />
					<span class="truncate">{a.name}</span>
					{#if warnings.get(a.id)}<span class="warn" title={warnings.get(a.id)}><Icon name="alert" size={14} /></span>{/if}
					<span class="xs muted">{a.currency}</span>
				</label>
			</li>
		{:else}
			<li class="muted small none">No assets match.</li>
		{/each}
	</ul>
</div>

<style>
	.search {
		position: relative;
	}
	.search :global(.icon) {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--muted);
	}
	.search .input {
		padding-left: 36px;
	}
	.actions {
		margin: 8px 0;
	}
	.link {
		border: none;
		background: none;
		color: var(--accent);
		padding: 0;
		font-size: inherit;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 300px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	label {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		cursor: pointer;
		border-bottom: 1px solid var(--border);
	}
	li:last-child label {
		border-bottom: none;
	}
	label.checked {
		background: var(--accent-soft);
	}
	.warn {
		color: var(--warning);
		display: grid;
	}
	.none {
		padding: 12px;
	}
</style>
