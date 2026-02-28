<script lang="ts">
	import { computeSunburstArcs, type SunburstArc } from './sunburst';
	import type { StrategyGroupNode } from '$lib/types';

	let {
		root,
		size = 400,
		assetNames = {}
	}: {
		root: StrategyGroupNode;
		size?: number;
		assetNames?: Record<string, string>;
	} = $props();

	let hoveredId = $state<string | null>(null);
	let tooltipX = $state(0);
	let tooltipY = $state(0);

	// Zoom: trail of group nodes from the original root down to the current view root
	let zoomPath = $state<StrategyGroupNode[]>([]);

	// When root prop changes, reset zoom
	$effect(() => {
		zoomPath = [root];
	});

	let viewRoot = $derived(zoomPath.length > 0 ? zoomPath[zoomPath.length - 1] : root);

	let arcs = $derived(computeSunburstArcs(viewRoot));

	let maxDepth = $derived(
		arcs.length === 0 ? 0 : Math.max(...arcs.map((a) => a.depth))
	);

	let ringWidth = $derived(
		maxDepth === 0 ? size / 4 : size / (2 * (maxDepth + 1))
	);

	let half = $derived(size / 2);

	// Map top-level arc indices to assign hues
	let topLevelArcs = $derived(arcs.filter((a) => a.depth === 1));

	// Assign a hue to every arc based on its depth-1 ancestor
	let hueMap = $derived.by(() => {
		const map = new Map<string, number>();
		let topIdx = 0;
		for (const arc of arcs) {
			if (arc.depth === 1) {
				map.set(arc.id, (topIdx / topLevelArcs.length) * 360);
				topIdx++;
			}
		}
		// For deeper arcs, find ancestor hue by walking the arcs
		// Build a parent map from the tree
		function assignHue(node: StrategyGroupNode, parentHue: number | null) {
			for (const child of node.children) {
				const h = map.get(child.id);
				if (h === undefined && parentHue !== null) {
					map.set(child.id, parentHue);
				}
				if (child.type === 'group') {
					assignHue(child, map.get(child.id) ?? parentHue);
				}
			}
		}
		assignHue(viewRoot, null);
		return map;
	});

	function arcColor(arc: SunburstArc): string {
		const hue = hueMap.get(arc.id) ?? 0;
		const lightness = 40 + arc.depth * 10;
		return `hsl(${hue}, 60%, ${lightness}%)`;
	}

	function arcPath(arc: SunburstArc): string {
		const innerR = arc.depth * ringWidth;
		const outerR = (arc.depth + 1) * ringWidth;
		const { startAngle, endAngle } = arc;
		const span = endAngle - startAngle;

		// Near-full-circle: use two semicircles to avoid SVG arc degeneracy
		if (span >= Math.PI * 2 - 0.001) {
			return [
				`M 0 ${-outerR}`,
				`A ${outerR} ${outerR} 0 1 1 0 ${outerR}`,
				`A ${outerR} ${outerR} 0 1 1 0 ${-outerR}`,
				`M 0 ${-innerR}`,
				`A ${innerR} ${innerR} 0 1 0 0 ${innerR}`,
				`A ${innerR} ${innerR} 0 1 0 0 ${-innerR}`,
				'Z'
			].join(' ');
		}

		const largeArc = span > Math.PI ? 1 : 0;

		const ix1 = innerR * Math.cos(startAngle);
		const iy1 = innerR * Math.sin(startAngle);
		const ix2 = innerR * Math.cos(endAngle);
		const iy2 = innerR * Math.sin(endAngle);
		const ox1 = outerR * Math.cos(startAngle);
		const oy1 = outerR * Math.sin(startAngle);
		const ox2 = outerR * Math.cos(endAngle);
		const oy2 = outerR * Math.sin(endAngle);

		return [
			`M ${ix1} ${iy1}`,
			`A ${innerR} ${innerR} 0 ${largeArc} 1 ${ix2} ${iy2}`,
			`L ${ox2} ${oy2}`,
			`A ${outerR} ${outerR} 0 ${largeArc} 0 ${ox1} ${oy1}`,
			'Z'
		].join(' ');
	}

	function displayLabel(arc: SunburstArc): string {
		if (arc.node.type === 'group') return arc.node.label;
		const leaf = arc.node;
		return assetNames[leaf.assetId] ?? leaf.id;
	}

	// Ancestor chain for hover highlighting
	function getAncestorIds(arcId: string): Set<string> {
		const ids = new Set<string>();
		function search(node: StrategyGroupNode, path: string[]): boolean {
			for (const child of node.children) {
				if (child.id === arcId) {
					for (const p of path) ids.add(p);
					ids.add(arcId);
					return true;
				}
				if (child.type === 'group') {
					if (search(child, [...path, child.id])) return true;
				}
			}
			return false;
		}
		search(viewRoot, []);
		return ids;
	}

	let highlightedIds = $derived(hoveredId ? getAncestorIds(hoveredId) : null);

	function arcOpacity(arc: SunburstArc): number {
		if (!highlightedIds) return 1;
		return highlightedIds.has(arc.id) ? 1 : 0.4;
	}

	let hoveredArc = $derived(
		hoveredId ? arcs.find((a) => a.id === hoveredId) ?? null : null
	);

	// Relative weight: the node's weight within its parent
	function relativeWeight(arc: SunburstArc): number {
		return arc.node.weight;
	}

	function handleMouseMove(e: MouseEvent) {
		tooltipX = e.clientX;
		tooltipY = e.clientY;
	}

	function handleClick(arc: SunburstArc) {
		if (arc.node.type === 'group') {
			zoomPath = [...zoomPath, arc.node];
		}
	}

	function navigateTo(index: number) {
		zoomPath = zoomPath.slice(0, index + 1);
	}
</script>

<div class="sunburst-wrapper" onmousemove={handleMouseMove}>
	{#if zoomPath.length > 1}
		<nav class="breadcrumbs">
			{#each zoomPath as crumb, i}
				{#if i > 0}
					<span class="breadcrumb-sep">&gt;</span>
				{/if}
				{#if i < zoomPath.length - 1}
					<button class="breadcrumb-btn" onclick={() => navigateTo(i)}>
						{crumb.label}
					</button>
				{:else}
					<span class="breadcrumb-current">{crumb.label}</span>
				{/if}
			{/each}
		</nav>
	{/if}

	{#if arcs.length === 0}
		<div class="chart-empty">
			<p>No strategy data to display.</p>
		</div>
	{:else}
		<svg
			viewBox={`${-half} ${-half} ${size} ${size}`}
			width={size}
			height={size}
			class="sunburst-chart"
		>
			{#each arcs as arc}
				<path
					d={arcPath(arc)}
					fill={arcColor(arc)}
					stroke="var(--color-bg-primary, #fff)"
					stroke-width="1"
					opacity={arcOpacity(arc)}
					onmouseover={() => (hoveredId = arc.id)}
					onmouseleave={() => (hoveredId = null)}
					onclick={() => handleClick(arc)}
					role="button"
					tabindex="0"
					style={arc.node.type === 'group' ? 'cursor: pointer;' : ''}
				>
					<title>{displayLabel(arc)}</title>
				</path>
			{/each}
		</svg>
	{/if}

	{#if hoveredArc}
		<div
			class="sunburst-tooltip"
			style="left: {tooltipX + 12}px; top: {tooltipY - 40}px;"
		>
			<strong>{displayLabel(hoveredArc)}</strong>
			<div>Weight: {(relativeWeight(hoveredArc) * 100).toFixed(1)}%</div>
			<div>Of total: {(hoveredArc.absoluteWeight * 100).toFixed(1)}%</div>
		</div>
	{/if}
</div>

<style>
	.sunburst-wrapper {
		position: relative;
		display: inline-block;
	}

	.sunburst-chart {
		display: block;
	}

	.sunburst-chart path {
		transition: opacity 0.15s;
	}

	.sunburst-tooltip {
		position: fixed;
		pointer-events: none;
		z-index: 100;
		background: var(--color-bg-card, #fff);
		border: 1px solid var(--glass-border, #ddd);
		border-radius: var(--radius-sm, 4px);
		padding: var(--spacing-sm, 8px);
		font-size: var(--font-size-xs, 12px);
		line-height: 1.4;
		color: var(--color-text-primary, #3c3f44);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		white-space: nowrap;
	}

	.breadcrumbs {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 8px;
		font-size: var(--font-size-xs, 12px);
		color: var(--color-text-muted, #8a8d94);
	}

	.breadcrumb-sep {
		color: var(--color-text-muted, #8a8d94);
	}

	.breadcrumb-btn {
		background: none;
		border: none;
		padding: 2px 4px;
		cursor: pointer;
		color: var(--color-accent, #1a8a8a);
		font-size: var(--font-size-xs, 12px);
		border-radius: var(--radius-sm, 4px);
	}

	.breadcrumb-btn:hover {
		text-decoration: underline;
	}

	.breadcrumb-current {
		color: var(--color-text-primary, #3c3f44);
		font-weight: 600;
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
