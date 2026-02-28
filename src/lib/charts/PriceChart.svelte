<script lang="ts">
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import type { PricePoint } from '$lib/types';
	import {
		baseAxes,
		tooltipPlugin,
		createResizeObserver,
		observeThemeChanges,
		dateToUnix,
		BENCHMARK_COLOR,
		SERIES_COLORS
	} from './utils';

	interface SeriesData {
		label: string;
		prices: PricePoint[];
		isBenchmark?: boolean;
	}

	interface Props {
		series: SeriesData[];
		height?: number;
	}

	let { series, height = 350 }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let chart: uPlot | undefined;
	let resizeObs: ResizeObserver | undefined;
	let themeObs: MutationObserver | undefined;

	function buildData(): uPlot.AlignedData {
		if (series.length === 0) return [new Float64Array(0)];

		// Collect all unique dates across all series
		const dateSet = new Set<string>();
		for (const s of series) {
			for (const p of s.prices) dateSet.add(p.date);
		}
		const sortedDates = Array.from(dateSet).sort();
		const timestamps = new Float64Array(sortedDates.map(dateToUnix));

		// Build price lookup per series and fill aligned arrays
		const aligned: (number | null)[][] = series.map((s) => {
			const map = new Map<string, number>();
			for (const p of s.prices) map.set(p.date, p.close);
			return sortedDates.map((d) => map.get(d) ?? null);
		});

		return [timestamps, ...aligned] as uPlot.AlignedData;
	}

	function buildOpts(width: number): uPlot.Options {
		const axes = baseAxes();
		axes[1].values = (_u: uPlot, ticks: number[]) =>
			ticks.map((v) => v.toLocaleString('de-DE', { maximumFractionDigits: 2 }));

		const uSeries: uPlot.Series[] = [
			{}, // x-axis
			...series.map((s, i) => ({
				label: s.label,
				stroke: s.isBenchmark ? BENCHMARK_COLOR : SERIES_COLORS[i % SERIES_COLORS.length],
				width: s.isBenchmark ? 2 : 1.5,
				points: { show: false }
			}))
		];

		return {
			width,
			height,
			cursor: {
				drag: { x: true, y: false },
				focus: { prox: 16 }
			},
			legend: { show: true },
			scales: { x: { time: true } },
			axes,
			series: uSeries,
			plugins: [
				tooltipPlugin((_si, _di, val) =>
					val != null
						? val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
						: '---'
				)
			]
		};
	}

	function createChart() {
		if (!container) return;
		chart?.destroy();

		const width = container.clientWidth || 600;
		const data = buildData();
		const opts = buildOpts(width);
		chart = new uPlot(opts, data, container);
	}

	$effect(() => {
		// Track reactive deps
		void series;

		if (!container) return;

		createChart();

		resizeObs = createResizeObserver(container, (w) => {
			chart?.setSize({ width: w, height });
		});

		themeObs = observeThemeChanges(() => createChart());

		return () => {
			chart?.destroy();
			resizeObs?.disconnect();
			themeObs?.disconnect();
		};
	});
</script>

{#if series.length === 0 || series.every((s) => s.prices.length < 2)}
	<div class="chart-empty">
		<p>Not enough data to display the price chart.</p>
	</div>
{:else}
	<div class="chart-wrapper">
		<div bind:this={container} class="chart-container"></div>
	</div>
{/if}

<style>
	.chart-wrapper {
		width: 100%;
		position: relative;
	}

	.chart-container {
		width: 100%;
	}

	.chart-container :global(.u-legend) {
		font-size: 12px;
		font-family: system-ui, -apple-system, sans-serif;
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
