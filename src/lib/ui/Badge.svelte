<script lang="ts">
	import type { Snippet } from 'svelte';

	let { tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'negative' | 'warning'; children: Snippet } = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
		line-height: 1.6;
	}
	.neutral {
		background: var(--surface-2);
		color: var(--text-2);
	}
	.accent {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.negative {
		background: var(--negative-soft);
		color: var(--negative);
	}
	.warning {
		background: var(--warning-soft);
		color: var(--warning);
	}
</style>
