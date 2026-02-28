import type uPlot from 'uplot';

// --- Miku color palette ---

export const COLORS = {
	charcoal: '#3C3F44',
	silver: '#B4B8BF',
	mikuTeal: '#8DD0C4',
	deepTeal: '#1A8A8A',
	hotPink: '#E8175D',
	white: '#FFFFFF',
	lightBg: '#F5F5F5',
	darkBg: '#2E3035'
} as const;

/** Ordered series colors for multi-asset charts (benchmark excluded). */
export const SERIES_COLORS = [
	COLORS.mikuTeal,
	COLORS.deepTeal,
	'#5EAFA0',
	'#3FBFB5',
	'#6AC5C5',
	'#47A0A0',
	'#79D4CB',
	'#2D9999'
] as const;

export const BENCHMARK_COLOR = COLORS.hotPink;

/**
 * Generate N visually distinct, vibrant colors for asset markers.
 * Uses evenly-spaced hues with consistent saturation and lightness
 * so colors feel cohesive while being maximally distinguishable.
 * Avoids the hot-pink hue range reserved for the benchmark.
 */
export function generateAssetColors(count: number): string[] {
	if (count === 0) return [];
	const colors: string[] = [];
	// Use golden-angle spacing for maximum perceptual separation
	const goldenAngle = 137.508;
	// Start at teal-ish hue (170) to match the app's palette feel
	const startHue = 170;
	for (let i = 0; i < count; i++) {
		const hue = (startHue + i * goldenAngle) % 360;
		// Skip hues too close to benchmark pink (330-350)
		const adjustedHue = (hue >= 320 && hue <= 355) ? (hue + 40) % 360 : hue;
		colors.push(`hsl(${adjustedHue.toFixed(0)}, 65%, 55%)`);
	}
	return colors;
}

// --- Theme detection ---

/** Check if the current document theme is dark mode. Returns true on the server. */
export function isDarkTheme(): boolean {
	if (typeof document === 'undefined') return true;
	return document.documentElement.getAttribute('data-theme') === 'dark';
}

function getThemeColors() {
	const dark = isDarkTheme();
	return {
		bg: dark ? COLORS.darkBg : COLORS.white,
		text: dark ? '#F0F0F0' : COLORS.charcoal,
		muted: COLORS.silver,
		grid: dark ? '#555860' : '#E0E0E0',
		border: dark ? '#555860' : COLORS.silver
	};
}

// --- Common axis/grid configuration ---

/** Generate base uPlot axis configuration with theme-aware colors. */
export function baseAxes(): uPlot.Axis[] {
	const theme = getThemeColors();
	return [
		{
			stroke: theme.text,
			grid: { stroke: theme.grid, width: 1 },
			ticks: { stroke: theme.grid, width: 1, size: 4 },
			font: '11px system-ui, -apple-system, sans-serif',
			labelFont: '12px system-ui, -apple-system, sans-serif',
			labelGap: 6
		},
		{
			stroke: theme.text,
			grid: { stroke: theme.grid, width: 1 },
			ticks: { stroke: theme.grid, width: 1, size: 4 },
			font: '11px system-ui, -apple-system, sans-serif',
			labelFont: '12px system-ui, -apple-system, sans-serif',
			labelGap: 8,
			size: 60
		}
	];
}

// --- Tooltip building via DOM methods ---

function createTooltipLine(color: string, label: string, formatted: string): HTMLElement {
	const line = document.createElement('div');

	const dot = document.createElement('span');
	dot.style.color = color;
	dot.textContent = '\u25CF ';
	line.appendChild(dot);

	const text = document.createTextNode(`${label}: ${formatted}`);
	line.appendChild(text);

	return line;
}

// --- Tooltip plugin ---

export interface TooltipFormatter {
	(seriesIdx: number, dataIdx: number, value: number | null): string;
}

/** uPlot plugin that renders a theme-aware tooltip on cursor hover. */
export function tooltipPlugin(formatValue?: TooltipFormatter): uPlot.Plugin {
	let tooltip: HTMLDivElement;
	let over: HTMLElement;

	function init(u: uPlot) {
		over = u.over;
		tooltip = document.createElement('div');
		tooltip.className = 'uplot-tooltip';
		tooltip.style.cssText =
			'display:none;position:absolute;pointer-events:none;z-index:100;' +
			'padding:6px 10px;border-radius:6px;font-size:12px;line-height:1.5;' +
			'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
			'box-shadow:0 2px 8px rgba(0,0,0,0.15);max-width:260px;white-space:nowrap;';
		over.appendChild(tooltip);
	}

	function setCursor(u: uPlot) {
		const { idx } = u.cursor;
		if (idx == null) {
			tooltip.style.display = 'none';
			return;
		}

		const dark = isDarkTheme();
		tooltip.style.background = dark ? 'rgba(46,48,53,0.92)' : 'rgba(255,255,255,0.92)';
		tooltip.style.color = dark ? '#F0F0F0' : COLORS.charcoal;
		tooltip.style.border = `1px solid ${dark ? '#555860' : '#ddd'}`;

		const xVal = u.data[0][idx];
		const date = new Date(xVal * 1000);
		const dateStr = date.toLocaleDateString('de-DE', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});

		// Build tooltip content via DOM methods
		tooltip.textContent = '';

		const header = document.createElement('strong');
		header.textContent = dateStr;
		tooltip.appendChild(header);

		for (let i = 1; i < u.series.length; i++) {
			const s = u.series[i];
			if (!s.show) continue;
			const val = u.data[i]?.[idx];
			const rawStroke = s.stroke;
			const color = typeof rawStroke === 'string' ? rawStroke : COLORS.mikuTeal;
			const rawLabel = s.label;
			const label = typeof rawLabel === 'string' ? rawLabel : `Series ${i}`;
			const formatted = formatValue
				? formatValue(i, idx, val ?? null)
				: val != null
					? val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
					: '---';
			tooltip.appendChild(createTooltipLine(color, label, formatted));
		}

		tooltip.style.display = 'block';

		const left = u.cursor.left ?? 0;
		const top = u.cursor.top ?? 0;

		const overRect = over.getBoundingClientRect();
		const ttRect = tooltip.getBoundingClientRect();

		let x = left + 12;
		let y = top - ttRect.height - 8;

		if (x + ttRect.width > overRect.width) x = left - ttRect.width - 12;
		if (y < 0) y = top + 12;

		tooltip.style.left = x + 'px';
		tooltip.style.top = y + 'px';
	}

	return {
		hooks: {
			init: [init],
			setCursor: [setCursor]
		}
	};
}

// --- Responsive resize observer ---

/** Create a ResizeObserver that calls back with (width, height) when the container resizes. */
export function createResizeObserver(
	container: HTMLElement,
	callback: (width: number, height: number) => void
): ResizeObserver {
	const ro = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const { width } = entry.contentRect;
			if (width > 0) {
				callback(width, Math.max(250, Math.round(width * 0.5)));
			}
		}
	});
	ro.observe(container);
	return ro;
}

// --- Theme change observer ---

/** Watch for `data-theme` attribute changes on `<html>` and invoke the callback. */
export function observeThemeChanges(callback: () => void): MutationObserver {
	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.attributeName === 'data-theme') {
				callback();
				break;
			}
		}
	});
	if (typeof document !== 'undefined') {
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	}
	return observer;
}

// --- Date utilities ---

/** Convert ISO date string (YYYY-MM-DD) to unix timestamp (seconds). */
export function dateToUnix(date: string): number {
	return Math.floor(new Date(date).getTime() / 1000);
}

/** Format a percentage value for display. */
export function fmtPct(val: number): string {
	return (val * 100).toFixed(2) + '%';
}
