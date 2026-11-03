<script lang="ts">
	/** Editable assumptions of the crisis-type scenarios (CR-8). */
	import { CRISIS_TYPES, CRISIS_TYPE_SHORT, type CrisisType } from '#lib/core/crisis.ts';
	import { DEFAULT_ASSUMPTIONS, KIND_LABELS, SCENARIO_EXAMPLES, SCENARIO_KINDS, type ScenarioKind } from '#lib/core/scenarios.ts';
	import { crisis } from '#lib/state/crisis.svelte.ts';
	import Button from '#lib/ui/Button.svelte';

	const a = $derived(crisis.assumptions);
	const isDefault = $derived(JSON.stringify(a) === JSON.stringify(DEFAULT_ASSUMPTIONS));

	function value(e: Event): number | null {
		const v = Number((e.currentTarget as HTMLInputElement).value.replace(',', '.'));
		return Number.isFinite(v) ? v : null;
	}
	function setChange(t: CrisisType, k: ScenarioKind, e: Event) {
		const v = value(e);
		if (v === null) return;
		const next = structuredClone(a);
		next.change[t][k] = v / 100;
		crisis.saveAssumptions(next);
	}
	function setMonths(field: 'toTrough' | 'toRecover', t: CrisisType, e: Event) {
		const v = value(e);
		if (v === null || v <= 0) return;
		const next = structuredClone(a);
		next[field][t] = v;
		crisis.saveAssumptions(next);
	}
	const pct = (v: number) => String(Math.round(v * 1000) / 10);
	const changed = (t: CrisisType, k: ScenarioKind) => a.change[t][k] !== DEFAULT_ASSUMPTIONS.change[t][k];
</script>

<p class="small muted">
	How each kind of asset moves from the peak to the trough of each crisis type, in percent. Assets that fell climb back to their pre-crisis
	level over the recovery months; assets that gained keep their level. Leveraged products apply their leverage daily, with financing costs
	and volatility drag. Kept in this browser.
</p>
<div class="scroll-x">
	<table class="table assumptions">
		<thead>
			<tr>
				<th scope="col">Asset kind</th>
				{#each CRISIS_TYPES as t (t)}<th scope="col" class="right" title="Modelled on {SCENARIO_EXAMPLES[t]}">{CRISIS_TYPE_SHORT[t]}</th
					>{/each}
			</tr>
		</thead>
		<tbody>
			{#each SCENARIO_KINDS as k (k)}
				<tr>
					<th scope="row" class="kind">{KIND_LABELS[k]}</th>
					{#each CRISIS_TYPES as t (t)}
						<td class="right"
							><input
								class="input num"
								class:changed={changed(t, k)}
								inputmode="decimal"
								value={pct(a.change[t][k])}
								aria-label="{KIND_LABELS[k]} in {CRISIS_TYPE_SHORT[t]}, change in percent"
								onchange={(e) => setChange(t, k, e)}
							/></td
						>
					{/each}
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr>
				<th scope="row" class="kind">Months to trough</th>
				{#each CRISIS_TYPES as t (t)}
					<td class="right"
						><input
							class="input num"
							inputmode="decimal"
							value={a.toTrough[t]}
							aria-label="{CRISIS_TYPE_SHORT[t]}, months to trough"
							onchange={(e) => setMonths('toTrough', t, e)}
						/></td
					>
				{/each}
			</tr>
			<tr>
				<th scope="row" class="kind">Months to recover</th>
				{#each CRISIS_TYPES as t (t)}
					<td class="right"
						><input
							class="input num"
							inputmode="decimal"
							value={a.toRecover[t]}
							aria-label="{CRISIS_TYPE_SHORT[t]}, months to recover"
							onchange={(e) => setMonths('toRecover', t, e)}
						/></td
					>
				{/each}
			</tr>
		</tfoot>
	</table>
</div>
<div class="row foot">
	<Button size="sm" variant="ghost" icon="undo" disabled={isDefault} onclick={() => crisis.resetAssumptions()}>Reset to defaults</Button>
	<span class="xs muted"
		>Defaults are rounded typical moves of the historical crises of each type (e.g. stagflation: 1973–74, 1980–82).</span
	>
</div>

<style>
	.assumptions td {
		padding: 4px;
	}
	.assumptions .input {
		width: 64px;
		min-height: 0;
		height: 30px;
		padding: 2px 6px;
		text-align: right;
	}
	.assumptions .input.changed {
		border-color: var(--accent);
	}
	.kind {
		text-transform: none !important;
		letter-spacing: 0 !important;
		color: var(--text) !important;
		font-size: var(--text-sm) !important;
		white-space: nowrap;
	}
	.foot {
		margin-top: var(--space-2);
		gap: 12px;
		flex-wrap: wrap;
	}
</style>
