<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		actions,
		children,
		padded = true,
		class: cls = ''
	}: { title?: string; subtitle?: string; actions?: Snippet; children: Snippet; padded?: boolean; class?: string } = $props();
</script>

<section class="card {cls}" class:padded>
	{#if title || actions}
		<header class="head">
			<div class="titles">
				{#if title}<h2>{title}</h2>{/if}
				{#if subtitle}<p class="muted small">{subtitle}</p>{/if}
			</div>
			{#if actions}<div class="actions">{@render actions()}</div>{/if}
		</header>
	{/if}
	{@render children()}
</section>

<style>
	.card {
		background: var(--surface);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		min-width: 0;
	}
	.padded {
		padding: var(--space-4);
	}
	@media (min-width: 640px) {
		.padded {
			padding: var(--space-5);
		}
	}
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
		flex-wrap: wrap;
	}
	.card:not(.padded) .head {
		padding: var(--space-4) var(--space-4) 0;
	}
	.titles {
		min-width: 0;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
</style>
