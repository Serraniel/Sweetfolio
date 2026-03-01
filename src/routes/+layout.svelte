<script lang="ts">
	import '../app.css';
	import Shell from '$lib/components/layout/Shell.svelte';
	import RefreshProgressToast from '$lib/components/shared/RefreshProgressToast.svelte';
	import MigrationToast from '$lib/components/shared/MigrationToast.svelte';
	import ShareModal from '$lib/components/sharing/ShareModal.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { initStores } from '$lib/stores/init';
	import { autoRefreshAssets } from '$lib/stores/auto-refresh';
	import { decodeSharePayload, type SharePayload } from '$lib/sharing/codec';

	let { children }: { children: Snippet } = $props();

	let shareModalOpen = $state(false);
	let sharePayload: SharePayload | null = $state(null);

	onMount(async () => {
		await initStores();
		autoRefreshAssets();

		// Detect share payload in URL hash
		const hash = window.location.hash;
		if (hash) {
			const payload = decodeSharePayload(hash);
			if (payload) {
				sharePayload = payload;
				shareModalOpen = true;
				// Clear the hash fragment
				history.replaceState(null, '', window.location.pathname + window.location.search);
			}
		}
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
<MigrationToast />
<ShareModal bind:open={shareModalOpen} payload={sharePayload} />
