<script lang="ts" module>
	import type { PricePoint } from '#lib/domain/types.ts';

	export interface LineSeries {
		label: string;
		data: readonly PricePoint[];
		color?: string;
		dashed?: boolean;
		fill?: boolean;
		width?: number;
	}
</script>

<script lang="ts">
	/**
	 * Responsive, theme-aware time series chart on uPlot (CH-1, CH-2, CH-6, UI-6).
	 */
	import { untrack } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import { toDayNumber } from '#lib/core/dates.ts';
	import { theme } from '#lib/state/theme.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { colorAt, cssVar, resolveColor, withAlpha } from './palette.ts';
	import { availableRanges, RANGES, rangeStart, type RangeKey } from './ranges.ts';

	type Mode = 'value' | 'relative';
	let {
		series,
		format = 'number',
		currency = 'EUR',
		height = 300,
		showRange = true,
		allowRelative = false,
		mode = $bindable<Mode>('value'),
		range = $bindable<RangeKey>('max'),
		label = 'Chart'
	}: {
		series: LineSeries[];
		format?: 'number' | 'currency' | 'percent';
		currency?: string;
		height?: number;
		showRange?: boolean;
		allowRelative?: boolean;
		mode?: Mode;
		range?: RangeKey;
		label?: string;
	} = $props();

	let container: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let cursorIdx = $state<number | null>(null);

	const lastDate = $derived(series.reduce((m, s) => (s.data.length && s.data.at(-1)!.date > m ? s.data.at(-1)!.date : m), ''));
	const firstDate = $derived(series.reduce((m, s) => (s.data.length && (!m || s.data[0]!.date < m) ? s.data[0]!.date : m), ''));
	// Latest start among the series: "Max" begins here so all lines are comparable.
	const commonDate = $derived(series.reduce((m, s) => (s.data.length && s.data[0]!.date > m ? s.data[0]!.date : m), ''));
	const enabled = $derived(availableRanges(commonDate || undefined, lastDate || undefined, firstDate || undefined));
	const effectiveFormat = $derived(mode === 'relative' ? 'percent' : format);

	/** Union of dates → aligned uPlot data, optionally rebased (relative mode). */
	const prepared = $derived.by(() => {
		const start = range === 'max' ? commonDate || null : lastDate ? rangeStart(range, lastDate) : null;
		const sliced = series.map((s) => (start ? s.data.filter((p) => p.date >= start) : s.data));
		const dates = [...new Set(sliced.flatMap((s) => s.map((p) => p.date)))].sort();
		const index = new Map(dates.map((d, i) => [d, i]));
		const xs = new Float64Array(dates.length);
		dates.forEach((d, i) => (xs[i] = toDayNumber(d) * 86400));
		const ys = sliced.map((s) => {
			const arr: Array<number | null> = new Array(dates.length).fill(null);
			const base = s[0]?.close;
			for (const p of s) arr[index.get(p.date)!] = mode === 'relative' && base ? p.close / base - 1 : p.close;
			return arr;
		});
		return { dates, data: [xs, ...ys] as uPlot.AlignedData };
	});

	function formatValue(v: number | null | undefined, short = false): string {
		if (v === null || v === undefined) return '–';
		if (effectiveFormat === 'percent') return fmt.pct(v, short ? 0 : 2);
		if (effectiveFormat === 'currency') return short ? fmt.compact(v) : fmt.money(v, currency);
		return short ? fmt.compact(v) : fmt.num(v);
	}

	const legend = $derived.by(() => {
		const n = prepared.dates.length;
		if (!n) return null;
		const idx = cursorIdx ?? n - 1;
		return {
			date: prepared.dates[idx],
			values: series.map((s, i) => {
				let v = prepared.data[i + 1]![idx] as number | null;
				if (v === null) for (let k = idx; k >= 0 && v === null; k--) v = prepared.data[i + 1]![k] as number | null;
				return { label: s.label, color: s.color ?? colorAt(i), value: v };
			})
		};
	});

	$effect(() => {
		if (!container) return;
		const ro = new ResizeObserver((entries) => (width = Math.floor(entries[0]!.contentRect.width)));
		ro.observe(container);
		return () => ro.disconnect();
	});

	let chart: uPlot | null = null;
	const ready = $derived(width > 0);
	const structure = $derived(series.map((s, i) => `${s.label}|${s.color ?? i}|${s.dashed}|${s.fill}|${s.width}`).join(';'));

	// Build the chart only when its structure, format or theme changes.
	$effect(() => {
		if (!container || !ready) return;
		void theme.resolved;
		void structure;
		void effectiveFormat;
		void height;
		const grid = cssVar('--chart-grid');
		const axis = cssVar('--chart-axis');
		const touch = matchMedia('(pointer: coarse)').matches;
		const opts: uPlot.Options = {
			width: untrack(() => width),
			height,
			padding: [8, 4, 0, 0],
			legend: { show: false },
			cursor: {
				drag: { x: !touch, y: false, setScale: !touch },
				points: { size: 7 },
				y: false
			},
			scales: { x: { time: true } },
			axes: [
				{ stroke: axis, grid: { stroke: grid, width: 1 }, ticks: { show: false }, font: '11px system-ui', space: 70 },
				{
					stroke: axis,
					grid: { stroke: grid, width: 1 },
					ticks: { show: false },
					font: '11px system-ui',
					size: 56,
					values: (_u, vals) => {
						if (effectiveFormat !== 'percent' || vals.length < 2) return vals.map((v) => formatValue(v, true));
						const step = Math.abs(vals[1]! - vals[0]!) * 100;
						const d = Math.max(0, Math.min(3, Math.ceil(-Math.log10(step) + 1e-9)));
						return vals.map((v) => fmt.pct(v, d));
					}
				}
			],
			series: [
				{},
				...untrack(() => series).map((s, i) => {
					const color = resolveColor(s.color, i);
					return {
						label: s.label,
						stroke: color,
						width: s.width ?? (i === 0 ? 2 : 1.6),
						dash: s.dashed ? [5, 4] : undefined,
						fill: s.fill ? withAlpha(color, 0.14) : undefined,
						spanGaps: true,
						points: { show: false }
					} satisfies uPlot.Series;
				})
			],
			hooks: {
				setCursor: [(u) => (cursorIdx = u.cursor.idx ?? null)]
			}
		};
		const c = new uPlot(
			opts,
			untrack(() => prepared.data),
			container
		);
		chart = c;
		const leave = () => (cursorIdx = null);
		const reset = () => c.setData(untrack(() => prepared.data));
		c.over.addEventListener('mouseleave', leave);
		c.over.addEventListener('dblclick', reset);
		return () => {
			c.over.removeEventListener('mouseleave', leave);
			c.over.removeEventListener('dblclick', reset);
			c.destroy();
			chart = null;
		};
	});

	$effect(() => {
		const data = prepared.data;
		untrack(() => chart?.setData(data));
	});

	$effect(() => {
		const w = width;
		untrack(() => chart?.setSize({ width: w, height }));
	});

	$effect(() => {
		if (!enabled.includes(range)) range = 'max';
	});
</script>

<div class="line-chart">
	{#if showRange || allowRelative}
		<div class="controls">
			{#if showRange}
				<Segmented
					bind:value={range}
					options={RANGES.filter((r) => r.value !== 'all' || enabled.includes('all'))}
					label="Time range"
					size="sm"
					disabled={RANGES.map((r) => r.value).filter((r) => !enabled.includes(r))}
				/>
			{/if}
			{#if allowRelative}
				<Segmented
					bind:value={mode}
					options={[
						{ value: 'value', label: format === 'currency' ? 'Value' : 'Price' },
						{ value: 'relative', label: '%' }
					]}
					label="Display mode"
					size="sm"
				/>
			{/if}
		</div>
	{/if}
	{#if legend}
		<div class="legend" aria-live="off">
			<span class="xs muted">{fmt.date(legend.date)}</span>
			{#each legend.values as v (v.label)}
				<span class="item small"
					><i style="background: {v.color}"></i><span class="truncate">{v.label}</span> <b class="num">{formatValue(v.value)}</b></span
				>
			{/each}
		</div>
	{/if}
	<div class="plot" bind:this={container} style="height: {height}px" role="img" aria-label={label}></div>
	{#if !prepared.dates.length}<p class="muted small empty">No data to display.</p>{/if}
</div>

<style>
	.line-chart {
		min-width: 0;
	}
	.controls {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-bottom: var(--space-3);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 14px;
		min-height: 22px;
		margin-bottom: 6px;
	}
	.item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		min-width: 0;
	}
	.item i {
		width: 10px;
		height: 3px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.plot {
		width: 100%;
		touch-action: pan-y;
	}
	.empty {
		text-align: center;
		margin-top: -50%;
	}
	.plot :global(.u-select) {
		background: var(--accent-soft);
	}
</style>
