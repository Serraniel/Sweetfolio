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

	// Keep a local working copy so rapid edits don't lose changes during debounce.
	// Initialized via $effect to stay reactive when the prop updates from the store.
	let workingStrategy = $state<Strategy>(undefined!);
	$effect(() => {
		workingStrategy = strategy;
	});

	function save(updated: Strategy) {
		workingStrategy = updated;
		debouncedSave(updated);
	}

	function updateNode(nodeId: string, changes: Partial<StrategyNode>): void {
		const newRoot = applyUpdate(workingStrategy.root, nodeId, changes);
		if (!newRoot) return;
		const updated = { ...workingStrategy, root: newRoot as StrategyGroupNode, updatedAt: new Date().toISOString() };
		save(updated);
	}

	function removeNode(nodeId: string): void {
		const newRoot = applyRemove(workingStrategy.root, nodeId);
		if (!newRoot) return;
		const updated = { ...workingStrategy, root: newRoot, updatedAt: new Date().toISOString() };
		save(updated);
	}

	function addChildToNode(parentId: string, child: StrategyNode): void {
		const parent = findNode(workingStrategy.root, parentId);
		if (!parent || parent.type !== 'group') return;
		const newChildren = normalizeChildren([...parent.children, child]) as StrategyNode[];
		const newRoot = applyUpdate(workingStrategy.root, parentId, { children: newChildren } as Partial<StrategyGroupNode>);
		if (!newRoot) return;
		const updated = { ...workingStrategy, root: newRoot as StrategyGroupNode, updatedAt: new Date().toISOString() };
		save(updated);
	}

	function findNode(node: StrategyNode, id: string): StrategyNode | null {
		if (node.id === id) return node;
		if (node.type === 'group') {
			for (const child of node.children) {
				const found = findNode(child, id);
				if (found) return found;
			}
		}
		return null;
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

	function addToRoot(type: 'group' | 'asset', assetId?: string) {
		const child: StrategyNode = type === 'group'
			? { type: 'group', id: crypto.randomUUID(), label: 'New Group', weight: 1, children: [] }
			: { type: 'leaf', id: crypto.randomUUID(), assetId: assetId!, weight: 1 };
		const newChildren = normalizeChildren([...workingStrategy.root.children, child]) as StrategyNode[];
		const newRoot = { ...workingStrategy.root, children: newChildren };
		const updated = { ...workingStrategy, root: newRoot, updatedAt: new Date().toISOString() };
		save(updated);
	}

	let showRootAssetPicker = $state(false);
	let showRootAddMenu = $state(false);
</script>

<div class="tree-editor" role="tree">
	<div class="root-label">
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm2 6a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 01-1 1H7a1 1 0 01-1-1v-2zm3 6a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z" />
		</svg>
		<span class="root-name">{workingStrategy.root.label}</span>
	</div>

	{#if workingStrategy.root.children.length === 0}
		<div class="empty-tree">
			<p>No allocations yet. Add your first group or asset to start building your strategy.</p>
		</div>
	{:else}
		{#each workingStrategy.root.children as child (child.id)}
			<StrategyTreeNode
				node={child}
				depth={1}
				{assets}
				onupdate={updateNode}
				onremove={removeNode}
				onaddchild={addChildToNode}
			/>
		{/each}
	{/if}

	<div class="root-add-row">
		<div class="add-menu-wrapper">
			<button class="add-root-btn" onclick={() => (showRootAddMenu = !showRootAddMenu)}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				Add
			</button>
			{#if showRootAddMenu}
				<div class="add-dropdown">
					<button class="dropdown-item" onclick={() => { addToRoot('group'); showRootAddMenu = false; }}>Add Group</button>
					<button class="dropdown-item" onclick={() => { showRootAssetPicker = true; showRootAddMenu = false; }}>Add Asset</button>
				</div>
			{/if}
		</div>
	</div>

	{#if showRootAssetPicker}
		<div class="root-asset-picker">
			{#each assets as asset}
				<button class="asset-option" onclick={() => { addToRoot('asset', asset.id); showRootAssetPicker = false; }}>
					{asset.name}
				</button>
			{/each}
			<button class="asset-option cancel" onclick={() => (showRootAssetPicker = false)}>Cancel</button>
		</div>
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
	}

	.root-add-row {
		display: flex;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.add-menu-wrapper {
		position: relative;
	}

	.add-root-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		background: none;
		transition: color var(--transition-fast), border-color var(--transition-fast);
	}

	.add-root-btn:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.add-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 10;
		background: var(--color-bg-secondary);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 120px;
		overflow: hidden;
		margin-top: 2px;
	}

	.dropdown-item {
		display: block;
		width: 100%;
		padding: var(--spacing-xs) var(--spacing-md);
		font-size: var(--font-size-sm);
		text-align: left;
		cursor: pointer;
		background: none;
		border: none;
		color: var(--color-text-primary);
	}

	.dropdown-item:hover {
		background: var(--color-bg-tertiary);
	}

	.root-asset-picker {
		display: flex;
		flex-direction: column;
		margin: 0 var(--spacing-sm);
		background: var(--color-bg-secondary);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-sm);
		max-height: 200px;
		overflow-y: auto;
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

	.asset-option.cancel {
		color: var(--color-text-muted);
		border-top: 1px solid var(--color-border);
	}
</style>
