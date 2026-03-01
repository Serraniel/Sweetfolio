<script lang="ts">
	import type { CorrelationMatrix } from '$lib/types';
	import { COLORS, isDarkTheme, observeThemeChanges } from './utils';
	import { goto } from '$app/navigation';

	interface Props {
		data: CorrelationMatrix;
		labels: string[];
	}

	let { data, labels }: Props = $props();

	let dark = $state(isDarkTheme());
	let themeObs: MutationObserver | undefined;
	let hoveredCell: { row: number; col: number } | null = $state(null);

	function handleCellClick(row: number, col: number) {
		if (row === col) return;
		const ids = [data.assetIds[row], data.assetIds[col]].join(',');
		goto(`/compare?ids=${encodeURIComponent(ids)}`);
	}

	function correlationColor(val: number): string {
		// Negative: towards hot pink, zero: neutral grey, positive: towards teal
		if (val >= 0) {
			const t = Math.min(val, 1);
			const r = Math.round(141 + (26 - 141) * t);
			const g = Math.round(208 + (138 - 208) * t);
			const b = Math.round(196 + (138 - 196) * t);
			return `rgb(${r}, ${g}, ${b})`;
		} else {
			const t = Math.min(-val, 1);
			const r = Math.round(180 + (232 - 180) * t);
			const g = Math.round(180 + (23 - 180) * t);
			const b = Math.round(180 + (93 - 180) * t);
			return `rgb(${r}, ${g}, ${b})`;
		}
	}

	function textColor(val: number): string {
		// WCAG-based: compute relative luminance from the background
		const abs = Math.min(1, Math.abs(val));
		let r: number, g: number, b: number;
		if (val >= 0) {
			r = 141 + (26 - 141) * abs;
			g = 208 + (138 - 208) * abs;
			b = 196 + (138 - 196) * abs;
		} else {
			r = 180 + (232 - 180) * abs;
			g = 180 + (23 - 180) * abs;
			b = 180 + (93 - 180) * abs;
		}
		// sRGB to linear
		const toLinear = (c: number) => {
			const s = c / 255;
			return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
		};
		const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
		return luminance > 0.18 ? '#1a1a1a' : '#f0f0f0';
	}

	$effect(() => {
		themeObs = observeThemeChanges(() => {
			dark = isDarkTheme();
		});
		return () => themeObs?.disconnect();
	});
</script>

{#if data.assetIds.length === 0 || data.matrix.length === 0}
	<div class="chart-empty">
		<p>Not enough assets to display the correlation matrix.</p>
	</div>
{:else}
<div class="correlation-wrapper">
	<div
		class="correlation-grid"
		style:grid-template-columns={`80px repeat(${data.assetIds.length}, 1fr)`}
	>
		<!-- Header row -->
		<div class="cell header corner"></div>
		{#each labels as label, i}
			<div class="cell header col-header" title={label}>
				{label.length > 8 ? label.slice(0, 7) + '\u2026' : label}
			</div>
		{/each}

		<!-- Data rows -->
		{#each data.matrix as row, ri}
			<div class="cell header row-header" title={labels[ri]}>
				{labels[ri].length > 8 ? labels[ri].slice(0, 7) + '\u2026' : labels[ri]}
			</div>
			{#each row as val, ci}
				<div
					class="cell data"
					class:hovered={hoveredCell?.row === ri && hoveredCell?.col === ci}
					class:clickable={ri !== ci}
					style:background-color={correlationColor(val)}
					style:color={textColor(val)}
					role="gridcell"
					tabindex="-1"
					onmouseenter={() => (hoveredCell = { row: ri, col: ci })}
					onmouseleave={() => (hoveredCell = null)}
					onclick={() => handleCellClick(ri, ci)}
					onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') handleCellClick(ri, ci); }}
					title={`${labels[ri]} / ${labels[ci]}: ${val.toFixed(3)}`}
				>
					{val.toFixed(2)}
				</div>
			{/each}
		{/each}
	</div>

	{#if hoveredCell}
		<div class="hover-info">
			{labels[hoveredCell.row]} / {labels[hoveredCell.col]}:
			<strong>{data.matrix[hoveredCell.row][hoveredCell.col].toFixed(4)}</strong>
			{#if hoveredCell.row !== hoveredCell.col}
				<span class="compare-hint">Click to compare</span>
			{/if}
		</div>
	{/if}
</div>
{/if}

<style>
	.correlation-wrapper {
		width: 100%;
		overflow-x: auto;
	}

	.correlation-grid {
		display: grid;
		gap: 1px;
		min-width: fit-content;
	}

	.cell {
		padding: 6px 4px;
		text-align: center;
		font-size: 12px;
		font-family: system-ui, -apple-system, sans-serif;
		border-radius: 2px;
	}

	.cell.header {
		font-weight: 600;
		color: var(--color-text-primary, #3c3f44);
		background: transparent;
	}

	.cell.data {
		cursor: default;
		min-width: 48px;
	}

	.cell.data.clickable {
		cursor: pointer;
	}

	.cell.data.hovered {
		outline: 2px solid rgba(0, 0, 0, 0.3);
		outline-offset: -1px;
		z-index: 2;
		position: relative;
	}

	.row-header {
		text-align: right;
		padding-right: 8px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.col-header {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hover-info {
		margin-top: 8px;
		font-size: 13px;
		color: var(--color-text-primary, #3c3f44);
		font-family: system-ui, -apple-system, sans-serif;
		min-height: 1.5em;
	}

	.compare-hint {
		margin-left: 8px;
		font-size: 11px;
		opacity: 0.6;
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
