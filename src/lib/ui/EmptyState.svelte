<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './icons.ts';

	let { icon = 'info', title, children, actions }: { icon?: IconName; title: string; children?: Snippet; actions?: Snippet } = $props();
</script>

<div class="empty">
	<div class="icon"><Icon name={icon} size={26} /></div>
	<h3>{title}</h3>
	{#if children}<p class="muted">{@render children()}</p>{/if}
	{#if actions}<div class="row actions">{@render actions()}</div>{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-2);
		padding: var(--space-6) var(--space-4);
	}
	.icon {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
		margin-bottom: var(--space-2);
	}
	p {
		max-width: 46ch;
	}
	.actions {
		justify-content: center;
		margin-top: var(--space-3);
	}
</style>
