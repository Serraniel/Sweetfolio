<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		subtitle,
		back,
		actions,
		meta
	}: { title: string; subtitle?: string; back?: { href: string; label: string }; actions?: Snippet; meta?: Snippet } = $props();
</script>

<svelte:head><title>{title} · Sweetfolio</title></svelte:head>

<header class="page-header">
	{#if back}
		<a class="back" href={back.href}><Icon name="chevronLeft" size={16} />{back.label}</a>
	{/if}
	<div class="spread top">
		<div class="titles">
			<h1>{title}</h1>
			{#if subtitle}<p class="muted">{subtitle}</p>{/if}
			{#if meta}<div class="meta">{@render meta()}</div>{/if}
		</div>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
</header>

<style>
	.page-header {
		margin-bottom: var(--space-5);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--text-sm);
		color: var(--muted);
		margin-bottom: var(--space-2);
	}
	.top {
		align-items: flex-end;
	}
	.titles {
		min-width: 0;
		flex: 1 1 260px;
	}
	h1 {
		overflow-wrap: anywhere;
	}
	.meta {
		margin-top: var(--space-2);
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
</style>
