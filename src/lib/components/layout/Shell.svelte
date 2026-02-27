<script lang="ts">
	import Nav from './Nav.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let collapsed = $state(false);
</script>

<div class="shell" class:collapsed>
	<Nav bind:collapsed />
	<main class="main-content">
		{@render children()}
	</main>
</div>

<style>
	.shell {
		display: flex;
		min-height: 100vh;
	}

	.main-content {
		flex: 1;
		margin-left: var(--sidebar-width);
		padding: var(--spacing-xl) var(--spacing-2xl);
		transition: margin-left var(--transition-base);
		max-width: 100%;
		overflow-x: hidden;
	}

	.collapsed .main-content {
		margin-left: var(--sidebar-collapsed-width);
	}

	@media (max-width: 768px) {
		.main-content {
			margin-left: var(--sidebar-collapsed-width);
			padding: var(--spacing-md);
		}
	}
</style>
