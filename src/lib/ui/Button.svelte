<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	interface Props extends HTMLButtonAttributes {
		variant?: Variant;
		size?: 'sm' | 'md';
		icon?: IconName;
		href?: string;
		loading?: boolean;
		iconOnly?: boolean;
		children?: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		icon,
		href,
		loading = false,
		iconOnly = false,
		children,
		class: cls = '',
		type = 'button',
		...rest
	}: Props = $props();
</script>

{#if href}
	<a {href} class="btn {variant} {size} {cls}" class:icon-only={iconOnly} aria-label={rest['aria-label']} title={rest.title}>
		{#if icon}<Icon name={icon} size={size === 'sm' ? 16 : 18} />{/if}
		{#if children}<span class="btn-label">{@render children()}</span>{/if}
	</a>
{:else}
	<button
		{type}
		class="btn {variant} {size} {cls}"
		class:icon-only={iconOnly}
		disabled={rest.disabled || loading}
		aria-busy={loading}
		{...rest}
	>
		{#if loading}<span class="spinner" aria-hidden="true"></span>{:else if icon}<Icon name={icon} size={size === 'sm' ? 16 : 18} />{/if}
		{#if children}<span class="btn-label">{@render children()}</span>{/if}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 40px;
		padding: 0 16px;
		border-radius: 999px;
		border: 1px solid transparent;
		font-weight: 600;
		font-size: var(--text-sm);
		white-space: nowrap;
		text-decoration: none;
		transition:
			background 0.15s var(--ease),
			border-color 0.15s var(--ease),
			transform 0.1s var(--ease),
			opacity 0.15s;
		-webkit-tap-highlight-color: transparent;
		user-select: none;
	}
	.btn:active:not(:disabled) {
		transform: scale(0.97);
	}
	.btn:hover {
		text-decoration: none;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.sm {
		min-height: 32px;
		padding: 0 12px;
		font-size: var(--text-xs);
	}
	.icon-only {
		padding: 0;
		width: 40px;
	}
	.sm.icon-only {
		width: 32px;
	}
	.primary {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.primary:hover:not(:disabled) {
		background: var(--accent-strong);
	}
	.secondary {
		background: var(--surface-solid);
		border-color: var(--border-strong);
		color: var(--text);
	}
	.secondary:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.ghost {
		background: transparent;
		color: var(--text-2);
	}
	.ghost:hover:not(:disabled) {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.danger {
		background: var(--negative);
		color: #fff;
	}
	.danger:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
