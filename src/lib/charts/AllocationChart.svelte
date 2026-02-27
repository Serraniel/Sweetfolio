<script lang="ts">
	import { SERIES_COLORS, COLORS, isDarkTheme, observeThemeChanges } from './utils';

	interface Allocation {
		label: string;
		weight: number;
	}

	interface Props {
		allocations: Allocation[];
		size?: number;
	}

	let { allocations, size = 240 }: Props = $props();

	let dark = $state(isDarkTheme());
	let themeObs: MutationObserver | undefined;

	// Sort by weight descending for visual consistency
	let sorted = $derived([...allocations].sort((a, b) => b.weight - a.weight));

	function buildSlices(allocs: Allocation[]): { path: string; color: string; label: string; weight: number; midAngle: number }[] {
		const total = allocs.reduce((sum, a) => sum + a.weight, 0);
		if (total === 0) return [];

		const cx = size / 2;
		const cy = size / 2;
		const r = size / 2 - 4;
		const innerR = r * 0.55; // donut

		let startAngle = -Math.PI / 2;
		const slices: { path: string; color: string; label: string; weight: number; midAngle: number }[] = [];

		for (let i = 0; i < allocs.length; i++) {
			const a = allocs[i];
			const sweep = (a.weight / total) * Math.PI * 2;
			const endAngle = startAngle + sweep;
			const midAngle = startAngle + sweep / 2;
			const largeArc = sweep > Math.PI ? 1 : 0;

			const x1 = cx + r * Math.cos(startAngle);
			const y1 = cy + r * Math.sin(startAngle);
			const x2 = cx + r * Math.cos(endAngle);
			const y2 = cy + r * Math.sin(endAngle);
			const ix1 = cx + innerR * Math.cos(endAngle);
			const iy1 = cy + innerR * Math.sin(endAngle);
			const ix2 = cx + innerR * Math.cos(startAngle);
			const iy2 = cy + innerR * Math.sin(startAngle);

			const path = [
				`M ${x1} ${y1}`,
				`A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
				`L ${ix1} ${iy1}`,
				`A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
				'Z'
			].join(' ');

			slices.push({
				path,
				color: SERIES_COLORS[i % SERIES_COLORS.length],
				label: a.label,
				weight: a.weight,
				midAngle
			});

			startAngle = endAngle;
		}

		return slices;
	}

	let slices = $derived(buildSlices(sorted));

	$effect(() => {
		themeObs = observeThemeChanges(() => {
			dark = isDarkTheme();
		});
		return () => themeObs?.disconnect();
	});
</script>

<div class="allocation-wrapper">
	<svg
		width={size}
		height={size}
		viewBox={`0 0 ${size} ${size}`}
		class="allocation-chart"
	>
		{#each slices as slice}
			<path d={slice.path} fill={slice.color} stroke={dark ? COLORS.darkBg : COLORS.white} stroke-width="1.5">
				<title>{slice.label}: {(slice.weight * 100).toFixed(1)}%</title>
			</path>
		{/each}
	</svg>

	<div class="legend">
		{#each sorted as alloc, i}
			<div class="legend-item">
				<span
					class="legend-dot"
					style:background-color={SERIES_COLORS[i % SERIES_COLORS.length]}
				></span>
				<span class="legend-label">{alloc.label}</span>
				<span class="legend-value">{(alloc.weight * 100).toFixed(1)}%</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.allocation-wrapper {
		display: flex;
		align-items: center;
		gap: 20px;
		flex-wrap: wrap;
	}

	.allocation-chart {
		flex-shrink: 0;
	}

	.allocation-chart path {
		transition: opacity 0.15s;
	}

	.allocation-chart path:hover {
		opacity: 0.8;
	}

	.legend {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		font-family: system-ui, -apple-system, sans-serif;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-label {
		color: var(--color-text-primary, #3c3f44);
		flex: 1;
	}

	.legend-value {
		color: var(--color-text-muted, #b4b8bf);
		font-variant-numeric: tabular-nums;
	}
</style>
