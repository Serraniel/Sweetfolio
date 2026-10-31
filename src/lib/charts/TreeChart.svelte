<script lang="ts">
	/** Strategy visualization: sunburst or icicle (ST-3). */
	import type { StrategyGroupNode } from '#lib/domain/types.ts';
	import { partitionLayout } from '#lib/core/strategy.ts';
	import * as fmt from '#lib/format.ts';
	import { theme } from '#lib/state/theme.svelte.ts';
	import { colorAt, withAlpha } from './palette.ts';

	let {
		root,
		kind = 'sunburst',
		labelForAsset
	}: { root: StrategyGroupNode; kind?: 'sunburst' | 'icicle'; labelForAsset: (id: string) => string } = $props();
	let hover = $state<string | null>(null);

	const nodes = $derived(partitionLayout(root, labelForAsset));
	const depth = $derived(Math.max(1, ...nodes.map((n) => n.depth)));
	/** Colour by top-level branch, lighter with depth. */
	const colors = $derived.by(() => {
		void theme.resolved;
		const top = nodes.filter((n) => n.depth === 1);
		const out = new Map<string, string>();
		for (const n of nodes) {
			const branch = top.findIndex((t) => n.start >= t.start - 1e-9 && n.end <= t.end + 1e-9);
			out.set(n.id, withAlpha(colorAt(Math.max(0, branch)), 1 - (n.depth - 1) * (0.5 / depth)));
		}
		return out;
	});
	const active = $derived(nodes.find((n) => n.id === hover) ?? null);

	function arc(start: number, end: number, r0: number, r1: number): string {
		const a0 = start * Math.PI * 2 - Math.PI / 2;
		const a1 = Math.min(end - start, 0.99999) * Math.PI * 2 + a0;
		const large = a1 - a0 > Math.PI ? 1 : 0;
		const p = (a: number, r: number) => `${100 + r * Math.cos(a)} ${100 + r * Math.sin(a)}`;
		return `M ${p(a0, r1)} A ${r1} ${r1} 0 ${large} 1 ${p(a1, r1)} L ${p(a1, r0)} A ${r0} ${r0} 0 ${large} 0 ${p(a0, r0)} Z`;
	}
</script>

<div class="tree-chart">
	<p class="readout small" aria-live="polite">
		{#if active}<b>{active.label}</b> · <span class="num">{fmt.pct(active.weight, 1)}</span> of total{:else}<span class="muted"
				>Hover or tap a segment</span
			>{/if}
	</p>
	{#if nodes.length === 0}
		<p class="muted small">Add groups and assets to see the visualization.</p>
	{:else if kind === 'sunburst'}
		<svg viewBox="0 0 200 200" class="sun" role="img" aria-label="Strategy sunburst">
			{#each nodes as n (n.id)}
				{@const ring = 92 / depth}
				<path
					d={arc(n.start, n.end, 8 + (n.depth - 1) * ring, 8 + n.depth * ring - 1)}
					fill={colors.get(n.id)}
					stroke="var(--surface-solid)"
					stroke-width="0.8"
					opacity={hover && hover !== n.id ? 0.55 : 1}
					onpointerenter={() => (hover = n.id)}
					onpointerleave={() => (hover = null)}
					role="presentation"
				/>
			{/each}
		</svg>
	{:else}
		<svg viewBox="0 0 400 {depth * 44}" class="ice" role="img" aria-label="Strategy icicle chart" preserveAspectRatio="none">
			{#each nodes as n (n.id)}
				<g onpointerenter={() => (hover = n.id)} onpointerleave={() => (hover = null)} role="presentation">
					<rect
						x={n.start * 400 + 0.5}
						y={(n.depth - 1) * 44 + 0.5}
						width={Math.max(0, (n.end - n.start) * 400 - 1)}
						height="43"
						rx="3"
						fill={colors.get(n.id)}
						opacity={hover && hover !== n.id ? 0.55 : 1}
					/>
					{#if (n.end - n.start) * 400 > 50}
						<text x={n.start * 400 + 6} y={(n.depth - 1) * 44 + 18} class="t"
							>{n.label.slice(0, Math.floor(((n.end - n.start) * 400) / 6))}</text
						>
						<text x={n.start * 400 + 6} y={(n.depth - 1) * 44 + 33} class="t sub">{fmt.pct(n.weight, 1)}</text>
					{/if}
				</g>
			{/each}
		</svg>
	{/if}
</div>

<style>
	.readout {
		min-height: 1.5em;
		margin-bottom: var(--space-2);
	}
	.sun {
		max-width: 360px;
		margin: 0 auto;
		width: 100%;
	}
	.ice {
		width: 100%;
		height: auto;
		max-height: 320px;
	}
	path,
	rect {
		transition: opacity 0.15s;
		cursor: pointer;
	}
	.t {
		font-size: 10px;
		font-weight: 600;
		fill: #fff;
		pointer-events: none;
	}
	.t.sub {
		font-weight: 400;
		opacity: 0.9;
	}
</style>
