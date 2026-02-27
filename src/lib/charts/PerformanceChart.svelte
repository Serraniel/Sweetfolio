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
		SERIES_COLORS,
		fmtPct
	} from './utils';

	type TimeRange = '1y' | '3y' | '5y' | '10y' | 'all';

	interface SeriesData {
		label: string;
		prices: PricePoint[];
		isBenchmark?: boolean;
	}

	interface Props {
		series: SeriesData[];
		height?: number;
		initialRange?: TimeRange;
	}

	let { series, height = 350, initialRange = 'all' as TimeRange }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let chart: uPlot | undefined;
	let resizeObs: ResizeObserver | undefined;
	let themeObs: MutationObserver | undefined;
	let selectedRange: TimeRange = $state('all');

	$effect(() => {
		selectedRange = initialRange;
	});

	const RANGE_YEARS: Record<TimeRange, number | null> = {
		'1y': 1,
		'3y': 3,
		'5y': 5,
		'10y': 10,
		all: null
	};

	function filterByRange(prices: PricePoint[]): PricePoint[] {
		const years = RANGE_YEARS[selectedRange];
		if (years == null || prices.length === 0) return prices;

		const lastDate = new Date(prices[prices.length - 1].date);
		const cutoff = new Date(lastDate);
		cutoff.setFullYear(cutoff.getFullYear() - years);
		const cutoffStr = cutoff.toISOString().slice(0, 10);

		return prices.filter((p) => p.date >= cutoffStr);
	}

	function normalize(prices: PricePoint[]): { date: string; value: number }[] {
		if (prices.length === 0) return [];
		const base = prices[0].close;
		if (base === 0) return prices.map((p) => ({ date: p.date, value: 0 }));
		return prices.map((p) => ({ date: p.date, value: (p.close / base - 1) }));
	}

	function buildData(): uPlot.AlignedData {
		if (series.length === 0) return [new Float64Array(0)];

		const normalized = series.map((s) => normalize(filterByRange(s.prices)));

		const dateSet = new Set<string>();
		for (const n of normalized) {
			for (const p of n) dateSet.add(p.date);
		}
		const sortedDates = Array.from(dateSet).sort();
		const timestamps = new Float64Array(sortedDates.map(dateToUnix));

		const aligned: (number | null)[][] = normalized.map((n) => {
			const map = new Map<string, number>();
			for (const p of n) map.set(p.date, p.value);
			return sortedDates.map((d) => map.get(d) ?? null);
		});

		return [timestamps, ...aligned] as uPlot.AlignedData;
	}

	function buildOpts(width: number): uPlot.Options {
		const axes = baseAxes();
		axes[1].values = (_u: uPlot, ticks: number[]) =>
			ticks.map((v) => fmtPct(v));

		const uSeries: uPlot.Series[] = [
			{},
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
				tooltipPlugin((_si, _di, val) => (val != null ? fmtPct(val) : '---'))
			]
		};
	}

	function createChart() {
		if (!container) return;
		chart?.destroy();

		const width = container.clientWidth || 600;
		chart = new uPlot(buildOpts(width), buildData(), container);
	}

	function setRange(range: TimeRange) {
		selectedRange = range;
	}

	$effect(() => {
		void series;
		void selectedRange;

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

<div class="chart-wrapper">
	<div class="range-selector">
		{#each (['1y', '3y', '5y', '10y', 'all'] as TimeRange[]) as range}
			<button
				class="range-btn"
				class:active={selectedRange === range}
				onclick={() => setRange(range)}
			>
				{range.toUpperCase()}
			</button>
		{/each}
	</div>
	<div bind:this={container} class="chart-container"></div>
</div>

<style>
	.chart-wrapper {
		width: 100%;
		position: relative;
	}

	.chart-container {
		width: 100%;
	}

	.range-selector {
		display: flex;
		gap: 4px;
		margin-bottom: 8px;
		justify-content: flex-end;
	}

	.range-btn {
		padding: 4px 10px;
		border: 1px solid var(--color-border, #b4b8bf);
		border-radius: 4px;
		background: transparent;
		color: var(--color-text-primary, #3c3f44);
		cursor: pointer;
		font-size: 12px;
		font-family: system-ui, -apple-system, sans-serif;
		transition: background 0.15s, color 0.15s;
	}

	.range-btn:hover {
		background: var(--color-accent, #8dd0c4);
		color: var(--color-bg-primary, #fff);
	}

	.range-btn.active {
		background: var(--color-accent-deep, #1a8a8a);
		color: #fff;
		border-color: var(--color-accent-deep, #1a8a8a);
	}

	.chart-container :global(.u-legend) {
		font-size: 12px;
		font-family: system-ui, -apple-system, sans-serif;
	}
</style>
