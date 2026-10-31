<script lang="ts">
	/** Allocation donut with hover-linked legend (CH-5). */
	import * as fmt from '#lib/format.ts';
	import { colorAt } from './palette.ts';
	import { theme } from '#lib/state/theme.svelte.ts';

	let {
		items,
		centerLabel,
		centerValue
	}: { items: Array<{ label: string; value: number; color?: string; href?: string }>; centerLabel?: string; centerValue?: string } =
		$props();

	let hover = $state<number | null>(null);
	const total = $derived(items.reduce((s, i) => s + Math.max(0, i.value), 0));
	const colors = $derived((void theme.resolved, items.map((it, i) => it.color ?? colorAt(i))));
	const arcs = $derived.by(() => {
		let a = -Math.PI / 2;
		return items.map((it) => {
			const share = total > 0 ? Math.max(0, it.value) / total : 0;
			const start = a;
			a += share * Math.PI * 2;
			return { start, end: a, share };
		});
	});

	function arcPath(start: number, end: number, r = 44, inner = 30): string {
		if (end - start >= Math.PI * 2 - 1e-6) end = start + Math.PI * 2 - 1e-4;
		const large = end - start > Math.PI ? 1 : 0;
		const p = (ang: number, rad: number) => `${50 + rad * Math.cos(ang)} ${50 + rad * Math.sin(ang)}`;
		return `M ${p(start, r)} A ${r} ${r} 0 ${large} 1 ${p(end, r)} L ${p(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${p(start, inner)} Z`;
	}
</script>

<div class="donut">
	<svg viewBox="0 0 100 100" role="img" aria-label="Allocation chart">
		{#each arcs as arc, i (i)}
			{#if arc.share > 0}
				<path
					d={arcPath(arc.start, arc.end, hover === i ? 46 : 44)}
					fill={colors[i]}
					opacity={hover === null || hover === i ? 1 : 0.35}
					onpointerenter={() => (hover = i)}
					onpointerleave={() => (hover = null)}
					role="presentation"
				/>
			{/if}
		{/each}
		<text x="50" y="47" text-anchor="middle" class="c-label">{hover !== null ? items[hover]?.label.slice(0, 18) : (centerLabel ?? '')}</text
		>
		<text x="50" y="58" text-anchor="middle" class="c-value"
			>{hover !== null ? fmt.pct(arcs[hover]?.share ?? 0, 1) : (centerValue ?? '')}</text
		>
	</svg>
	<ul class="legend">
		{#each items as it, i (i)}
			<li class:dim={hover !== null && hover !== i} onpointerenter={() => (hover = i)} onpointerleave={() => (hover = null)}>
				<i style="background: {colors[i]}"></i>
				{#if it.href}<a class="truncate" href={it.href}>{it.label}</a>{:else}<span class="truncate">{it.label}</span>{/if}
				<span class="num muted">{fmt.pct(arcs[i]?.share ?? 0, 1)}</span>
			</li>
		{/each}
	</ul>
</div>

<style>
	.donut {
		display: grid;
		gap: var(--space-4);
		grid-template-columns: minmax(140px, 200px) 1fr;
		align-items: center;
	}
	@media (max-width: 480px) {
		.donut {
			grid-template-columns: 1fr;
			justify-items: center;
		}
		svg {
			width: 200px;
		}
	}
	path {
		transition:
			opacity 0.15s,
			d 0.15s;
		cursor: pointer;
	}
	.c-label {
		font-size: 5px;
		fill: var(--muted);
	}
	.c-value {
		font-size: 8px;
		font-weight: 700;
		fill: var(--text);
	}
	.legend {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
		min-width: 0;
		width: 100%;
	}
	li {
		display: grid;
		grid-template-columns: 10px 1fr auto;
		align-items: center;
		gap: 8px;
		font-size: var(--text-sm);
		transition: opacity 0.15s;
	}
	li.dim {
		opacity: 0.45;
	}
	li i {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
</style>
