<script lang="ts">
	/**
	 * Efficient frontier scatter on canvas (MC-6, MC-7, CH-4): handles 100k points,
	 * Sharpe colouring, frontier line, asset & benchmark markers, dominance
	 * highlighting and tap-to-inspect via a spatial grid. Drag to zoom (mouse/pen),
	 * double-click or "Reset zoom" to go back.
	 */
	import type { MonteCarloResult } from '#lib/domain/types.ts';
	import { theme } from '#lib/state/theme.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import { cssVar, withAlpha } from './palette.ts';

	interface Marker {
		label: string;
		volatility: number;
		annualizedReturn: number;
		color?: string;
		kind?: 'asset' | 'benchmark';
	}

	let {
		result,
		colorBySharpe = true,
		markers = [],
		dominating = null,
		onlyDominating = false,
		selected = null,
		onselect,
		height = 420
	}: {
		result: MonteCarloResult;
		colorBySharpe?: boolean;
		markers?: Marker[];
		dominating?: Set<number> | null;
		/** Hide portfolios that do not beat the benchmark and fit the axes to the rest. */
		onlyDominating?: boolean;
		selected?: number | null;
		onselect?: (index: number) => void;
		height?: number;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let wrap: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let hover = $state<number | null>(null);
	const PAD = { l: 52, r: 14, t: 12, b: 34 };
	let view = $state<{ x0: number; x1: number; y0: number; y1: number } | null>(null);
	let drag = $state<{ x: number; y: number; x2: number; y2: number } | null>(null);
	let dragged = $state(false);
	const frontierSet = $derived(new Set(result.frontier));
	const visible = (i: number) => !onlyDominating || !!dominating?.has(i) || frontierSet.has(i);

	$effect(() => {
		void result;
		void onlyDominating;
		view = null;
	});

	const auto = $derived.by(() => {
		let x0 = Infinity,
			x1 = -Infinity,
			y0 = Infinity,
			y1 = -Infinity,
			s0 = Infinity,
			s1 = -Infinity;
		for (let i = 0; i < result.count; i++) {
			const x = result.volatilities[i]!,
				y = result.returns[i]!,
				s = result.sharpes[i]!;
			if (s < s0) s0 = s;
			if (s > s1) s1 = s;
			if (!visible(i)) continue;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		}
		for (const m of markers) {
			if (onlyDominating && m.kind !== 'benchmark') continue;
			x0 = Math.min(x0, m.volatility);
			x1 = Math.max(x1, m.volatility);
			y0 = Math.min(y0, m.annualizedReturn);
			y1 = Math.max(y1, m.annualizedReturn);
		}
		const px = (x1 - x0) * 0.06 || 0.01;
		const py = (y1 - y0) * 0.08 || 0.01;
		return { x0: Math.max(0, x0 - px), x1: x1 + px, y0: y0 - py, y1: y1 + py, s0, s1 };
	});
	const bounds = $derived(view ? { ...auto, ...view } : auto);

	const sx = (v: number) => PAD.l + ((v - bounds.x0) / (bounds.x1 - bounds.x0)) * (width - PAD.l - PAD.r);
	const sy = (v: number) => PAD.t + (1 - (v - bounds.y0) / (bounds.y1 - bounds.y0)) * (height - PAD.t - PAD.b);
	const ix = (px: number) => bounds.x0 + ((px - PAD.l) / (width - PAD.l - PAD.r)) * (bounds.x1 - bounds.x0);
	const iy = (py: number) => bounds.y0 + (1 - (py - PAD.t) / (height - PAD.t - PAD.b)) * (bounds.y1 - bounds.y0);
	const inPlot = (x: number, y: number) => x >= PAD.l && x <= width - PAD.r && y >= PAD.t && y <= height - PAD.b;

	let grid = new Map<number, number[]>();
	const CELL = 10;

	function ticks(a: number, b: number, n: number): number[] {
		const step = Math.pow(10, Math.floor(Math.log10((b - a) / n)));
		const err = (b - a) / n / step;
		const s = step * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
		const out: number[] = [];
		for (let v = Math.ceil(a / s) * s; v <= b; v += s) out.push(v);
		return out;
	}

	$effect(() => {
		if (!wrap) return;
		const ro = new ResizeObserver((e) => (width = Math.floor(e[0]!.contentRect.width)));
		ro.observe(wrap);
		return () => ro.disconnect();
	});

	$effect(() => {
		if (!canvas || width === 0) return;
		void theme.resolved;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		const axis = cssVar('--chart-axis');
		const gridC = cssVar('--chart-grid');
		const teal = cssVar('--chart-1');
		const pink = cssVar('--chart-2');
		const silver = cssVar('--silver');
		const text = cssVar('--text');
		ctx.font = '11px system-ui, sans-serif';

		// grid + axes
		ctx.strokeStyle = gridC;
		ctx.fillStyle = axis;
		ctx.lineWidth = 1;
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		const digits = (t: number[]) => (t.length > 1 ? Math.max(0, Math.min(3, Math.ceil(-Math.log10((t[1]! - t[0]!) * 100) + 1e-9))) : 0);
		const yTicks = ticks(bounds.y0, bounds.y1, 6);
		const yd = digits(yTicks);
		for (const t of yTicks) {
			const y = sy(t);
			ctx.beginPath();
			ctx.moveTo(PAD.l, y);
			ctx.lineTo(width - PAD.r, y);
			ctx.stroke();
			ctx.fillText(fmt.pct(t, yd), PAD.l - 6, y);
		}
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		const xTicks = ticks(bounds.x0, bounds.x1, Math.max(3, Math.floor(width / 90)));
		const xd = digits(xTicks);
		for (const t of xTicks) {
			const x = sx(t);
			ctx.beginPath();
			ctx.moveTo(x, PAD.t);
			ctx.lineTo(x, height - PAD.b);
			ctx.stroke();
			ctx.fillText(fmt.pct(t, xd), x, height - PAD.b + 6);
		}
		ctx.fillText('Volatility', (PAD.l + width - PAD.r) / 2, height - 14);
		ctx.save();
		ctx.translate(12, (PAD.t + height - PAD.b) / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText('Return p.a.', 0, -6);
		ctx.restore();

		// everything below is clipped to the plot area (zoom)
		ctx.save();
		ctx.beginPath();
		ctx.rect(PAD.l, PAD.t, width - PAD.l - PAD.r, height - PAD.t - PAD.b);
		ctx.clip();

		// points
		grid = new Map();
		const r = result.count > 20000 ? 1.4 : 2;
		const range = bounds.s1 - bounds.s0 || 1;
		const buckets = 24;
		const paths: Path2D[] = Array.from({ length: buckets }, () => new Path2D());
		const domPath = new Path2D();
		for (let i = 0; i < result.count; i++) {
			if (!visible(i)) continue;
			const x = sx(result.volatilities[i]!);
			const y = sy(result.returns[i]!);
			if (!inPlot(x, y)) continue;
			const key = Math.floor(x / CELL) * 100000 + Math.floor(y / CELL);
			const cell = grid.get(key);
			if (cell) cell.push(i);
			else grid.set(key, [i]);
			if (dominating?.has(i)) {
				domPath.moveTo(x + r, y);
				domPath.arc(x, y, r, 0, Math.PI * 2);
				continue;
			}
			const b = colorBySharpe ? Math.min(buckets - 1, Math.floor(((result.sharpes[i]! - bounds.s0) / range) * buckets)) : 0;
			paths[b]!.moveTo(x + r, y);
			paths[b]!.arc(x, y, r, 0, Math.PI * 2);
		}
		paths.forEach((p, b) => {
			if (colorBySharpe) {
				const t = b / (buckets - 1);
				ctx.fillStyle = `color-mix(in srgb, ${teal} ${Math.round(t * 100)}%, ${pink})`;
				ctx.globalAlpha = 0.55;
			} else {
				ctx.fillStyle = silver;
				ctx.globalAlpha = 0.45;
			}
			ctx.fill(p);
		});
		if (dominating?.size) {
			ctx.globalAlpha = 0.9;
			ctx.fillStyle = cssVar('--chart-4');
			ctx.fill(domPath);
		}
		ctx.globalAlpha = 1;

		// frontier: a thin, translucent line so nearby portfolios stay visible, with its
		// portfolios drawn as dots on top
		if (result.frontier.length > 1) {
			ctx.strokeStyle = text;
			ctx.lineWidth = 1.25;
			ctx.globalAlpha = 0.5;
			ctx.beginPath();
			result.frontier.forEach((idx, k) => {
				const x = sx(result.volatilities[idx]!);
				const y = sy(result.returns[idx]!);
				if (k) ctx.lineTo(x, y);
				else ctx.moveTo(x, y);
			});
			ctx.stroke();
			ctx.globalAlpha = 1;
		}
		ctx.fillStyle = text;
		ctx.strokeStyle = cssVar('--surface-solid');
		ctx.lineWidth = 1;
		for (const idx of result.frontier) {
			ctx.beginPath();
			ctx.arc(sx(result.volatilities[idx]!), sy(result.returns[idx]!), 2.75, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}

		// markers
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		for (const m of markers) {
			if (onlyDominating && m.kind !== 'benchmark') continue;
			const x = sx(m.volatility);
			const y = sy(m.annualizedReturn);
			ctx.fillStyle = m.color ?? (m.kind === 'benchmark' ? pink : text);
			ctx.strokeStyle = cssVar('--surface-solid');
			ctx.lineWidth = 2;
			ctx.beginPath();
			if (m.kind === 'benchmark') {
				ctx.moveTo(x, y - 7);
				ctx.lineTo(x + 7, y);
				ctx.lineTo(x, y + 7);
				ctx.lineTo(x - 7, y);
				ctx.closePath();
			} else ctx.arc(x, y, 5, 0, Math.PI * 2);
			ctx.stroke();
			ctx.fill();
			ctx.fillStyle = text;
			const label = m.label.length > 22 ? `${m.label.slice(0, 21)}…` : m.label;
			const tx = x + 9 + ctx.measureText(label).width > width - PAD.r ? x - 9 - ctx.measureText(label).width : x + 9;
			ctx.fillText(label, tx, y);
		}

		// selection / hover
		for (const [idx, ring] of [
			[selected, 7],
			[hover, 5]
		] as const) {
			if (idx === null || idx === undefined || idx >= result.count) continue;
			ctx.strokeStyle = text;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(sx(result.volatilities[idx]!), sy(result.returns[idx]!), ring, 0, Math.PI * 2);
			ctx.stroke();
		}
		ctx.restore();
	});

	function local(e: PointerEvent) {
		const rect = canvas!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function startDrag(e: PointerEvent) {
		if (e.pointerType === 'touch' || e.button !== 0) return;
		const p = local(e);
		if (!inPlot(p.x, p.y)) return;
		drag = { x: p.x, y: p.y, x2: p.x, y2: p.y };
		dragged = false;
		canvas!.setPointerCapture(e.pointerId);
	}

	function moveDrag(e: PointerEvent) {
		if (!drag) return;
		const p = local(e);
		drag = {
			...drag,
			x2: Math.min(width - PAD.r, Math.max(PAD.l, p.x)),
			y2: Math.min(height - PAD.b, Math.max(PAD.t, p.y))
		};
		if (Math.abs(drag.x2 - drag.x) > 6 || Math.abs(drag.y2 - drag.y) > 6) {
			dragged = true;
			hover = null;
		}
	}

	function endDrag() {
		if (!drag) return;
		const d = drag;
		drag = null;
		if (!dragged || Math.abs(d.x2 - d.x) < 8 || Math.abs(d.y2 - d.y) < 8) return;
		view = {
			x0: ix(Math.min(d.x, d.x2)),
			x1: ix(Math.max(d.x, d.x2)),
			y0: iy(Math.max(d.y, d.y2)),
			y1: iy(Math.min(d.y, d.y2))
		};
	}

	function nearest(e: PointerEvent): number | null {
		const { x, y } = local(e);
		const radius = e.pointerType === 'touch' ? 22 : 12;
		let best: number | null = null;
		let bestD = radius * radius;
		const cx = Math.floor(x / CELL);
		const cy = Math.floor(y / CELL);
		const span = Math.ceil(radius / CELL);
		for (let i = cx - span; i <= cx + span; i++)
			for (let j = cy - span; j <= cy + span; j++)
				for (const idx of grid.get(i * 100000 + j) ?? []) {
					const dx = sx(result.volatilities[idx]!) - x;
					const dy = sy(result.returns[idx]!) - y;
					const d = dx * dx + dy * dy;
					if (d < bestD) {
						bestD = d;
						best = idx;
					}
				}
		return best;
	}
</script>

<div class="frontier" bind:this={wrap} role="figure" aria-label="Efficient frontier: {result.count} simulated portfolios">
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<canvas
		bind:this={canvas}
		style="height: {height}px"
		aria-hidden="true"
		onpointerdown={startDrag}
		onpointermove={(e) => {
			moveDrag(e);
			if (e.pointerType === 'mouse' && !drag) hover = nearest(e);
		}}
		onpointerup={endDrag}
		onpointercancel={() => (drag = null)}
		onpointerleave={() => (hover = null)}
		ondblclick={() => (view = null)}
		onclick={(e) => {
			if (dragged) {
				dragged = false;
				return;
			}
			const i = nearest(e as unknown as PointerEvent);
			if (i !== null) onselect?.(i);
		}}
	></canvas>
	{#if drag && dragged}
		<div
			class="zoom-box"
			style="left: {Math.min(drag.x, drag.x2)}px; top: {Math.min(drag.y, drag.y2)}px; width: {Math.abs(
				drag.x2 - drag.x
			)}px; height: {Math.abs(drag.y2 - drag.y)}px"
		></div>
	{/if}
	{#if view}
		<button class="reset xs" onclick={() => (view = null)}>Reset zoom</button>
	{/if}
	{#if hover !== null}
		<div class="tip xs" style="left: {sx(result.volatilities[hover]!)}px; top: {sy(result.returns[hover]!)}px">
			<span>Return <b class="num">{fmt.pct(result.returns[hover]!)}</b></span>
			<span>Vol. <b class="num">{fmt.pct(result.volatilities[hover]!)}</b></span>
			<span>Sharpe <b class="num">{fmt.num(result.sharpes[hover]!)}</b></span>
		</div>
	{/if}
	<div class="legend xs muted">
		{#if colorBySharpe}<span class="grad"><i></i>Sharpe low → high</span>{/if}
		<span><i class="line"></i>Efficient frontier</span>
		{#if markers.some((m) => m.kind === 'benchmark')}<span><i class="diamond"></i>Benchmark</span>{/if}
		{#if dominating?.size}<span><i class="dot dom"></i>Beats benchmark ({dominating.size})</span>{/if}
		<span class="zoom-hint">Drag to zoom, double-click to reset</span>
	</div>
</div>

<style>
	.frontier {
		position: relative;
		min-width: 0;
	}
	canvas {
		width: 100%;
		cursor: crosshair;
		touch-action: pan-y;
	}
	.tip {
		position: absolute;
		transform: translate(-50%, calc(-100% - 12px));
		display: flex;
		flex-direction: column;
		padding: 6px 8px;
		border-radius: var(--radius-sm);
		background: var(--surface-solid);
		box-shadow: var(--shadow);
		pointer-events: none;
		white-space: nowrap;
	}
	.zoom-box {
		position: absolute;
		border: 1px solid var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		pointer-events: none;
	}
	.reset {
		position: absolute;
		top: 8px;
		right: 18px;
		padding: 4px 10px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: var(--surface-solid);
		font-weight: 600;
	}
	@media (hover: none) {
		.zoom-hint {
			display: none;
		}
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin-top: var(--space-2);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.grad i {
		width: 40px;
		height: 6px;
		border-radius: 3px;
		background: linear-gradient(90deg, var(--chart-2), var(--chart-1));
	}
	.line {
		position: relative;
		width: 16px;
		height: 1px;
		background: color-mix(in srgb, var(--text) 50%, transparent);
	}
	.line::after {
		content: '';
		position: absolute;
		left: 5px;
		top: -2.5px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text);
	}
	.diamond {
		width: 8px;
		height: 8px;
		transform: rotate(45deg);
		background: var(--chart-2);
	}
	.dom {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--chart-4);
	}
</style>
