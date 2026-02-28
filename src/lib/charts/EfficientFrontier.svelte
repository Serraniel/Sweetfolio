<script lang="ts">
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import type { SimulatedPortfolio } from '$lib/types';
	import {
		baseAxes,
		createResizeObserver,
		observeThemeChanges,
		BENCHMARK_COLOR,
		COLORS,
		isDarkTheme,
		fmtPct
	} from './utils';

	type ViewMode = 'volatility' | 'sharpe';

	export interface AssetMarker {
		name: string;
		annualizedReturn: number;
		volatility: number;
		color: string;
	}

	interface Props {
		portfolios: SimulatedPortfolio[];
		efficientFrontier: SimulatedPortfolio[];
		benchmark?: SimulatedPortfolio | null;
		assetMarkers?: AssetMarker[];
		height?: number;
		onselect?: (portfolio: SimulatedPortfolio) => void;
	}

	let {
		portfolios,
		efficientFrontier,
		benchmark = null,
		assetMarkers = [],
		height = 400,
		onselect
	}: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let chart: uPlot | undefined;
	let resizeObs: ResizeObserver | undefined;
	let themeObs: MutationObserver | undefined;
	let viewMode: ViewMode = $state('volatility');
	let showSubOptimal: boolean = $state(true);

	function sharpeColor(sharpe: number, maxSharpe: number): string {
		if (maxSharpe <= 0) return COLORS.silver;
		const t = Math.max(0, Math.min(1, sharpe / maxSharpe));
		// Interpolate from silver (low) to deep teal (high)
		const r = Math.round(180 + (26 - 180) * t);
		const g = Math.round(184 + (138 - 184) * t);
		const b = Math.round(191 + (138 - 191) * t);
		return `rgb(${r}, ${g}, ${b})`;
	}

	function drawScatter(u: uPlot): uPlot.Plugin {
		let maxSharpe = 0.01;
		for (const p of portfolios) {
			if (p.sharpeRatio > maxSharpe) maxSharpe = p.sharpeRatio;
		}

		return {
			hooks: {
				drawSeries: [
					(u: uPlot, seriesIdx: number) => {
						if (seriesIdx !== 1) return;
						const ctx = u.ctx;

						// Build a set of frontier portfolio keys for fast lookup
						const frontierKeys = new Set(
							efficientFrontier.map((p) => `${p.volatility},${p.annualizedReturn}`)
						);

						// Draw sub-optimal portfolio dots (grayed out, sampled for large datasets).
						// Batched into a single path for performance — one fill() call instead
						// of thousands of individual beginPath/arc/fill cycles.
						if (showSubOptimal) {
							const maxDots = 50000;
							const step = portfolios.length > maxDots ? Math.ceil(portfolios.length / maxDots) : 1;
							ctx.beginPath();
							ctx.fillStyle = COLORS.silver + '44';
							for (let i = 0; i < portfolios.length; i += step) {
								const p = portfolios[i];
								const key = `${p.volatility},${p.annualizedReturn}`;
								if (frontierKeys.has(key)) continue;
								const cx = u.valToPos(p.volatility, 'x', true);
								const cy = u.valToPos(p.annualizedReturn, 'y', true);
								ctx.moveTo(cx + 2, cy);
								ctx.arc(cx, cy, 2, 0, Math.PI * 2);
							}
							ctx.fill();
						}

						// Draw efficient frontier line (behind dots)
						const dark = isDarkTheme();
						if (efficientFrontier.length > 1) {
							const sorted = [...efficientFrontier].sort((a, b) => a.volatility - b.volatility);
							ctx.beginPath();
							ctx.strokeStyle = COLORS.deepTeal;
							ctx.lineWidth = 2.5;
							for (let i = 0; i < sorted.length; i++) {
								const cx = u.valToPos(sorted[i].volatility, 'x', true);
								const cy = u.valToPos(sorted[i].annualizedReturn, 'y', true);
								if (i === 0) ctx.moveTo(cx, cy);
								else ctx.lineTo(cx, cy);
							}
							ctx.stroke();
						}

						// Draw efficient frontier dots (on top of line, larger, clickable)
						for (const p of efficientFrontier) {
							const cx = u.valToPos(p.volatility, 'x', true);
							const cy = u.valToPos(p.annualizedReturn, 'y', true);
							ctx.beginPath();
							ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
							ctx.fillStyle =
								viewMode === 'sharpe'
									? sharpeColor(p.sharpeRatio, maxSharpe)
									: COLORS.mikuTeal;
							ctx.fill();
							ctx.strokeStyle = dark ? '#222' : '#fff';
							ctx.lineWidth = 1.5;
							ctx.stroke();
						}

						// Draw individual asset markers (small dots, less prominent than benchmark)
						if (assetMarkers.length > 0) {
							for (const am of assetMarkers) {
								const ax = u.valToPos(am.volatility, 'x', true);
								const ay = u.valToPos(am.annualizedReturn, 'y', true);

								ctx.beginPath();
								ctx.arc(ax, ay, 4, 0, Math.PI * 2);
								ctx.fillStyle = am.color;
								ctx.fill();
								ctx.strokeStyle = dark ? '#222' : '#fff';
								ctx.lineWidth = 1;
								ctx.stroke();
							}
						}

						// Draw benchmark dot (most prominent)
						if (benchmark) {
							const bx = u.valToPos(benchmark.volatility, 'x', true);
							const by = u.valToPos(benchmark.annualizedReturn, 'y', true);
							ctx.beginPath();
							ctx.arc(bx, by, 7, 0, Math.PI * 2);
							ctx.fillStyle = BENCHMARK_COLOR;
							ctx.fill();
							ctx.strokeStyle = dark ? '#fff' : '#333';
							ctx.lineWidth = 2;
							ctx.stroke();
						}
					}
				]
			}
		};
	}

	function buildData(): uPlot.AlignedData {
		// We only need min/max for axis scaling; all rendering is done in drawScatter.
		// Use frontier + asset markers + benchmark for range instead of sorting all portfolios.
		const points: Array<{ x: number; y: number }> = [];
		for (const p of efficientFrontier) {
			points.push({ x: p.volatility, y: p.annualizedReturn });
		}
		if (benchmark) {
			points.push({ x: benchmark.volatility, y: benchmark.annualizedReturn });
		}
		for (const am of assetMarkers) {
			points.push({ x: am.volatility, y: am.annualizedReturn });
		}
		// Include sub-optimal range bounds
		if (portfolios.length > 0) {
			let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
			for (const p of portfolios) {
				if (p.volatility < minX) minX = p.volatility;
				if (p.volatility > maxX) maxX = p.volatility;
				if (p.annualizedReturn < minY) minY = p.annualizedReturn;
				if (p.annualizedReturn > maxY) maxY = p.annualizedReturn;
			}
			points.push({ x: minX, y: minY }, { x: maxX, y: maxY });
		}
		// uPlot needs sorted x-values
		points.sort((a, b) => a.x - b.x);
		const xs = new Float64Array(points.map((p) => p.x));
		const ys = new Float64Array(points.map((p) => p.y));
		return [xs, ys];
	}

	function buildOpts(width: number): uPlot.Options {
		const dark = isDarkTheme();
		const axes = baseAxes();
		axes[0].label = 'Volatility';
		axes[0].values = (_u: uPlot, ticks: number[]) => ticks.map((v) => fmtPct(v));
		// @ts-expect-error uPlot axis has time property, not in all type defs
		axes[0].time = false;
		axes[1].label = 'Annualized Return';
		axes[1].values = (_u: uPlot, ticks: number[]) => ticks.map((v) => fmtPct(v));

		return {
			width,
			height,
			cursor: {
				drag: { x: true, y: true },
				points: { show: false }
			},
			legend: { show: false },
			scales: {
				x: { time: false },
				y: {}
			},
			axes,
			series: [
				{},
				{
					label: 'Portfolios',
					stroke: 'transparent',
					fill: 'transparent',
					points: { show: false }
				}
			],
			plugins: [drawScatter({} as uPlot)]
		};
	}

	function isNearFrontierPoint(e: MouseEvent): boolean {
		if (!chart) return false;
		const rect = chart.over.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;
		const rootRect = chart.root.getBoundingClientRect();
		const offsetX = rect.left - rootRect.left;
		const offsetY = rect.top - rootRect.top;

		for (const p of efficientFrontier) {
			const px = chart.valToPos(p.volatility, 'x', true);
			const py = chart.valToPos(p.annualizedReturn, 'y', true);
			const dist = Math.sqrt((px - cx - offsetX) ** 2 + (py - cy - offsetY) ** 2);
			if (dist < 20) return true;
		}
		return false;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!chart) return;
		chart.over.style.cursor = isNearFrontierPoint(e) ? 'pointer' : '';
	}

	function handleClick(e: MouseEvent) {
		if (!chart || !onselect) return;

		const rect = chart.over.getBoundingClientRect();
		const cx = e.clientX - rect.left;
		const cy = e.clientY - rect.top;

		const xVal = chart.posToVal(cx, 'x');
		const yVal = chart.posToVal(cy, 'y');

		// Coordinate offset: valToPos returns canvas-relative coords (includes axis area),
		// but cx/cy are relative to the overlay (plot area only).
		const rootRect = chart.root.getBoundingClientRect();
		const offsetX = rect.left - rootRect.left;
		const offsetY = rect.top - rootRect.top;

		// Find nearest portfolio
		let nearest: SimulatedPortfolio | null = null;
		let minDist = Infinity;
		for (const p of portfolios) {
			const dx = (p.volatility - xVal) * 1000;
			const dy = (p.annualizedReturn - yVal) * 1000;
			const dist = dx * dx + dy * dy;
			if (dist < minDist) {
				minDist = dist;
				nearest = p;
			}
		}

		if (nearest) {
			// Check that the click is reasonably close (within 20px in screen space)
			const px = chart.valToPos(nearest.volatility, 'x', true);
			const py = chart.valToPos(nearest.annualizedReturn, 'y', true);
			const screenDist = Math.sqrt((px - cx - offsetX) ** 2 + (py - cy - offsetY) ** 2);
			if (screenDist < 20) {
				onselect(nearest);
			}
		}
	}

	function createChart() {
		if (!container) return;
		chart?.destroy();

		const width = container.clientWidth || 600;
		chart = new uPlot(buildOpts(width), buildData(), container);
		chart.over.addEventListener('click', handleClick);
		chart.over.addEventListener('mousemove', handleMouseMove);
	}

	$effect(() => {
		void portfolios;
		void efficientFrontier;
		void benchmark;
		void assetMarkers;
		void viewMode;
		void showSubOptimal;

		if (!container) return;

		createChart();

		resizeObs = createResizeObserver(container, (w) => {
			chart?.setSize({ width: w, height });
		});

		themeObs = observeThemeChanges(() => createChart());

		return () => {
			chart?.over.removeEventListener('click', handleClick);
			chart?.over.removeEventListener('mousemove', handleMouseMove);
			chart?.destroy();
			resizeObs?.disconnect();
			themeObs?.disconnect();
		};
	});
</script>

{#if portfolios.length === 0}
	<div class="chart-empty">
		<p>No simulation results to display.</p>
	</div>
{:else}
	<div class="chart-wrapper">
		<div class="controls">
			<button
				class="view-btn"
				class:active={viewMode === 'volatility'}
				onclick={() => (viewMode = 'volatility')}
			>
				Volatility View
			</button>
			<button
				class="view-btn"
				class:active={viewMode === 'sharpe'}
				onclick={() => (viewMode = 'sharpe')}
			>
				Sharpe Ratio View
			</button>
			<span class="controls-separator"></span>
			<button
				class="view-btn"
				class:active={showSubOptimal}
				onclick={() => (showSubOptimal = !showSubOptimal)}
			>
				{showSubOptimal ? 'Hide' : 'Show'} Sub-optimal
			</button>
		</div>
		<div bind:this={container} class="chart-container"></div>
		{#if benchmark}
			<div class="chart-legend">
				<span class="legend-item">
					<span class="legend-dot benchmark-dot"></span>
					Benchmark
				</span>
			</div>
		{/if}
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

	.view-btn:hover {
		background: var(--color-accent, #8dd0c4);
		color: var(--color-bg-primary, #fff);
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

	.chart-legend {
		display: flex;
		gap: 12px;
		padding: 6px 0 0;
		justify-content: flex-start;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
		color: var(--color-text-muted, #8a8d94);
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.benchmark-dot {
		background: #e8175d;
		box-shadow: 0 0 0 1.5px var(--color-text-primary, #333);
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
