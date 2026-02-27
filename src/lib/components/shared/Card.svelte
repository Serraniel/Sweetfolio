<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		variant = 'default',
		padding = 'md'
	}: {
		children: Snippet;
		variant?: 'default' | 'accent' | 'flat';
		padding?: 'sm' | 'md' | 'lg';
	} = $props();
</script>

<div class="card card--{variant} card--pad-{padding}">
	{@render children()}
</div>

<style>
	.card {
		background: var(--glass-bg);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--glass-shadow);
		transition: box-shadow var(--transition-base), border-color var(--transition-base);
	}

	.card:hover {
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
	}

	.card--accent {
		border-color: rgba(141, 208, 196, 0.3);
	}

	.card--flat {
		background: var(--color-bg-secondary);
		backdrop-filter: none;
		box-shadow: none;
	}

	.card--flat:hover {
		box-shadow: none;
	}

	.card--pad-sm {
		padding: var(--spacing-md);
	}

	.card--pad-md {
		padding: var(--spacing-lg);
	}

	.card--pad-lg {
		padding: var(--spacing-2xl);
	}

	:global([data-theme='dark']) .card:hover {
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}
</style>
