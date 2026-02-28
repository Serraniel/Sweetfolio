<script lang="ts">
	import type { StrategyNode, StrategyGroupNode, Asset } from '$lib/types';
	import StrategyTreeNode from './StrategyTreeNode.svelte';

	let {
		node,
		depth = 0,
		assets = [],
		onupdate,
		onremove,
	}: {
		node: StrategyNode;
		depth?: number;
		assets?: Asset[];
		onupdate: (nodeId: string, changes: Partial<StrategyNode>) => void;
		onremove: (nodeId: string) => void;
	} = $props();

	let collapsed = $state(false);
	let showAddMenu = $state(false);
	let showAssetPicker = $state(false);
	let hovered = $state(false);

	const assetName = $derived(
		node.type === 'leaf'
			? assets.find((a) => a.id === node.assetId)?.name ?? 'Unknown Asset'
			: ''
	);

	const weightPercent = $derived(Math.round(node.weight * 100));

	function handleWeightChange(e: Event) {
		const value = parseInt((e.target as HTMLInputElement).value) || 0;
		const clamped = Math.max(0, Math.min(100, value));
		onupdate(node.id, { weight: clamped / 100 });
	}

	function handleLabelChange(e: Event) {
		if (node.type !== 'group') return;
		const value = (e.target as HTMLInputElement).value;
		onupdate(node.id, { label: value });
	}

	function addGroup() {
		if (node.type !== 'group') return;
		showAddMenu = false;
		onupdate(node.id, {
			children: [
				...node.children,
				{
					type: 'group',
					id: crypto.randomUUID(),
					label: 'New Group',
					weight: 0,
					children: [],
				} as StrategyNode,
			],
		} as Partial<StrategyGroupNode>);
	}

	function addAsset(assetId: string) {
		if (node.type !== 'group') return;
		showAssetPicker = false;
		showAddMenu = false;
		onupdate(node.id, {
			children: [
				...node.children,
				{
					type: 'leaf',
					id: crypto.randomUUID(),
					assetId,
					weight: 0,
				} as StrategyNode,
			],
		} as Partial<StrategyGroupNode>);
	}
</script>

<div
	class="tree-node depth-{depth}"
	class:group={node.type === 'group'}
	class:leaf={node.type === 'leaf'}
	role="treeitem"
	aria-selected="false"
	tabindex="-1"
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
>
	<div class="node-row">
		{#if node.type === 'group'}
			<button class="collapse-toggle" onclick={() => (collapsed = !collapsed)}>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					{#if collapsed}
						<polyline points="9 18 15 12 9 6" />
					{:else}
						<polyline points="6 9 12 15 18 9" />
					{/if}
				</svg>
			</button>
			<input
				class="label-input"
				type="text"
				value={node.label}
				onchange={handleLabelChange}
				aria-label="Group name"
			/>
		{:else}
			<span class="leaf-icon">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="4" />
				</svg>
			</span>
			<span class="asset-name" title={assetName}>{assetName}</span>
		{/if}

		<div class="weight-control">
			<input
				class="weight-input"
				type="number"
				min="0"
				max="100"
				step="1"
				value={weightPercent}
				onchange={handleWeightChange}
				aria-label="Weight percent"
			/>
			<span class="percent-sign">%</span>
		</div>

		<div class="node-actions" class:visible={hovered}>
			{#if node.type === 'group'}
				<div class="add-menu-wrapper">
					<button class="action-btn add-btn" onclick={() => (showAddMenu = !showAddMenu)} title="Add child">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
						</svg>
					</button>
					{#if showAddMenu}
						<div class="add-dropdown">
							<button class="dropdown-item" onclick={addGroup}>Add Group</button>
							<button class="dropdown-item" onclick={() => { showAssetPicker = true; showAddMenu = false; }}>Add Asset</button>
						</div>
					{/if}
				</div>
			{/if}
			<button class="action-btn remove-btn" onclick={() => onremove(node.id)} title="Remove">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	</div>

	{#if showAssetPicker}
		<div class="asset-picker">
			{#each assets as asset}
				<button class="asset-option" onclick={() => addAsset(asset.id)}>
					{asset.name}
				</button>
			{/each}
			<button class="asset-option cancel" onclick={() => (showAssetPicker = false)}>Cancel</button>
		</div>
	{/if}

	{#if node.type === 'group' && !collapsed}
		<div class="children" role="group">
			{#each node.children as child (child.id)}
				<StrategyTreeNode
					node={child}
					depth={depth + 1}
					{assets}
					{onupdate}
					{onremove}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tree-node {
		margin-left: calc(var(--depth, 0) * 20px);
	}

	.depth-0 { --depth: 0; }
	.depth-1 { --depth: 0; }
	.depth-0 > .children > :global(.tree-node) { margin-left: 0; }

	.children {
		margin-left: 20px;
		border-left: 1px solid var(--color-border);
		padding-left: var(--spacing-sm);
	}

	.node-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		transition: background-color var(--transition-fast);
		min-height: 36px;
	}

	.node-row:hover {
		background: var(--color-bg-tertiary);
	}

	.collapse-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--color-text-muted);
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
	}

	.collapse-toggle:hover {
		color: var(--color-text-primary);
	}

	.leaf-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--color-accent);
	}

	.label-input {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-primary);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		flex: 1;
		min-width: 80px;
	}

	.label-input:focus {
		border-color: var(--color-accent);
		outline: none;
		background: var(--color-bg-secondary);
	}

	.asset-name {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.weight-control {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.weight-input {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		width: 44px;
		text-align: right;
		padding: 2px 4px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
		-moz-appearance: textfield;
	}

	.weight-input::-webkit-outer-spin-button,
	.weight-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.percent-sign {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.node-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		opacity: 0;
		transition: opacity var(--transition-fast);
	}

	.node-actions.visible {
		opacity: 1;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
	}

	.action-btn:hover {
		background: var(--color-border);
		color: var(--color-text-primary);
	}

	.remove-btn:hover {
		color: var(--color-danger, #e55);
	}

	.add-menu-wrapper {
		position: relative;
	}

	.add-dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		z-index: 10;
		background: var(--color-bg-card);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 120px;
		overflow: hidden;
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

	.asset-picker {
		display: flex;
		flex-direction: column;
		margin-left: 32px;
		margin-top: var(--spacing-xs);
		background: var(--color-bg-card);
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
