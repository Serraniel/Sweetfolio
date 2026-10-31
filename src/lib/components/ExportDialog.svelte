<script lang="ts">
	/** Backup export with scope selection (DP-2). */
	import { ALL_SCOPES, type Scope } from '#lib/io/schema.ts';
	import { backupChunks } from '#lib/io/export.ts';
	import { saveChunks } from '#lib/io/download.ts';
	import { todayISO } from '#lib/core/dates.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let scopes = $state<Scope[]>([...ALL_SCOPES]);
	let busy = $state(false);
	const LABELS: Record<Scope, string> = {
		assets: 'Assets & prices',
		portfolios: 'Portfolios',
		strategies: 'Strategies',
		transactions: 'Transactions',
		settings: 'Settings',
		currencies: 'Exchange rates',
		simulations: 'Simulation configs'
	};

	async function run() {
		busy = true;
		try {
			const ok = await saveChunks(`sweetfolio-backup-${todayISO()}.json`, 'application/json', backupChunks(scopes));
			if (ok) {
				notify.success('Backup saved');
				open = false;
			}
		} catch (e) {
			notify.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			busy = false;
		}
	}
</script>

<Dialog bind:open title="Export backup" size="sm">
	<div class="stack" style="--gap: 8px">
		<p class="small muted">A JSON file you can import again on any device. API keys and connection tokens are never included.</p>
		{#each ALL_SCOPES as s (s)}
			<label class="row small"
				><input
					type="checkbox"
					checked={scopes.includes(s)}
					onchange={(e) => (scopes = e.currentTarget.checked ? [...scopes, s] : scopes.filter((x) => x !== s))}
				/>{LABELS[s]}</label
			>
		{/each}
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" icon="download" loading={busy} disabled={!scopes.length} onclick={run}>Export</Button>
	{/snippet}
</Dialog>
