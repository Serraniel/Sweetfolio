<script lang="ts">
	/** What "not significantly worse than the benchmark" means, and how the crisis score is built (CR-5). */
	import { CRISIS_TYPES, CRISIS_TYPE_LABELS, SCORE_LABELS, type CrisisScoreKind, type CrisisType } from '#lib/core/crisis.ts';
	import { crisis } from '#lib/state/crisis.svelte.ts';

	const p = $derived(crisis.prefs);

	function toggleType(t: CrisisType, on: boolean) {
		const types = on ? [...new Set([...p.types, t])] : p.types.filter((x) => x !== t);
		if (types.length) crisis.savePrefs({ types });
	}
	function num(e: Event): number | null {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		return Number.isFinite(v) && v >= 0 ? v : null;
	}
</script>

<details class="settings">
	<summary class="small">Crisis comparison settings</summary>
	<div class="grid-fields">
		<label class="field">
			<span class="label">Drawdown tolerance (percentage points)</span>
			<input
				class="input"
				type="number"
				min="0"
				max="50"
				step="1"
				value={Math.round(p.tolerance.drawdown * 100)}
				onchange={(e) => {
					const v = num(e);
					if (v !== null) crisis.savePrefs({ tolerance: { ...p.tolerance, drawdown: v / 100 } });
				}}
			/>
		</label>
		<label class="field">
			<span class="label">Recovery tolerance (months)</span>
			<input
				class="input"
				type="number"
				min="0"
				max="120"
				step="1"
				value={Math.round(p.tolerance.recoveryDays / 30.44)}
				onchange={(e) => {
					const v = num(e);
					if (v !== null) crisis.savePrefs({ tolerance: { ...p.tolerance, recoveryDays: Math.round(v * 30.44) } });
				}}
			/>
		</label>
		<label class="field">
			<span class="label">Crises allowed to be worse</span>
			<input
				class="input"
				type="number"
				min="0"
				max="13"
				step="1"
				value={p.allowedMisses}
				onchange={(e) => {
					const v = num(e);
					if (v !== null) crisis.savePrefs({ allowedMisses: Math.round(v) });
				}}
			/>
		</label>
		<label class="field">
			<span class="label">Crisis score</span>
			<select class="select" value={p.score} onchange={(e) => crisis.savePrefs({ score: e.currentTarget.value as CrisisScoreKind })}>
				{#each Object.entries(SCORE_LABELS) as [value, label] (value)}<option {value}>{label}</option>{/each}
			</select>
		</label>
	</div>
	<fieldset class="types">
		<legend class="label">Crisis types included</legend>
		{#each CRISIS_TYPES as t (t)}
			<label class="check small"
				><input type="checkbox" checked={p.types.includes(t)} onchange={(e) => toggleType(t, e.currentTarget.checked)} />
				{CRISIS_TYPE_LABELS[t]}</label
			>
		{/each}
	</fieldset>
	<p class="xs muted">
		A portfolio counts as “worse” in a crisis when its drawdown is deeper than the benchmark's by more than the drawdown tolerance, or it
		takes longer than the recovery tolerance to get back to its previous high. It “holds up like the benchmark” when it is worse in at most
		the allowed number of crises.
	</p>
</details>

<style>
	.settings summary {
		cursor: pointer;
		color: var(--text-2);
		font-weight: 550;
	}
	.grid-fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: var(--space-3);
		margin: var(--space-3) 0;
	}
	.field {
		display: grid;
		gap: 4px;
	}
	.types {
		border: none;
		padding: 0;
		margin: 0 0 var(--space-3);
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
	}
	.types legend {
		margin-bottom: 4px;
	}
	.check {
		display: inline-flex;
		gap: 6px;
		align-items: center;
	}
</style>
