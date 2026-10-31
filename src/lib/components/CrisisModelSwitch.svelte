<script lang="ts">
	/** Crisis-type scenarios (assumed behaviour, CR-8) or the replay of historical crises (CR-4). */
	import { crisis, type CrisisModel } from '#lib/state/crisis.svelte.ts';
	import Segmented from '#lib/ui/Segmented.svelte';

	const options: Array<{ value: CrisisModel; label: string }> = [
		{ value: 'scenarios', label: 'Crisis types' },
		{ value: 'historical', label: 'Historical crises' }
	];
</script>

<div class="switch">
	<Segmented bind:value={crisis.model} {options} label="Crisis model" size="sm" />
	<p class="xs muted">
		{#if crisis.model === 'scenarios'}
			Assumed behaviour of each kind of asset in each type of crisis, combined by the portfolio's weights. <a
				href="/settings#crisis-assumptions">Edit the assumptions</a
			>.
		{:else}
			Replays real crises with real prices and, before an asset's own history, proxies matched to what it invests in.
		{/if}
	</p>
</div>

<style>
	.switch {
		display: grid;
		gap: 6px;
		justify-items: start;
		margin-bottom: var(--space-3);
	}
</style>
