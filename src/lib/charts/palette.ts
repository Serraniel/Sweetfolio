/** Chart colours read from CSS custom properties so they follow the theme. */
export function cssVar(name: string, fallback = '#888'): string {
	if (typeof document === 'undefined') return fallback;
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function seriesColors(): string[] {
	return [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar(`--chart-${i}`));
}

export function colorAt(i: number): string {
	const c = seriesColors();
	return c[i % c.length]!;
}

export function withAlpha(color: string, alpha: number): string {
	const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
	if (!m) return color;
	const n = parseInt(m[1]!, 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Resolve `var(--x)` references for canvas drawing. */
export function resolveColor(color: string | undefined, fallbackIndex = 0): string {
	if (!color) return colorAt(fallbackIndex);
	const m = /^var\((--[\w-]+)\)$/.exec(color.trim());
	return m ? cssVar(m[1]!) : color;
}
