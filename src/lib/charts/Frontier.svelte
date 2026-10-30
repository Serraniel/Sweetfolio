<script lang="ts">
	/**
	 * Efficient frontier scatter on canvas (MC-6, MC-7, CH-4): handles 100k points,
	 * Sharpe colouring, frontier line, asset & benchmark markers, dominance
	 * highlighting and tap-to-inspect via a spatial grid.
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
		selected = null,
		onselect,
		height = 420
	}: {
		result: MonteCarloResult;
		colorBySharpe?: boolean;
		markers?: Marker[];
		dominating?: Set<number> | null;
		selected?: number | null;
		onselect?: (index: number) => void;
		height?: number;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let wrap: HTMLDivElement | undefined = $state();
	let width = $state(0);
	let hover = $state<number | null>(null);
	const PAD = { l: 52, r: 14, t: 12, b: 34 };

	const bounds = $derived.by(() => {
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
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
			if (s < s0) s0 = s;
			if (s > s1) s1 = s;
		}
		for (const m of markers) {
			x0 = Math.min(x0, m.volatility);
			x1 = Math.max(x1, m.volatility);
			y0 = Math.min(y0, m.annualizedReturn);
			y1 = Math.max(y1, m.annualizedReturn);
		}
		const px = (x1 - x0) * 0.06 || 0.01;
		const py = (y1 - y0) * 0.08 || 0.01;
		return { x0: Math.max(0, x0 - px), x1: x1 + px, y0: y0 - py, y1: y1 + py, s0, s1 };
	});

	const sx = (v: number) => PAD.l + ((v - bounds.x0) / (bounds.x1 - bounds.x0)) * (width - PAD.l - PAD.r);
	const sy = (v: number) => PAD.t + (1 - (v - bounds.y0) / (bounds.y1 - bounds.y0)) * (height - PAD.t - PAD.b);

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

		// points
		grid = new Map();
		const r = result.count > 20000 ? 1.4 : 2;
		const range = bounds.s1 - bounds.s0 || 1;
		const buckets = 24;
		const paths: Path2D[] = Array.from({ length: buckets }, () => new Path2D());
		const domPath = new Path2D();
		for (let i = 0; i < result.count; i++) {
			const x = sx(result.volatilities[i]!);
			const y = sy(result.returns[i]!);
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

		// frontier
		if (result.frontier.length > 1) {
			ctx.strokeStyle = text;
			ctx.lineWidth = 2;
			ctx.beginPath();
			result.frontier.forEach((idx, k) => {
				const x = sx(result.volatilities[idx]!);
				const y = sy(result.returns[idx]!);
				if (k) ctx.lineTo(x, y);
				else ctx.moveTo(x, y);
			});
			ctx.stroke();
		}

		// markers
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		for (const m of markers) {
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
	});

	function nearest(e: PointerEvent): number | null {
		const rect = canvas!.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
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
		onpointermove={(e) => e.pointerType === 'mouse' && (hover = nearest(e))}
		onpointerleave={() => (hover = null)}
		onclick={(e) => {
			const i = nearest(e as unknown as PointerEvent);
			if (i !== null) onselect?.(i);
		}}
	></canvas>
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
		width: 16px;
		height: 2px;
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
