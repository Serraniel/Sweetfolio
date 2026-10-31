<script lang="ts">
	/** Model vs actual weight with drift bars (PT-8). */
	import type { DriftItem } from '#lib/core/tracking.ts';
	import * as fmt from '#lib/format.ts';

	let { items, nameOf }: { items: DriftItem[]; nameOf: (id: string) => string } = $props();
	const maxDrift = $derived(Math.max(0.05, ...items.map((i) => Math.abs(i.drift))));
</script>

<div class="drift">
	{#each items as it (it.assetId)}
		<div class="row-item">
			<div class="name truncate small" title={nameOf(it.assetId)}>{nameOf(it.assetId)}</div>
			<div class="weights xs muted num">{fmt.pct(it.actualWeight, 1)} / {fmt.pct(it.modelWeight, 1)}</div>
			<div class="bar" aria-hidden="true">
				<span class="mid"></span>
				<span class="fill {it.drift >= 0 ? 'over' : 'under'}" style="width: {(Math.abs(it.drift) / maxDrift) * 50}%"></span>
			</div>
			<div class="val num small {it.drift > 0.0005 ? 'pos' : it.drift < -0.0005 ? 'neg' : ''}">{fmt.pct(it.drift, 1, true)}</div>
		</div>
	{/each}
	<p class="xs muted">Actual / model weight. Positive drift = overweight.</p>
</div>

<style>
	.drift {
		display: grid;
		gap: 10px;
	}
	.row-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas: 'name val' 'bar bar' 'w w';
		gap: 4px 12px;
		align-items: center;
	}
	@media (min-width: 640px) {
		.row-item {
			grid-template-columns: minmax(120px, 220px) 110px 1fr 64px;
			grid-template-areas: 'name w bar val';
		}
	}
	.name {
		grid-area: name;
	}
	.weights {
		grid-area: w;
	}
	.val {
		grid-area: val;
		text-align: right;
	}
	.bar {
		grid-area: bar;
		position: relative;
		height: 10px;
		border-radius: 5px;
		background: var(--surface-2);
	}
	.mid {
		position: absolute;
		left: 50%;
		top: -2px;
		bottom: -2px;
		width: 1px;
		background: var(--border-strong);
	}
	.fill {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 5px;
	}
	.over {
		left: 50%;
		background: var(--positive);
	}
	.under {
		right: 50%;
		background: var(--negative);
	}
</style>
