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
	 * Optional log scale (CH-7): prices directly, % mode as growth factor 1 + r
	 * (returns can be negative) with the labels still in %.
	 */
	import { untrack } from 'svelte';
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import { toDayNumber } from '#lib/core/dates.ts';
	import { theme } from '#lib/state/theme.svelte.ts';
	import { chartPrefs } from '#lib/state/chart-prefs.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import Segmented from '#lib/ui/Segmented.svelte';
	import { colorAt, cssVar, resolveColor, withAlpha } from './palette.ts';
	import { availableRanges, RANGES, rangeStart, type RangeKey } from './ranges.ts';
	import { logTicks } from './ticks.ts';

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
		allowLog = true,
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
		/** Offer the log scale switch (only for value / % charts with controls, never for percent series like drawdowns). */
		allowLog?: boolean;
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
	const logAvailable = $derived(allowLog && format !== 'percent' && (showRange || allowRelative));
	const log = $derived(logAvailable && chartPrefs.log);
	/** In log + % mode the data holds growth factors; convert back to returns for display. */
	const shown = (v: number) => (log && mode === 'relative' ? v - 1 : v);

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
			for (const p of s) {
				let v = mode === 'relative' && base ? p.close / base - (log ? 0 : 1) : p.close;
				// A log axis cannot show zero or negative values.
				arr[index.get(p.date)!] = log && v <= 0 ? null : v;
			}
			return arr;
		});
		return { dates, data: [xs, ...ys] as uPlot.AlignedData };
	});

	function formatValue(v: number | null | undefined, short = false): string {
		if (v === null || v === undefined) return '–';
		v = shown(v);
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
		void log;
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
			scales: {
				x: { time: true },
				// uPlot rounds log ranges out to powers of ten; fit the data with a little headroom instead.
				y: log ? { distr: 3, log: 10, range: (_u, min, max) => [min / 1.04, max * 1.04] } : {}
			},
			axes: [
				{ stroke: axis, grid: { stroke: grid, width: 1 }, ticks: { show: false }, font: '11px system-ui', space: 70 },
				{
					stroke: axis,
					grid: { stroke: grid, width: 1 },
					ticks: { show: false },
					font: '11px system-ui',
					size: 56,
					...(log
						? {
								splits: (_u: uPlot, _i: number, min: number, max: number) =>
									logTicks(min, max, Math.max(3, Math.floor(height / 55)), mode === 'relative'),
								filter: (_u: uPlot, splits: number[]) => splits
							}
						: {}),
					values: (_u, vals) => {
						if (log && mode === 'relative')
							return vals.map((v) => {
								if (v === null) return '';
								const r = v - 1;
								return fmt.pct(r, Number.isInteger(Math.round(r * 1000) / 10) ? 0 : 1);
							});
						if (log) return vals.map((v) => (v === null ? '' : formatValue(v, true)));
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
			<div class="row scale">
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
				{#if logAvailable}
					<button
						type="button"
						class="log-toggle"
						class:on={log}
						aria-pressed={log}
						title="Logarithmic scale: equal percentage moves have equal height"
						onclick={() => chartPrefs.setLog(!chartPrefs.log)}>Log</button
					>
				{/if}
			</div>
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
	.scale {
		--gap: 6px;
		margin-left: auto;
	}
	.log-toggle {
		min-height: 32px;
		padding: 4px 12px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface-solid);
		color: var(--muted);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.log-toggle.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
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
