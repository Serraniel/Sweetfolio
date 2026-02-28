<script lang="ts">
	import type { Strategy, StrategyNode, StrategyGroupNode, Asset } from '$lib/types';
	import { normalizeChildren } from '$lib/engine/strategy';
	import StrategyTreeNode from './StrategyTreeNode.svelte';

	let {
		strategy,
		assets = [],
		onsave,
	}: {
		strategy: Strategy;
		assets?: Asset[];
		onsave: (updated: Strategy) => void;
	} = $props();

	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	function debouncedSave(updated: Strategy) {
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => onsave(updated), 300);
	}

	function updateNode(nodeId: string, changes: Partial<StrategyNode>): void {
		const newRoot = applyUpdate(strategy.root, nodeId, changes);
		if (!newRoot) return;
		const updated = { ...strategy, root: newRoot as StrategyGroupNode, updatedAt: new Date().toISOString() };
		debouncedSave(updated);
	}

	function removeNode(nodeId: string): void {
		const newRoot = applyRemove(strategy.root, nodeId);
		if (!newRoot) return;
		const updated = { ...strategy, root: newRoot, updatedAt: new Date().toISOString() };
		debouncedSave(updated);
	}

	function applyUpdate(node: StrategyNode, targetId: string, changes: Partial<StrategyNode>): StrategyNode | null {
		if (node.id === targetId) {
			const updated = { ...node, ...changes } as StrategyNode;
			// If weight changed and this node has a parent, normalization happens at parent level
			return updated;
		}
		if (node.type === 'group') {
			let changed = false;
			const newChildren = node.children.map((child) => {
				const result = applyUpdate(child, targetId, changes);
				if (result !== child) changed = true;
				return result ?? child;
			});

			if (!changed) return node;

			// If a weight was changed, normalize siblings
			const needsNormalize = 'weight' in changes;
			const finalChildren = needsNormalize ? normalizeAfterEdit(newChildren, targetId, changes.weight as number) : newChildren;

			return { ...node, children: finalChildren };
		}
		return node;
	}

	function normalizeAfterEdit(children: StrategyNode[], editedId: string, newWeight: number): StrategyNode[] {
		// Set the edited node's weight, distribute remaining weight proportionally among siblings
		const others = children.filter((c) => c.id !== editedId);
		const remainingWeight = Math.max(0, 1 - newWeight);
		const otherTotal = others.reduce((sum, c) => sum + c.weight, 0);

		return children.map((c) => {
			if (c.id === editedId) return { ...c, weight: newWeight };
			if (otherTotal === 0) return { ...c, weight: remainingWeight / others.length };
			return { ...c, weight: (c.weight / otherTotal) * remainingWeight };
		});
	}

	function applyRemove(root: StrategyGroupNode, targetId: string): StrategyGroupNode | null {
		function removeFromChildren(children: StrategyNode[]): StrategyNode[] | null {
			const filtered = children.filter((c) => c.id !== targetId);
			if (filtered.length < children.length) {
				return filtered.length > 0 ? normalizeChildren(filtered) as StrategyNode[] : null;
			}
			const result: StrategyNode[] = [];
			for (const child of filtered) {
				if (child.type === 'group') {
					const newChildren = removeFromChildren(child.children);
					if (newChildren === null) continue; // group became empty, remove it
					result.push({ ...child, children: newChildren });
				} else {
					result.push(child);
				}
			}
			return result.length > 0 ? normalizeChildren(result) as StrategyNode[] : null;
		}

		const newChildren = removeFromChildren(root.children);
		if (newChildren === null) return { ...root, children: [] };
		return { ...root, children: newChildren };
	}

	function addFirstNode(type: 'group' | 'asset', assetId?: string) {
		const child: StrategyNode = type === 'group'
			? { type: 'group', id: crypto.randomUUID(), label: 'New Group', weight: 1, children: [] }
			: { type: 'leaf', id: crypto.randomUUID(), assetId: assetId!, weight: 1 };
		const newRoot = { ...strategy.root, children: [...strategy.root.children, child] };
		const updated = { ...strategy, root: newRoot, updatedAt: new Date().toISOString() };
		debouncedSave(updated);
	}

	let showFirstAssetPicker = $state(false);
</script>

<div class="tree-editor" role="tree">
	<div class="root-label">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm2 6a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 01-1 1H7a1 1 0 01-1-1v-2zm3 6a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z" />
		</svg>
		<span class="root-name">{strategy.root.label}</span>
	</div>

	{#if strategy.root.children.length === 0}
		<div class="empty-tree">
			<p>No allocations yet. Add your first group or asset to start building your strategy.</p>
			<div class="empty-actions">
				<button class="add-first-btn" onclick={() => addFirstNode('group')}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					Add Group
				</button>
				<button class="add-first-btn" onclick={() => (showFirstAssetPicker = !showFirstAssetPicker)}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
					</svg>
					Add Asset
				</button>
			</div>
			{#if showFirstAssetPicker}
				<div class="first-asset-picker">
					{#each assets as asset}
						<button class="asset-option" onclick={() => { addFirstNode('asset', asset.id); showFirstAssetPicker = false; }}>
							{asset.name}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		{#each strategy.root.children as child (child.id)}
			<StrategyTreeNode
				node={child}
				depth={1}
				{assets}
				onupdate={updateNode}
				onremove={removeNode}
			/>
		{/each}
	{/if}
</div>

<style>
	.tree-editor {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.root-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm);
		color: var(--color-text-primary);
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.root-label svg {
		color: var(--color-accent);
	}

	.empty-tree {
		padding: var(--spacing-lg);
		text-align: center;
		color: var(--color-text-muted);
	}

	.empty-tree p {
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.empty-actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: center;
	}

	.add-first-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-accent);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		cursor: pointer;
		background: none;
		transition: background-color var(--transition-fast);
	}

	.add-first-btn:hover {
		background: rgba(141, 208, 196, 0.1);
	}

	.first-asset-picker {
		display: flex;
		flex-direction: column;
		margin-top: var(--spacing-sm);
		background: var(--color-bg-card);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-sm);
		max-height: 200px;
		overflow-y: auto;
		max-width: 280px;
		margin-inline: auto;
	}

	.asset-option {
		padding: var(--spacing-xs) var(--spacing-md);
		font-size: var(--font-size-sm);
		text-align: left;
		cursor: pointer;
		background: none;
		border: none;
		color: var(--color-text-primary);
	}

	.asset-option:hover {
		background: var(--color-bg-tertiary);
	}
</style>
