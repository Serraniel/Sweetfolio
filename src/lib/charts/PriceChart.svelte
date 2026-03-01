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
		getAssetColor,
		fmtPct
	} from './utils';

	type ViewMode = 'absolute' | 'relative';
	type TimeRange = '1m' | '3m' | '6m' | 'ytd' | '1y' | '3y' | '5y' | '10y' | 'max' | 'all';

	interface SeriesData {
		label: string;
		prices: PricePoint[];
		isBenchmark?: boolean;
	}

	interface Props {
		series: SeriesData[];
		height?: number;
		/** Initial view mode. Defaults to 'relative' when multiple series, 'absolute' for single. */
		initialMode?: ViewMode;
		initialRange?: TimeRange;
	}

	let { series, height = 350, initialMode, initialRange }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let chart: uPlot | undefined;
	let resizeObs: ResizeObserver | undefined;
	let themeObs: MutationObserver | undefined;
	let logScale: boolean = $state(false);
	let selectedRange: TimeRange = $state('all');
	let rangeInitialized = false;

	// Default: relative when multi-series, absolute when single
	let viewMode: ViewMode = $state('absolute');

	const isMultiSeries = $derived(series.length > 1);

	// Initialize view mode and range from props
	$effect(() => {
		viewMode = initialMode ?? (isMultiSeries ? 'relative' : 'absolute');
	});
	// Set default range once when series data becomes available.
	// Prefers explicit prop, then 'max' (multi-series overlap), then 'all'.
	$effect(() => {
		if (rangeInitialized) return;
		if (initialRange) {
			selectedRange = initialRange;
			rangeInitialized = true;
		} else if (maxRange) {
			selectedRange = 'max';
			rangeInitialized = true;
		}
	});

	/** Ordered fixed-duration ranges with their span in months. */
	const FIXED_RANGES: { key: TimeRange; months: number }[] = [
		{ key: '1m', months: 1 },
		{ key: '3m', months: 3 },
		{ key: '6m', months: 6 },
		{ key: '1y', months: 12 },
		{ key: '3y', months: 36 },
		{ key: '5y', months: 60 },
		{ key: '10y', months: 120 }
	];

	/** Compute the data span in months (uses the union of all series dates). */
	const dataSpanMonths = $derived.by(() => {
		if (series.length === 0) return 0;
		let earliest = '';
		let latest = '';
		for (const s of series) {
			if (s.prices.length === 0) continue;
			const first = s.prices[0].date;
			const last = s.prices[s.prices.length - 1].date;
			if (!earliest || first < earliest) earliest = first;
			if (!latest || last > latest) latest = last;
		}
		if (!earliest || !latest) return 0;
		const diffMs = new Date(latest).getTime() - new Date(earliest).getTime();
		return diffMs / (30.4375 * 24 * 60 * 60 * 1000);
	});

	/**
	 * A fixed-duration button is disabled when a shorter range already covers all data.
	 * Once a range's months >= dataSpanMonths, all subsequent ones are redundant.
	 * YTD is disabled when the data doesn't span back before Jan 1 of the latest data year.
	 */
	const disabledRanges = $derived.by(() => {
		const disabled = new Set<TimeRange>();
		let coveredByPrevious = false;
		for (const { key, months } of FIXED_RANGES) {
			if (coveredByPrevious) {
				disabled.add(key);
			}
			if (months >= dataSpanMonths) {
				coveredByPrevious = true;
			}
		}

		// YTD: disable if data doesn't reach before Jan 1 of the latest year
		if (series.length > 0) {
			let earliest = '';
			let latest = '';
			for (const s of series) {
				if (s.prices.length === 0) continue;
				const first = s.prices[0].date;
				const last = s.prices[s.prices.length - 1].date;
				if (!earliest || first < earliest) earliest = first;
				if (!latest || last > latest) latest = last;
			}
			if (earliest && latest) {
				const jan1 = `${latest.slice(0, 4)}-01-01`;
				if (earliest >= jan1) disabled.add('ytd');
			}
		}

		return disabled;
	});

	/**
	 * For multi-series: "MAX" shows the longest overlapping span across all series.
	 * It filters to the date range where every series has data.
	 */
	const maxRange = $derived.by(() => {
		if (series.length <= 1) return null;
		let overlapStart = '';
		let overlapEnd = '';
		for (const s of series) {
			if (s.prices.length === 0) return null;
			const first = s.prices[0].date;
			const last = s.prices[s.prices.length - 1].date;
			if (!overlapStart || first > overlapStart) overlapStart = first;
			if (!overlapEnd || last < overlapEnd) overlapEnd = last;
		}
		if (!overlapStart || !overlapEnd || overlapStart >= overlapEnd) return null;
		return { start: overlapStart, end: overlapEnd };
	});

	/** Available range buttons in display order. */
	const rangeButtons = $derived.by(() => {
		const buttons: TimeRange[] = ['ytd', '1m', '3m', '6m', '1y', '3y', '5y', '10y'];
		if (maxRange) buttons.push('max');
		buttons.push('all');
		return buttons;
	});

	// If the selected range becomes disabled, fall back to 'all'
	$effect(() => {
		if (disabledRanges.has(selectedRange)) {
			selectedRange = 'all';
		}
	});

	function filterByRange(prices: PricePoint[]): PricePoint[] {
		if (prices.length === 0) return prices;

		// "max" range: clip to the overlap window of all series
		if (selectedRange === 'max' && maxRange) {
			return prices.filter((p) => p.date >= maxRange.start && p.date <= maxRange.end);
		}

		// "all" passes everything through
		if (selectedRange === 'all') return prices;

		const lastDate = new Date(prices[prices.length - 1].date);
		let cutoff: Date;

		if (selectedRange === 'ytd') {
			cutoff = new Date(lastDate.getFullYear(), 0, 1); // Jan 1 of last data year
		} else {
			const rangeEntry = FIXED_RANGES.find((r) => r.key === selectedRange);
			if (!rangeEntry) return prices;
			cutoff = new Date(lastDate);
			cutoff.setMonth(cutoff.getMonth() - rangeEntry.months);
		}

		const cutoffStr = cutoff.toISOString().slice(0, 10);
		return prices.filter((p) => p.date >= cutoffStr);
	}

	function buildData(): uPlot.AlignedData {
		if (series.length === 0) return [new Float64Array(0)];

		const filtered = series.map((s) => filterByRange(s.prices));

		if (viewMode === 'absolute') {
			return buildAbsoluteData(filtered);
		}
		return buildRelativeData(filtered);
	}

	function buildAbsoluteData(filteredSeries: PricePoint[][]): uPlot.AlignedData {
		// Absolute mode: raw prices for all series, no normalization
		const dateSet = new Set<string>();
		for (const prices of filteredSeries) {
			for (const p of prices) dateSet.add(p.date);
		}
		const sortedDates = Array.from(dateSet).sort();
		const timestamps = new Float64Array(sortedDates.map(dateToUnix));

		const aligned: (number | null)[][] = filteredSeries.map((prices) => {
			const map = new Map<string, number>();
			for (const p of prices) map.set(p.date, p.close);
			return sortedDates.map((d) => map.get(d) ?? null);
		});

		return [timestamps, ...aligned] as uPlot.AlignedData;
	}

	function buildRelativeData(filteredSeries: PricePoint[][]): uPlot.AlignedData {
		// Normalize all series to percentage change from their own starting point
		// (or from first common date for multi-series)
		const lookups = filteredSeries.map((prices) => {
			const map = new Map<string, number>();
			for (const p of prices) map.set(p.date, p.close);
			return map;
		});

		const dateSet = new Set<string>();
		for (const prices of filteredSeries) {
			for (const p of prices) dateSet.add(p.date);
		}
		const sortedDates = Array.from(dateSet).sort();

		// Find first common date for multi-series normalization
		let baseDate: string | null = null;
		if (isMultiSeries) {
			for (const d of sortedDates) {
				if (lookups.every((m) => m.has(d))) {
					baseDate = d;
					break;
				}
			}
		}

		const bases = lookups.map((m, i) => {
			if (baseDate && m.has(baseDate)) return m.get(baseDate)!;
			return filteredSeries[i][0]?.close || 1;
		});

		const timestamps = new Float64Array(sortedDates.map(dateToUnix));
		const useIndexed = logScale; // Log scale needs positive values (base-100 indexed)

		const aligned: (number | null)[][] = lookups.map((m, i) => {
			const base = bases[i];
			if (base === 0) return sortedDates.map(() => null);
			return sortedDates.map((d) => {
				const val = m.get(d);
				if (val == null) return null;
				return useIndexed ? (val / base) * 100 : val / base - 1;
			});
		});

		return [timestamps, ...aligned] as uPlot.AlignedData;
	}

	function buildOpts(width: number): uPlot.Options {
		const axes = baseAxes();

		const isRelative = viewMode === 'relative';

		if (isRelative && !logScale) {
			// Percentage mode
			axes[1].values = (_u: uPlot, ticks: number[]) =>
				ticks.map((v) => v == null ? '' : fmtPct(v));
		} else if (isRelative && logScale) {
			// Relative + log: base-100 indexed
			axes[1].values = (_u: uPlot, ticks: number[]) =>
				ticks.map((v) => v == null ? '' : v.toFixed(0));
		} else {
			// Absolute mode: plain currency values
			axes[1].values = (_u: uPlot, ticks: number[]) =>
				ticks.map((v) => v == null ? '' : v.toLocaleString('de-DE', { maximumFractionDigits: 2 }));
		}

		const uSeries: uPlot.Series[] = [
			{ value: () => '' }, // x-axis – hide date from legend
			...series.map((s, i) => ({
				label: s.label,
				stroke: s.isBenchmark ? BENCHMARK_COLOR : getAssetColor(i),
				width: s.isBenchmark ? 2 : 1.5,
				points: { show: false },
				value: () => ''
			}))
		];

		return {
			width,
			height,
			cursor: {
				drag: { x: true, y: false },
				focus: { prox: 16 }
			},
			legend: { show: true, live: false },
			scales: {
				x: { time: true },
				y: { distr: logScale ? 3 : 1 }
			},
			axes,
			series: uSeries,
			plugins: [
				tooltipPlugin((_si, _di, val) => {
					if (val == null) return '---';
					if (isRelative && !logScale) return fmtPct(val);
					if (isRelative && logScale) return val.toFixed(2);
					return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
				})
			]
		};
	}

	function createChart() {
		if (!container) return;
		chart?.destroy();

		const width = container.clientWidth || 600;
		chart = new uPlot(buildOpts(width), buildData(), container);
	}

	$effect(() => {
		void series;
		void viewMode;
		void logScale;
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

{#if series.length === 0 || series.every((s) => s.prices.length < 2)}
	<div class="chart-empty">
		<p>Not enough data to display the chart.</p>
	</div>
{:else}
	<div class="chart-wrapper">
		<div class="controls">
			<div class="control-group">
				<button
					class="view-btn"
					class:active={viewMode === 'absolute'}
					onclick={() => (viewMode = 'absolute')}
				>
					Absolute
				</button>
				<button
					class="view-btn"
					class:active={viewMode === 'relative'}
					onclick={() => (viewMode = 'relative')}
				>
					Relative %
				</button>
			</div>
			<span class="controls-separator"></span>
			<div class="control-group">
				{#each rangeButtons as range}
					<button
						class="view-btn"
						class:active={selectedRange === range}
						disabled={disabledRanges.has(range)}
						onclick={() => (selectedRange = range)}
					>
						{range.toUpperCase()}
					</button>
				{/each}
			</div>
			<span class="controls-separator"></span>
			<button
				class="view-btn"
				class:active={logScale}
				onclick={() => (logScale = !logScale)}
			>
				Log
			</button>
		</div>
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

	.controls {
		display: flex;
		gap: 4px;
		margin-bottom: 8px;
		justify-content: flex-end;
		align-items: center;
		flex-wrap: wrap;
	}

	.control-group {
		display: flex;
		gap: 4px;
	}

	.view-btn {
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

	.view-btn:hover:not(:disabled) {
		background: var(--color-accent, #8dd0c4);
		color: var(--color-bg-primary, #fff);
	}

	.view-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.view-btn.active {
		background: var(--color-accent-deep, #1a8a8a);
		color: #fff;
		border-color: var(--color-accent-deep, #1a8a8a);
	}

	.controls-separator {
		width: 1px;
		height: 20px;
		background: var(--color-border, #b4b8bf);
		margin: 0 4px;
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
