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
		COLORS,
		isDarkTheme,
		fmtPct
	} from './utils';

	interface Props {
		prices: PricePoint[];
		label?: string;
		height?: number;
	}

	let { prices, label = 'Drawdown', height = 280 }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let chart: uPlot | undefined;
	let resizeObs: ResizeObserver | undefined;
	let themeObs: MutationObserver | undefined;

	function computeDrawdown(prices: PricePoint[]): { dates: number[]; values: number[]; maxIdx: number } {
		if (prices.length === 0) return { dates: [], values: [], maxIdx: 0 };

		const dates: number[] = [];
		const values: number[] = [];
		let peak = prices[0].close;
		let maxDrawdown = 0;
		let maxIdx = 0;

		for (let i = 0; i < prices.length; i++) {
			const p = prices[i];
			if (p.close > peak) peak = p.close;
			const dd = peak > 0 ? (p.close - peak) / peak : 0;
			dates.push(dateToUnix(p.date));
			values.push(dd);
			if (dd < maxDrawdown) {
				maxDrawdown = dd;
				maxIdx = i;
			}
		}

		return { dates, values, maxIdx };
	}

	function drawMaxPoint(maxIdx: number): uPlot.Plugin {
		return {
			hooks: {
				draw: [
					(u: uPlot) => {
						if (maxIdx < 0 || maxIdx >= u.data[0].length) return;
						const xVal = u.data[0][maxIdx];
						const yVal = u.data[1]?.[maxIdx];
						if (xVal == null || yVal == null) return;
						const ctx = u.ctx;
						const cx = u.valToPos(xVal, 'x', true);
						const cy = u.valToPos(yVal, 'y', true);

						ctx.beginPath();
						ctx.arc(cx, cy, 5, 0, Math.PI * 2);
						ctx.fillStyle = COLORS.hotPink;
						ctx.fill();
						ctx.strokeStyle = '#fff';
						ctx.lineWidth = 1.5;
						ctx.stroke();
					}
				]
			}
		};
	}

	function buildData(): { data: uPlot.AlignedData; maxIdx: number } {
		const dd = computeDrawdown(prices);
		return {
			data: [new Float64Array(dd.dates), new Float64Array(dd.values)],
			maxIdx: dd.maxIdx
		};
	}

	function buildOpts(width: number, maxIdx: number): uPlot.Options {
		const dark = isDarkTheme();
		const axes = baseAxes();
		axes[1].values = (_u: uPlot, ticks: number[]) => ticks.map((v) => fmtPct(v));

		return {
			width,
			height,
			cursor: {
				drag: { x: true, y: false },
				focus: { prox: 16 }
			},
			legend: { show: false },
			scales: { x: { time: true } },
			axes,
			series: [
				{},
				{
					label,
					stroke: COLORS.hotPink,
					fill: dark ? 'rgba(232, 23, 93, 0.15)' : 'rgba(232, 23, 93, 0.1)',
					width: 1.5,
					points: { show: false }
				}
			],
			plugins: [
				tooltipPlugin((_si, _di, val) => (val != null ? fmtPct(val) : '---')),
				drawMaxPoint(maxIdx)
			]
		};
	}

	function createChart() {
		if (!container) return;
		chart?.destroy();

		const width = container.clientWidth || 600;
		const { data, maxIdx } = buildData();
		chart = new uPlot(buildOpts(width, maxIdx), data, container);
	}

	$effect(() => {
		void prices;

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

{#if prices.length < 2}
	<div class="chart-empty">
		<p>Not enough data to display the drawdown chart.</p>
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

	.chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		color: var(--color-text-muted, #8a8d94);
		font-size: 13px;
	}
</style>
