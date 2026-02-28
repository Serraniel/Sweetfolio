<script lang="ts">
	import type { StrategyGroupNode, StrategyNode } from '$lib/types';
	import { computeIcicleLayout, type IcicleRect } from './icicle';

	let {
		root,
		width = 600,
		rowHeight = 40,
		assetNames = {}
	}: {
		root: StrategyGroupNode;
		width?: number;
		rowHeight?: number;
		assetNames?: Record<string, string>;
	} = $props();

	// --- Click-to-zoom state ---
	let zoomStack = $state<StrategyGroupNode[]>([]);
	let activeRoot = $derived(zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : root);

	// --- Layout ---
	let rects = $derived(computeIcicleLayout(activeRoot, width));
	let maxDepth = $derived(rects.length > 0 ? Math.max(...rects.map((r) => r.depth)) : 0);
	let breadcrumbHeight = $derived(zoomStack.length > 0 ? 24 : 0);
	let svgHeight = $derived(maxDepth * rowHeight + breadcrumbHeight);

	// --- Hover state ---
	let hoveredId = $state<string | null>(null);

	// --- Color helpers ---
	/** Build a map of top-level child index for hue assignment. */
	let topLevelIds = $derived(activeRoot.children.map((c) => c.id));

	function getTopLevelIndex(rect: IcicleRect): number {
		if (rect.depth === 1) {
			return topLevelIds.indexOf(rect.id);
		}
		// Walk up: find which top-level ancestor this rect belongs to
		// by checking x position overlap with depth-1 rects
		const depth1Rects = rects.filter((r) => r.depth === 1);
		for (let i = 0; i < depth1Rects.length; i++) {
			const d1 = depth1Rects[i];
			if (rect.x >= d1.x && rect.x < d1.x + d1.width) {
				return topLevelIds.indexOf(d1.id);
			}
		}
		return 0;
	}

	function rectColor(rect: IcicleRect): string {
		const topCount = topLevelIds.length;
		const idx = getTopLevelIndex(rect);
		const hue = topCount > 0 ? (idx * 360) / topCount : 0;
		const lightness = 40 + (rect.depth - 1) * 10;
		return `hsl(${hue}, 60%, ${lightness}%)`;
	}

	// --- Ancestor detection for hover highlighting ---
	function getAncestorIds(targetId: string): Set<string> {
		const ids = new Set<string>();
		function walk(node: StrategyNode, path: string[]): boolean {
			if (node.id === targetId) {
				for (const p of path) ids.add(p);
				ids.add(targetId);
				return true;
			}
			if (node.type === 'group') {
				for (const child of node.children) {
					if (walk(child, [...path, node.id])) return true;
				}
			}
			return false;
		}
		walk(activeRoot, []);
		return ids;
	}

	let highlightedIds = $derived(hoveredId ? getAncestorIds(hoveredId) : null);

	function rectOpacity(rect: IcicleRect): number {
		if (!highlightedIds) return 1;
		return highlightedIds.has(rect.id) ? 1 : 0.4;
	}

	// --- Label ---
	function rectLabel(rect: IcicleRect): string {
		if (rect.node.type === 'leaf') {
			return assetNames[rect.node.assetId] ?? rect.node.assetId;
		}
		return rect.node.label;
	}

	// --- Tooltip ---
	let tooltipRect = $derived(hoveredId ? rects.find((r) => r.id === hoveredId) ?? null : null);
	let tooltipLabel = $derived(tooltipRect ? rectLabel(tooltipRect) : '');
	let tooltipRelWeight = $derived(
		tooltipRect ? (tooltipRect.node.weight * 100).toFixed(1) + '%' : ''
	);
	let tooltipAbsWeight = $derived(
		tooltipRect ? (tooltipRect.absoluteWeight * 100).toFixed(1) + '%' : ''
	);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	function handleMouseMove(e: MouseEvent) {
		const svg = (e.currentTarget as Element).closest('.icicle-container');
		if (!svg) return;
		const rect = svg.getBoundingClientRect();
		tooltipX = e.clientX - rect.left + 12;
		tooltipY = e.clientY - rect.top - 8;
	}

	// --- Click-to-zoom ---
	function handleClick(rect: IcicleRect) {
		if (rect.node.type === 'group') {
			zoomStack = [...zoomStack, rect.node as StrategyGroupNode];
			hoveredId = null;
		}
	}

	function navigateTo(index: number) {
		if (index < 0) {
			zoomStack = [];
		} else {
			zoomStack = zoomStack.slice(0, index + 1);
		}
		hoveredId = null;
	}
</script>

<div class="icicle-container" role="img" aria-label="Icicle chart">
	{#if zoomStack.length > 0}
		<div class="breadcrumb">
			<button class="breadcrumb-item" onclick={() => navigateTo(-1)}>
				{root.label}
			</button>
			{#each zoomStack as crumb, i}
				<span class="breadcrumb-sep">/</span>
				{#if i < zoomStack.length - 1}
					<button class="breadcrumb-item" onclick={() => navigateTo(i)}>
						{crumb.label}
					</button>
				{:else}
					<span class="breadcrumb-current">{crumb.label}</span>
				{/if}
			{/each}
		</div>
	{/if}

	{#if rects.length === 0}
		<div class="chart-empty">
			<p>No strategy data to display.</p>
		</div>
	{:else}
		<svg
			viewBox={`0 0 ${width} ${maxDepth * rowHeight}`}
			class="icicle-svg"
			preserveAspectRatio="xMinYMin meet"
		>
			{#each rects as rect}
				<g
					class="icicle-rect"
					class:clickable={rect.node.type === 'group'}
					opacity={rectOpacity(rect)}
					onmouseover={() => (hoveredId = rect.id)}
					onmouseleave={() => (hoveredId = null)}
					onmousemove={handleMouseMove}
					onclick={() => handleClick(rect)}
				>
					<rect
						x={rect.x}
						y={(rect.depth - 1) * rowHeight}
						width={rect.width}
						height={rowHeight - 2}
						fill={rectColor(rect)}
						rx="2"
					/>
					{#if rect.width > 40}
						<clipPath id={`clip-${rect.id}`}>
							<rect
								x={rect.x + 4}
								y={(rect.depth - 1) * rowHeight}
								width={rect.width - 8}
								height={rowHeight - 2}
							/>
						</clipPath>
						<text
							x={rect.x + rect.width / 2}
							y={(rect.depth - 1) * rowHeight + (rowHeight - 2) / 2}
							text-anchor="middle"
							dominant-baseline="central"
							class="rect-label"
							clip-path={`url(#clip-${rect.id})`}
						>
							{rectLabel(rect)}
						</text>
					{/if}
				</g>
			{/each}
		</svg>

		{#if tooltipRect}
			<div
				class="tooltip"
				style:left="{tooltipX}px"
				style:top="{tooltipY}px"
			>
				<strong>{tooltipLabel}</strong>
				<div>Relative: {tooltipRelWeight}</div>
				<div>Absolute: {tooltipAbsWeight}</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.icicle-container {
		position: relative;
		width: 100%;
	}

	.icicle-svg {
		width: 100%;
		height: auto;
		display: block;
	}

	.icicle-rect {
		transition: opacity 0.15s;
	}

	.icicle-rect.clickable {
		cursor: pointer;
	}

	.rect-label {
		fill: white;
		font-size: 12px;
		font-family: system-ui, -apple-system, sans-serif;
		pointer-events: none;
	}

	.tooltip {
		position: absolute;
		pointer-events: none;
		z-index: 100;
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 12px;
		line-height: 1.5;
		white-space: nowrap;
		background: var(--color-bg-secondary, rgba(255, 255, 255, 0.92));
		border: 1px solid var(--glass-border, #ddd);
		color: var(--color-text-primary, #3c3f44);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 0 8px;
		font-size: 13px;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.breadcrumb-item {
		background: none;
		border: none;
		padding: 2px 4px;
		cursor: pointer;
		color: var(--color-accent, #1a8a8a);
		font-size: 13px;
		font-family: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.breadcrumb-item:hover {
		opacity: 0.7;
	}

	.breadcrumb-sep {
		color: var(--color-text-muted, #b4b8bf);
	}

	.breadcrumb-current {
		color: var(--color-text-primary, #3c3f44);
		font-weight: 500;
	}

	.chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		color: var(--color-text-muted, #8a8d94);
		font-size: 13px;
	}
</style>
