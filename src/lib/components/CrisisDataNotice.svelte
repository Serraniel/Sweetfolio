<script lang="ts">
	/** Prompts for the index histories that let assets be tested before their own data starts (CR-3). */
	import { crisis } from '#lib/state/crisis.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
</script>

{#if crisis.loadError}
	<p class="data-notice small">Crisis data could not be loaded: {crisis.loadError}</p>
{:else if crisis.loaded && crisis.indices.size === 0}
	<div class="data-notice small">
		<p>
			Only crises inside your assets' own price history can be tested. Download long index histories (S&P 500 since 1928, MSCI World,
			Nasdaq-100, gold, …) from Onvista to test older crises with proxies. Bond and cash proxies are built in.
		</p>
		<Button size="sm" icon="download" loading={crisis.downloading} onclick={() => crisis.downloadIndices()}>Download crisis history</Button>
	</div>
{/if}

<style>
	.data-notice {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--accent-soft);
		color: var(--text-2);
		margin: 0 0 var(--space-3);
	}
</style>
