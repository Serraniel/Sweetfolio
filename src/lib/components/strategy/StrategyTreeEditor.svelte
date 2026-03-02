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
	// svelte-ignore state_referenced_locally
	let workingStrategy = $state<Strategy>(strategy);
	$effect(() => {
		workingStrategy = strategy;
	});

	// Undo/redo stacks
	let undoStack = $state<Strategy[]>([]);
	let redoStack = $state<Strategy[]>([]);
	const canUndo = $derived(undoStack.length > 0);
	const canRedo = $derived(redoStack.length > 0);

	function save(updated: Strategy, { pushUndo = true } = {}) {
		if (pushUndo) {
			undoStack = [...undoStack.slice(-19), workingStrategy];
			redoStack = [];
		}
		workingStrategy = updated;
		debouncedSave(updated);
	}

	function undo() {
		if (undoStack.length === 0) return;
		const previous = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		redoStack = [...redoStack, workingStrategy];
		workingStrategy = previous;
		debouncedSave(previous);
	}

	function redo() {
		if (redoStack.length === 0) return;
		const next = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, workingStrategy];
		workingStrategy = next;
		debouncedSave(next);
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
		const newChildren = [...parent.children, child];
		const newRoot = applyUpdate(workingStrategy.root, parentId, { children: newChildren } as Partial<StrategyGroupNode>);
		if (!newRoot) return;
		const updated = { ...workingStrategy, root: newRoot as StrategyGroupNode, updatedAt: new Date().toISOString() };
		save(updated);
	}

	function normalizeGroup(groupId: string): void {
		const group = findNode(workingStrategy.root, groupId);
		if (!group || group.type !== 'group' || group.children.length === 0) return;
		const normalized = normalizeChildren(group.children) as StrategyNode[];
		const newRoot = applyUpdate(workingStrategy.root, groupId, { children: normalized } as Partial<StrategyGroupNode>);
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
			return { ...node, ...changes } as StrategyNode;
		}
		if (node.type === 'group') {
			let changed = false;
			const newChildren = node.children.map((child) => {
				const result = applyUpdate(child, targetId, changes);
				if (result !== child) changed = true;
				return result ?? child;
			});

			if (!changed) return node;
			return { ...node, children: newChildren };
		}
		return node;
	}

	function applyRemove(root: StrategyGroupNode, targetId: string): StrategyGroupNode | null {
		function removeFromChildren(children: StrategyNode[]): StrategyNode[] | null {
			const filtered = children.filter((c) => c.id !== targetId);
			if (filtered.length < children.length) {
				return filtered.length > 0 ? filtered : null;
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
			return result.length > 0 ? result : null;
		}

		const newChildren = removeFromChildren(root.children);
		if (newChildren === null) return { ...root, children: [] };
		return { ...root, children: newChildren };
	}

	function addToRoot(type: 'group' | 'asset', assetId?: string) {
		const child: StrategyNode = type === 'group'
			? { type: 'group', id: crypto.randomUUID(), label: 'New Group', weight: 0, children: [] }
			: { type: 'leaf', id: crypto.randomUUID(), assetId: assetId!, weight: 0 };
		const newRoot = { ...workingStrategy.root, children: [...workingStrategy.root.children, child] };
		const updated = { ...workingStrategy, root: newRoot, updatedAt: new Date().toISOString() };
		save(updated);
	}

	function normalizeRoot(): void {
		if (workingStrategy.root.children.length === 0) return;
		const normalized = normalizeChildren(workingStrategy.root.children) as StrategyNode[];
		const newRoot = { ...workingStrategy.root, children: normalized };
		const updated = { ...workingStrategy, root: newRoot, updatedAt: new Date().toISOString() };
		save(updated);
	}

	let showRootAssetPicker = $state(false);
	let showRootAddMenu = $state(false);
</script>

<div class="tree-editor" role="tree">
	<div class="root-header">
		<div class="root-label">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm2 6a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 01-1 1H7a1 1 0 01-1-1v-2zm3 6a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z" />
			</svg>
			<span class="root-name">{workingStrategy.root.label}</span>
		</div>
		<div class="history-buttons">
			{#if canUndo}
				<button class="history-btn" onclick={undo} title="Undo">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="1 4 1 10 7 10" />
						<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
					</svg>
				</button>
			{/if}
			{#if canRedo}
				<button class="history-btn" onclick={redo} title="Redo">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="23 4 23 10 17 10" />
						<path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
					</svg>
				</button>
			{/if}
		</div>
	</div>

	{#if workingStrategy.root.children.length === 0}
		<div class="empty-tree">
			<p>No allocations yet. Add your first group or asset to start building your strategy.</p>
		</div>
	{:else}
		{@const rootSum = Math.round(workingStrategy.root.children.reduce((s, c) => s + c.weight, 0) * 100)}
		{#each workingStrategy.root.children as child (child.id)}
			<StrategyTreeNode
				node={child}
				depth={1}
				{assets}
				onupdate={updateNode}
				onremove={removeNode}
				onaddchild={addChildToNode}
				onnormalize={normalizeGroup}
			/>
		{/each}
		<div class="weight-sum-row" class:imbalanced={rootSum !== 100}>
			<span class="weight-sum-label">Total: {rootSum}%</span>
			{#if rootSum !== 100}
				<button class="normalize-btn" onclick={normalizeRoot}>Normalize to 100%</button>
			{/if}
		</div>
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

	.root-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--spacing-sm);
	}

	.root-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) 0;
		color: var(--color-text-primary);
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.root-label svg {
		color: var(--color-accent);
	}

	.history-buttons {
		display: flex;
		gap: 2px;
	}

	.history-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		color: var(--color-text-muted);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: color var(--transition-fast), border-color var(--transition-fast);
	}

	.history-btn:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.weight-sum-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.weight-sum-row.imbalanced {
		color: var(--color-negative, #e8175d);
	}

	.weight-sum-row.imbalanced .weight-sum-label {
		font-weight: 600;
	}

	.normalize-btn {
		padding: 2px var(--spacing-sm);
		font-size: var(--font-size-xs);
		color: var(--color-accent);
		background: none;
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: background var(--transition-fast);
	}

	.normalize-btn:hover {
		background: rgba(141, 208, 196, 0.1);
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
