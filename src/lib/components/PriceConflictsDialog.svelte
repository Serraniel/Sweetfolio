<script lang="ts">
	/** Resolve price differences found during refresh (SC-5). */
	import { jobs } from '#lib/state/jobs.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';

	let open = $state(false);
	let useNew = $state<Record<string, boolean>>({});
	const current = $derived(jobs.conflicts[0] ?? null);

	$effect(() => {
		if (current) {
			useNew = {};
			open = true;
		}
	});

	async function apply() {
		if (!current) return;
		const map = new Map(current.conflicts.filter((c) => useNew[c.date]).map((c) => [c.date, c.fetchedClose]));
		await jobs.resolveConflicts(current.assetId, map);
		open = jobs.conflicts.length > 0;
	}
</script>

<Dialog bind:open title="Price differences" onclose={() => current && jobs.resolveConflicts(current.assetId, new Map())}>
	{#if current}
		<div class="stack" style="--gap: 12px">
			<p class="small">
				Fetched prices for <b>{current.assetName}</b> differ by more than 1 % from your stored data on {current.conflicts.length} day{current
					.conflicts.length === 1
					? ''
					: 's'}. Choose which value to keep.
			</p>
			<div class="row">
				<Button size="sm" onclick={() => (useNew = Object.fromEntries(current.conflicts.map((c) => [c.date, false])))}
					>Keep all stored</Button
				>
				<Button size="sm" onclick={() => (useNew = Object.fromEntries(current.conflicts.map((c) => [c.date, true])))}
					>Use all fetched</Button
				>
			</div>
			<div class="scroll-x list">
				<table class="table">
					<thead
						><tr
							><th>Date</th><th class="right">Stored</th><th class="right">Fetched</th><th class="right">Diff.</th><th>Use fetched</th></tr
						></thead
					>
					<tbody>
						{#each current.conflicts as c (c.date)}
							<tr>
								<td>{fmt.date(c.date)}</td>
								<td class="right num">{fmt.num(c.existingClose, 4)}</td>
								<td class="right num">{fmt.num(c.fetchedClose, 4)}</td>
								<td class="right num">{fmt.pct(c.fetchedClose / c.existingClose - 1, 1, true)}</td>
								<td><input type="checkbox" bind:checked={useNew[c.date]} aria-label="Use fetched price for {c.date}" /></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="primary" onclick={apply}>Apply</Button>
	{/snippet}
</Dialog>

<style>
	.list {
		max-height: 50dvh;
	}
</style>
