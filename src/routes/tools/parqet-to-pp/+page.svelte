<script lang="ts">
	import { onMount } from 'svelte';
	import type { ParqetPortfolio } from '#lib/integrations/parqet/client.ts';
	import { mapParqetActivities } from '#lib/integrations/parqet/mapper.ts';
	import { combineImports } from '#lib/integrations/parqet/combine.ts';
	import { mapExternalImport } from '#lib/io/external-mapping.ts';
	import { exportPortfolioPerformanceCSV } from '#lib/io/pp-export.ts';
	import { saveText } from '#lib/io/download.ts';
	import type { ExternalImport } from '#lib/parsers/external.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { connectParqet, disconnectParqet, parqetClient, parqetConfigured } from '#lib/state/parqet.svelte.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import ImportWizard from '#lib/components/ImportWizard.svelte';

	let configured = $state<boolean | null>(null);
	let portfolios = $state<ParqetPortfolio[]>([]);
	let selected = $state<string[]>([]);
	let loading = $state(false);
	let status = $state('');
	let fetched = $state.raw<ExternalImport | null>(null);
	let importOpen = $state(false);
	const connected = $derived(!!app.settings.parqetTokens);

	onMount(async () => {
		configured = await parqetConfigured();
	});

	$effect(() => {
		if (connected && configured) void load();
	});

	async function load() {
		loading = true;
		try {
			portfolios = await parqetClient().portfolios();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : String(e));
		} finally {
			loading = false;
		}
	}

	async function fetchSelected(): Promise<ExternalImport | null> {
		loading = true;
		try {
			const client = parqetClient();
			const out: ExternalImport[] = [];
			for (const p of portfolios.filter((x) => selected.includes(x.id))) {
				status = `Loading ${p.name}…`;
				const acts = await client.activities(p.id, (n) => (status = `Loading ${p.name}: ${n} activities`));
				out.push(mapParqetActivities(p, acts));
			}
			status = '';
			fetched = combineImports(out);
			return fetched;
		} catch (e) {
			notify.error(e instanceof Error ? e.message : String(e));
			return null;
		} finally {
			loading = false;
			status = '';
		}
	}

	async function toPP() {
		const ext = await fetchSelected();
		if (!ext) return;
		const { data } = mapExternalImport(ext, { existingAssets: [] });
		const files = exportPortfolioPerformanceCSV(data.portfolios ?? [], data.assets ?? [], data.transactions ?? []);
		saveText('parqet-pp-portfolio-transactions.csv', files.portfolioTransactions, 'text/csv');
		setTimeout(() => saveText('parqet-pp-account-transactions.csv', files.accountTransactions, 'text/csv'), 400);
		notify.success(`Converted ${ext.transactions.length} activities`);
	}

	async function toSweetfolio() {
		if (await fetchSelected()) importOpen = true;
	}
</script>

<PageHeader
	title="Parqet"
	back={{ href: '/tools', label: 'Tools' }}
	subtitle="Read your Parqet portfolios and import or convert them. Data flows directly between your browser and Parqet."
/>

{#if configured === false}
	<Card
		><EmptyState icon="link" title="Parqet is not configured here"
			>The instance owner can enable it by setting <code>parqetClientId</code> in <code>config.json</code> (see the self-hosting guide).</EmptyState
		></Card
	>
{:else if !connected}
	<Card>
		<EmptyState icon="link" title="Connect your Parqet account">
			You'll be redirected to Parqet to grant read-only access. Tokens are stored only in this browser.
			{#snippet actions()}<Button
					variant="primary"
					onclick={() => connectParqet('/tools/parqet-to-pp').catch((e) => notify.error(e.message))}>Connect Parqet</Button
				>{/snippet}
		</EmptyState>
	</Card>
{:else}
	<Card title="Your Parqet portfolios">
		{#snippet actions()}<Badge tone="accent">Connected</Badge><Button size="sm" variant="ghost" onclick={disconnectParqet}
				>Disconnect</Button
			>{/snippet}
		{#if loading && !portfolios.length}
			<p class="muted small">Loading…</p>
		{:else if !portfolios.length}
			<p class="muted small">No portfolios found.</p>
		{:else}
			<div class="row xs actions-top">
				<button class="link" onclick={() => (selected = portfolios.map((p) => p.id))}>Select all</button><button
					class="link"
					onclick={() => (selected = [])}>Clear</button
				>
			</div>
			<ul class="list">
				{#each portfolios as p (p.id)}
					<li>
						<label class="row"
							><input
								type="checkbox"
								checked={selected.includes(p.id)}
								onchange={(e) => (selected = e.currentTarget.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))}
							/><span class="strong">{p.name}</span><span class="xs muted">{p.currency}</span></label
						>
					</li>
				{/each}
			</ul>
			{#if status}<p class="small muted">{status}</p>{/if}
			<div class="row">
				<Button variant="primary" icon="upload" disabled={!selected.length} {loading} onclick={toSweetfolio}>Import into Sweetfolio</Button>
				<Button icon="download" disabled={!selected.length} {loading} onclick={toPP}>Download for Portfolio Performance</Button>
			</div>
			<p class="xs muted">
				In Portfolio Performance use “File › Import › CSV files” and choose the portfolio/account transaction templates.
			</p>
		{/if}
	</Card>
{/if}

<ImportWizard bind:open={importOpen} external={fetched} />

<style>
	.list {
		list-style: none;
		margin: 0 0 var(--space-4);
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.list li label {
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		--gap: 10px;
	}
	.strong {
		font-weight: 600;
		flex: 1;
	}
	.link {
		border: none;
		background: none;
		color: var(--accent);
		padding: 0;
	}
	.actions-top {
		margin-bottom: 8px;
		--gap: 12px;
	}
</style>
