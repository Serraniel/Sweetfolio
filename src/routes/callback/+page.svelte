<script lang="ts">
	/** OAuth redirect target for Parqet Connect (EX-5). */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { completeLogin, takePending } from '#lib/integrations/parqet/oauth.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';

	let error = $state<string | null>(null);

	onMount(async () => {
		const pending = takePending();
		try {
			const tokens = await completeLogin(new URLSearchParams(location.search), pending);
			await app.init();
			await app.updateSettings({ parqetTokens: tokens });
			notify.success('Connected to Parqet');
			await goto(pending?.returnTo ?? '/tools/parqet-to-pp', { replace: true });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	});
</script>

<svelte:head><title>Connecting… · Sweetfolio</title></svelte:head>

<main class="cb">
	{#if error}
		<h1>Connection failed</h1>
		<p>{error}</p>
		<a href="/tools/parqet-to-pp">Back</a>
	{:else}
		<p>Connecting to Parqet…</p>
	{/if}
</main>

<style>
	.cb {
		display: grid;
		place-content: center;
		gap: 12px;
		min-height: 100dvh;
		text-align: center;
		padding: 24px;
	}
</style>
