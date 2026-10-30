<script lang="ts">
	/** Handles `#share=` links on load (SH-2). */
	import { goto } from '$app/navigation';
	import type { Asset } from '#lib/domain/types.ts';
	import { decodeShare, fromSharedTree, strategyIsins, type SharePayload } from '#lib/sharing/codec.ts';
	import { newAsset, newPortfolio, newStrategy, cleanAllocations } from '#lib/domain/factories.ts';
	import { fetchSecurity } from '#lib/fetchers/market-data.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { jobs } from '#lib/state/jobs.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import * as fmt from '#lib/format.ts';

	type ItemStatus = 'present' | 'pending' | 'fetching' | 'fetched' | 'failed';
	interface Item {
		isin: string;
		name: string;
		weight?: number;
		status: ItemStatus;
		assetId?: string;
		error?: string;
	}

	let open = $state(false);
	let payload = $state<SharePayload | null>(null);
	let items = $state<Item[]>([]);
	let busy = $state(false);

	function check() {
		const p = decodeShare(location.hash);
		if (!p) return;
		history.replaceState(history.state, '', location.pathname + location.search);
		payload = p;
		const isins = p.type === 'portfolio' ? p.allocations.map((a) => a.isin) : p.type === 'assets' ? p.isins : strategyIsins(p.root);
		items = isins.map((isin, i) => {
			const existing = app.assets.find((a) => a.isin?.toUpperCase() === isin);
			return {
				isin,
				name: existing?.name ?? isin,
				weight: p.type === 'portfolio' ? p.allocations[i]?.weight : undefined,
				status: existing ? 'present' : 'pending',
				assetId: existing?.id
			};
		});
		open = true;
	}

	$effect(() => {
		if (!app.ready) return;
		check();
		const onHash = () => check();
		addEventListener('hashchange', onHash);
		return () => removeEventListener('hashchange', onHash);
	});

	async function run() {
		if (!payload) return;
		busy = true;
		try {
			const created: Asset[] = [];
			for (const item of items) {
				if (item.status === 'present' || item.status === 'fetched') continue;
				item.status = 'fetching';
				const outcome = await fetchSecurity(item.isin, app.settings);
				if (outcome.ok) {
					const a = newAsset({
						name: outcome.data.name ?? item.isin,
						isin: item.isin,
						wkn: outcome.data.wkn,
						currency: outcome.data.currency ?? 'EUR',
						classification: outcome.data.classification ?? 'unknown',
						prices: outcome.data.prices,
						lastRefreshedAt: new Date().toISOString()
					});
					created.push(a);
					item.status = 'fetched';
					item.assetId = a.id;
					item.name = a.name;
				} else {
					item.status = 'failed';
					item.error = outcome.error;
				}
			}
			if (created.length) await app.saveAssets(created);
			const idByIsin = new Map(items.filter((i) => i.assetId).map((i) => [i.isin, i.assetId!]));
			if (payload.type === 'portfolio') {
				const allocations = cleanAllocations(
					payload.allocations.filter((a) => idByIsin.has(a.isin)).map((a) => ({ assetId: idByIsin.get(a.isin)!, weight: a.weight }))
				);
				if (!allocations.length) throw new Error('None of the shared assets could be loaded.');
				const p = newPortfolio({ name: payload.name, allocations });
				await app.savePortfolio(p);
				open = false;
				notify.success(`Portfolio “${p.name}” added`);
				await goto(`/portfolios/${app.portfolioSlug(p.id)}`);
			} else if (payload.type === 'strategy') {
				const s = newStrategy(payload.name);
				const root = fromSharedTree(
					payload.root,
					(leaf) =>
						(leaf.isin && idByIsin.get(leaf.isin)) ||
						(leaf.assetId && app.assetById.has(leaf.assetId) ? leaf.assetId : null) ||
						app.assets.find((a) => a.name === leaf.name)?.id ||
						null
				);
				await app.saveStrategy({ ...s, root: { ...root, label: payload.name } });
				open = false;
				notify.success(`Strategy “${s.name}” added`);
				await goto(`/strategies/${app.strategySlug(s.id)}`);
			} else {
				open = false;
				notify.success(`${created.length} asset${created.length === 1 ? '' : 's'} added`);
				await goto('/assets');
			}
			void jobs.fetchCurrencyRates();
		} catch (err) {
			notify.error(err instanceof Error ? err.message : String(err));
		} finally {
			busy = false;
		}
	}

	const title = $derived(
		payload?.type === 'portfolio' ? 'Shared portfolio' : payload?.type === 'strategy' ? 'Shared strategy' : 'Shared assets'
	);
	const statusLabel: Record<ItemStatus, string> = {
		present: 'In your library',
		pending: 'Will be fetched',
		fetching: 'Fetching…',
		fetched: 'Fetched',
		failed: 'Failed'
	};
</script>

<Dialog bind:open {title}>
	{#if payload}
		<div class="stack" style="--gap: 12px">
			{#if payload.type !== 'assets'}<h3>{payload.name}</h3>{/if}
			<p class="small muted">Someone shared this with you. Missing assets are downloaded by ISIN; nothing about you is sent anywhere.</p>
			{#if items.length}
				<ul class="items">
					{#each items as it (it.isin)}
						<li>
							<div class="truncate">
								<span class="small">{it.name}</span>{#if it.name !== it.isin}<span class="xs muted mono"> {it.isin}</span>{/if}
							</div>
							{#if it.weight !== undefined}<span class="num small">{fmt.pct(it.weight, 1)}</span>{/if}
							<Badge tone={it.status === 'failed' ? 'negative' : it.status === 'present' || it.status === 'fetched' ? 'accent' : 'neutral'}
								>{statusLabel[it.status]}</Badge
							>
						</li>
					{/each}
				</ul>
			{/if}
			{#if payload.type === 'strategy' && !items.length}<p class="small">
					This strategy has no assets with ISIN; assets are matched by name.
				</p>{/if}
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Ignore</Button>
		<Button variant="primary" loading={busy} onclick={run}>Add to my library</Button>
	{/snippet}
</Dialog>

<style>
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 10px;
		align-items: center;
	}
</style>
