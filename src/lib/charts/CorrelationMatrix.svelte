<script lang="ts">
	import type { CorrelationMatrix } from '$lib/types';
	import { COLORS, isDarkTheme, observeThemeChanges } from './utils';

	interface Props {
		data: CorrelationMatrix;
		labels: string[];
	}

	let { data, labels }: Props = $props();

	let dark = $state(isDarkTheme());
	let themeObs: MutationObserver | undefined;
	let hoveredCell: { row: number; col: number } | null = $state(null);

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
		return Math.abs(val) > 0.6 ? '#fff' : dark ? '#f0f0f0' : COLORS.charcoal;
	}

	$effect(() => {
		themeObs = observeThemeChanges(() => {
			dark = isDarkTheme();
		});
		return () => themeObs?.disconnect();
	});
</script>

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
					style:background-color={correlationColor(val)}
					style:color={textColor(val)}
					role="gridcell"
					tabindex="-1"
					onmouseenter={() => (hoveredCell = { row: ri, col: ci })}
					onmouseleave={() => (hoveredCell = null)}
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
		</div>
	{/if}
</div>

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
		transition: transform 0.1s;
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

	.cell.data.hovered {
		transform: scale(1.08);
		box-shadow: 0 0 6px rgba(0, 0, 0, 0.2);
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
	}
</style>
