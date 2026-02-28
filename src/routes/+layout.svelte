<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import RefreshProgressToast from '$lib/components/shared/RefreshProgressToast.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { initStores } from '$lib/stores/init';
	import { autoRefreshAssets } from '$lib/stores/auto-refresh';

	let { children }: { children: Snippet } = $props();

	onMount(async () => {
		await initStores();
		autoRefreshAssets();
	});
</script>

<svelte:head>
	<title>Sweetfolio</title>
	<meta name="description" content="Portfolio planning, backtesting, and Monte Carlo simulation" />
</svelte:head>

<Shell>
	{@render children()}
</Shell>

<RefreshProgressToast />
