<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { initStores } from '$lib/stores/init';

	let { children }: { children: Snippet } = $props();

	onMount(() => {
		initStores();
	});
</script>

<svelte:head>
	<title>Sweetfolio</title>
	<meta name="description" content="Portfolio planning, backtesting, and Monte Carlo simulation" />
</svelte:head>

<Shell>
	{@render children()}
</Shell>
