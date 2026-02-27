<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		variant = 'default',
		size = 'md',
		disabled = false,
		type = 'button',
		onclick
	}: {
		children: Snippet;
		variant?: 'default' | 'primary' | 'danger' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		onclick?: (e: MouseEvent) => void;
	} = $props();
</script>

<button
	class="btn btn--{variant} btn--{size}"
	{disabled}
	{type}
	{onclick}
>
	{@render children()}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-weight: 500;
		white-space: nowrap;
		transition: background-color var(--transition-fast),
			color var(--transition-fast),
			box-shadow var(--transition-fast),
			opacity var(--transition-fast);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Sizes */
	.btn--sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-xs);
	}

	.btn--md {
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
	}

	.btn--lg {
		padding: var(--spacing-md) var(--spacing-lg);
		font-size: var(--font-size-base);
	}

	/* Variants */
	.btn--default {
		background: var(--color-bg-tertiary);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.btn--default:hover:not(:disabled) {
		background: var(--color-border);
	}

	.btn--primary {
		background: linear-gradient(135deg, var(--color-deep-teal), var(--color-miku-teal));
		color: #fff;
	}

	.btn--primary:hover:not(:disabled) {
		box-shadow: 0 4px 12px rgba(26, 138, 138, 0.35);
	}

	.btn--danger {
		background: var(--color-negative);
		color: #fff;
	}

	.btn--danger:hover:not(:disabled) {
		box-shadow: 0 4px 12px rgba(232, 23, 93, 0.35);
	}

	.btn--ghost {
		background: transparent;
		color: var(--color-text-secondary);
	}

	.btn--ghost:hover:not(:disabled) {
		background: var(--color-border);
		color: var(--color-text-primary);
	}
</style>
