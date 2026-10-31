<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import Shell from '#lib/layout/Shell.svelte';
	import LocalStorageHint from '#lib/layout/LocalStorageHint.svelte';
	import Toaster from '#lib/ui/Toaster.svelte';
	import ConfirmHost from '#lib/ui/ConfirmHost.svelte';
	import ShareImportDialog from '#lib/components/ShareImportDialog.svelte';
	import PriceConflictsDialog from '#lib/components/PriceConflictsDialog.svelte';
	import { app } from '#lib/state/app.svelte.ts';
	import { jobs } from '#lib/state/jobs.svelte.ts';
	import { theme } from '#lib/state/theme.svelte.ts';
	import { page } from '$app/state';

	let { children }: { children: Snippet } = $props();
	const bare = $derived(page.url.pathname === '/callback');

	theme.init();
	app.init().then(
		() => void jobs.startup(),
		() => {}
	);
</script>

{#if bare}
	{@render children()}
{:else}
	<Shell>
		{#if app.staleTab}
			<div class="banner" role="alert">
				Sweetfolio was updated in another tab. <button onclick={() => location.reload()}>Reload</button>
			</div>
		{/if}
		<LocalStorageHint />
		{#if app.loadError}
			<div class="banner" role="alert">Your data could not be loaded: {app.loadError}. Private browsing modes may block storage.</div>
		{:else if app.ready}
			{@render children()}
		{:else}
			<div class="loading" aria-busy="true"><span class="spinner"></span></div>
		{/if}
	</Shell>
	<ShareImportDialog />
	<PriceConflictsDialog />
{/if}
<Toaster />
<ConfirmHost />

<style>
	.banner {
		padding: 12px 14px;
		margin-bottom: var(--space-4);
		border-radius: var(--radius);
		background: var(--warning-soft);
		color: var(--warning);
		font-size: var(--text-sm);
	}
	.banner button {
		border: none;
		background: none;
		font-weight: 700;
		color: inherit;
		text-decoration: underline;
	}
	.loading {
		display: grid;
		place-items: center;
		min-height: 50dvh;
	}
	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--accent-soft);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
