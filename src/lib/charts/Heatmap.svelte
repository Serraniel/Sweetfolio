<script lang="ts">
	/** Correlation heatmap: pink −1 → neutral → teal +1, tap/hover for values (AC-2, CH-3). */
	import type { CorrelationMatrix } from '#lib/domain/types.ts';
	import * as fmt from '#lib/format.ts';

	let { matrix, labels, onselect }: { matrix: CorrelationMatrix; labels: Map<string, string>; onselect?: (a: string, b: string) => void } =
		$props();
	let active = $state<[number, number] | null>(null);

	function color(v: number): string {
		const a = Math.min(1, Math.abs(v));
		return v >= 0
			? `color-mix(in srgb, var(--deep-teal) ${Math.round(a * 85)}%, var(--surface-2))`
			: `color-mix(in srgb, var(--pink) ${Math.round(a * 85)}%, var(--surface-2))`;
	}
	const n = $derived(matrix.ids.length);
	const name = (i: number) => labels.get(matrix.ids[i]!) ?? matrix.ids[i]!;
</script>

<div class="heatmap-wrap">
	<p class="readout small" aria-live="polite">
		{#if active}
			<b>{name(active[0])}</b> × <b>{name(active[1])}</b>: <span class="num">{fmt.num(matrix.matrix[active[0]]![active[1]]!, 2)}</span>
		{:else}
			<span class="muted">Hover or tap a cell. Click to compare two assets.</span>
		{/if}
	</p>
	<div class="scroll-x">
		<table class="heatmap" style="--n: {n}">
			<thead>
				<tr>
					<th></th>
					{#each matrix.ids as id, j (id)}<th scope="col" class:hl={active?.[1] === j} title={name(j)}><span>{name(j)}</span></th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each matrix.ids as id, i (id)}
					<tr>
						<th scope="row" class:hl={active?.[0] === i} title={name(i)}>{name(i)}</th>
						{#each matrix.matrix[i]! as v, j (j)}
							<td>
								<button
									style="background: {color(v)}"
									class:strong={Math.abs(v) > 0.6}
									aria-label="{name(i)} and {name(j)}: {fmt.num(v, 2)}"
									onpointerenter={() => (active = [i, j])}
									onfocus={() => (active = [i, j])}
									onclick={() => i !== j && onselect?.(matrix.ids[i]!, matrix.ids[j]!)}>{n <= 12 ? fmt.num(v, 2) : ''}</button
								>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="scale xs muted" aria-hidden="true"><span>−1</span><i></i><span>+1</span></div>
</div>

<style>
	.readout {
		min-height: 1.5em;
		margin-bottom: var(--space-2);
	}
	.heatmap {
		border-collapse: separate;
		border-spacing: 2px;
		font-size: var(--text-xs);
	}
	th {
		font-weight: 550;
		color: var(--text-2);
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 2px 6px;
		text-align: right;
	}
	thead th {
		height: 110px;
		vertical-align: bottom;
		padding: 0;
	}
	thead th span {
		display: inline-block;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		max-height: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	th.hl {
		color: var(--accent);
	}
	td {
		padding: 0;
	}
	td button {
		width: max(36px, min(52px, calc(70vw / var(--n))));
		aspect-ratio: 1;
		border: none;
		border-radius: 6px;
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
		color: var(--text);
		padding: 0;
	}
	td button.strong {
		color: #fff;
	}
	td button:hover {
		outline: 2px solid var(--text);
		outline-offset: -2px;
	}
	.scale {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: var(--space-2);
	}
	.scale i {
		height: 6px;
		width: 160px;
		border-radius: 3px;
		background: linear-gradient(90deg, var(--pink), var(--surface-2), var(--deep-teal));
	}
</style>
