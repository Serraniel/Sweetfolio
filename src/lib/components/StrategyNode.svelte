<script lang="ts">
	/** One node of the strategy tree editor (recursive) (ST-2). */
	import type { StrategyGroupNode, StrategyNode } from '#lib/domain/types.ts';
	import { childWeightSum } from '#lib/core/strategy.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Self from './StrategyNode.svelte';

	interface Ops {
		update: (id: string, patch: Partial<StrategyNode>) => void;
		remove: (id: string) => void;
		addGroup: (parentId: string) => void;
		addAsset: (parentId: string, assetId: string) => void;
		normalize: (id: string) => void;
	}

	let {
		node,
		depth = 0,
		absolute,
		ops,
		usedAssets
	}: { node: StrategyNode; depth?: number; absolute: Map<string, number>; ops: Ops; usedAssets: Set<string> } = $props();
	let collapsed = $state(false);
	let picking = $state(false);
	let pick = $state('');
	const sum = $derived(node.type === 'group' ? childWeightSum(node) : 1);
	const unbalanced = $derived(node.type === 'group' && node.children.length > 0 && Math.abs(sum - 1) > 1e-6);
	const available = $derived([...app.assets].filter((a) => !usedAssets.has(a.id)).sort((a, b) => a.name.localeCompare(b.name)));
</script>

<div class="node" style="--depth: {depth}">
	<div class="line" class:group={node.type === 'group'}>
		{#if node.type === 'group'}
			<button class="tgl" aria-label={collapsed ? 'Expand' : 'Collapse'} aria-expanded={!collapsed} onclick={() => (collapsed = !collapsed)}
				><Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={16} /></button
			>
			<input
				class="input label-in"
				value={node.label}
				aria-label="Group name"
				onchange={(e) => ops.update(node.id, { label: e.currentTarget.value } as Partial<StrategyGroupNode>)}
			/>
		{:else}
			<span class="leaf-dot" aria-hidden="true"></span>
			<a class="truncate leaf-name" href="/assets/{app.assetSlug(node.assetId)}"
				>{app.assetById.get(node.assetId)?.name ?? 'Unknown asset'}</a
			>
		{/if}
		{#if depth > 0}
			<div class="w">
				<input
					class="input pct num"
					inputmode="decimal"
					aria-label="Weight in percent"
					value={fmt.num(node.weight * 100, 2, 0)}
					onchange={(e) => ops.update(node.id, { weight: Math.max(0, (fmt.parseInput(e.currentTarget.value) ?? 0) / 100) })}
				/>
				<span class="xs muted">%</span>
			</div>
			<span class="abs xs muted num" title="Share of total">{fmt.pct(absolute.get(node.id) ?? 0, 1)}</span>
			<button class="ic" aria-label="Remove" onclick={() => ops.remove(node.id)}><Icon name="trash" size={15} /></button>
		{/if}
	</div>
	{#if node.type === 'group' && !collapsed}
		{#if unbalanced}
			<p class="warn xs">
				Children sum to {fmt.pct(sum, 1)} <button class="link" onclick={() => ops.normalize(node.id)}>Normalize</button>
			</p>
		{/if}
		<div class="children">
			{#each node.children as c (c.id)}
				<Self node={c} depth={depth + 1} {absolute} {ops} {usedAssets} />
			{/each}
			<div class="adders">
				<button class="add" onclick={() => ops.addGroup(node.id)}><Icon name="plus" size={14} />Group</button>
				{#if picking}
					<select
						class="select sm"
						bind:value={pick}
						aria-label="Asset to add"
						onchange={() => {
							if (pick) {
								ops.addAsset(node.id, pick);
								pick = '';
								picking = false;
							}
						}}
					>
						<option value="">Choose asset…</option>
						{#each available as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
					</select>
					<button class="add" onclick={() => (picking = false)}>Cancel</button>
				{:else}
					<button class="add" onclick={() => (picking = true)} disabled={!available.length}><Icon name="plus" size={14} />Asset</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.line {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto auto;
		align-items: center;
		gap: 6px;
		padding: 4px 0;
	}
	.children {
		margin-left: 10px;
		padding-left: 12px;
		border-left: 2px solid var(--border);
	}
	.tgl,
	.ic {
		border: none;
		background: none;
		color: var(--muted);
		display: grid;
		padding: 4px;
	}
	.ic:hover {
		color: var(--negative);
	}
	.label-in {
		min-height: 34px;
		padding: 4px 10px;
		font-weight: 600;
	}
	.leaf-dot {
		width: 8px;
		height: 8px;
		margin: 0 8px;
		border-radius: 50%;
		background: var(--accent);
	}
	.leaf-name {
		color: var(--text);
		font-size: var(--text-sm);
	}
	.w {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.pct {
		width: 68px;
		min-height: 32px;
		padding: 2px 8px;
		text-align: right;
	}
	.abs {
		width: 44px;
		text-align: right;
	}
	@media (max-width: 480px) {
		.abs {
			display: none;
		}
	}
	.adders {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		padding: 6px 0 10px;
	}
	.add {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border: 1px dashed var(--border-strong);
		background: none;
		border-radius: 999px;
		padding: 4px 10px;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-2);
	}
	.add:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.select.sm {
		min-height: 30px;
		padding: 2px 30px 2px 8px;
		font-size: var(--text-xs);
		width: auto;
		max-width: 220px;
	}
	.warn {
		color: var(--warning);
		margin: 2px 0 4px 28px;
	}
	.link {
		border: none;
		background: none;
		color: var(--accent);
		font-weight: 600;
		padding: 0;
		font-size: inherit;
	}
</style>
