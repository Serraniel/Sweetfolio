<script lang="ts">
	import { goto } from '$app/navigation';
	import { ASSET_CLASSIFICATIONS, COMMON_CURRENCIES, type Asset, type AssetClassification } from '#lib/domain/types.ts';
	import { newAsset } from '#lib/domain/factories.ts';
	import { computeAssetHealth, type AssetHealth } from '#lib/core/data-quality.ts';
	import { detectIdentifier } from '#lib/parsers/identifiers.ts';
	import { fetchAny } from '#lib/fetchers/market-data.ts';
	import type { InstrumentData } from '#lib/fetchers/types.ts';
	import { encodeAssetList, shareUrl } from '#lib/sharing/codec.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { jobs } from '#lib/state/jobs.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { assetFromParse, importPriceFiles, type PendingFile } from '#lib/state/asset-import.ts';
	import { confirmAction } from '#lib/ui/confirm.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import FileDrop from '#lib/components/FileDrop.svelte';
	import FormatDialog from '#lib/components/FormatDialog.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';

	// --- Lookup (AM-7)
	let lookup = $state('');
	let fetching = $state(false);
	let lookupError = $state<string | null>(null);
	let found = $state<InstrumentData | null>(null);
	let draft = $state({ name: '', currency: 'EUR', classification: 'unknown' as AssetClassification });
	const idType = $derived(detectIdentifier(lookup));
	const idHint = $derived(
		!lookup.trim()
			? 'ISIN, WKN or crypto ticker (e.g. IE00B4L5Y983, A0RPWH, BTC)'
			: idType === 'isin'
				? 'Valid ISIN'
				: idType === 'wkn'
					? 'Valid WKN'
					: idType === 'ticker'
						? 'Crypto ticker'
						: 'Not a valid identifier'
	);
	const existingMatch = $derived(
		found ? app.assets.find((a) => (found?.isin && a.isin === found.isin) || (found?.wkn && a.wkn === found.wkn)) : null
	);

	async function doLookup(e?: Event) {
		e?.preventDefault();
		if (!idType || fetching) return;
		fetching = true;
		lookupError = null;
		found = null;
		const outcome = await fetchAny(lookup, app.settings);
		fetching = false;
		if (!outcome.ok) {
			lookupError = outcome.error;
			return;
		}
		found = outcome.data;
		draft = {
			name: outcome.data.name ?? lookup.toUpperCase(),
			currency: outcome.data.currency ?? 'EUR',
			classification: outcome.data.classification ?? 'unknown'
		};
	}

	async function saveLookup() {
		if (!found) return;
		const id = lookup.trim().toUpperCase();
		const a = newAsset({
			name: draft.name.trim() || id,
			isin: found.isin ?? (idType === 'isin' ? id : null),
			wkn: found.wkn ?? (idType === 'wkn' ? id : null),
			currency: draft.currency,
			classification: draft.classification,
			prices: found.prices,
			lastRefreshedAt: new Date().toISOString(),
			exposure: found.exposure ?? null
		});
		await app.saveAsset(a);
		notify.success(`Added “${a.name}”`, { label: 'Open', href: `/assets/${app.assetSlug(a.id)}` });
		found = null;
		lookup = '';
		void jobs.fetchCurrencyRates();
	}

	// --- CSV upload (AM-1, AM-3)
	let queue = $state<PendingFile[]>([]);
	let queueIndex = $state(0);
	let queueTotal = $state(0);
	let formatOpen = $state(false);
	const currentFile = $derived(queue[0] ?? null);

	async function onFiles(files: File[]) {
		const { imported, pending } = await importPriceFiles(files);
		for (const a of imported) notify.success(`Imported “${a.name}” (${a.prices.length} prices)`);
		if (pending.length) {
			queue = pending;
			queueIndex = 0;
			queueTotal = pending.length;
			formatOpen = true;
		}
		if (imported.length) void jobs.fetchCurrencyRates();
	}

	function nextFile() {
		queue = queue.slice(1);
		queueIndex++;
		if (queue.length) setTimeout(() => (formatOpen = true), 50);
		else void jobs.fetchCurrencyRates();
	}

	// --- List (AM-5)
	let filter = $state<AssetClassification | 'all'>('all');
	let search = $state('');
	let sort = $state<'name' | 'return' | 'volatility' | 'points' | 'updated'>('name');
	let selected = $state<string[]>([]);

	const healthCache = new WeakMap<Asset, AssetHealth>();
	function health(a: Asset): AssetHealth {
		let h = healthCache.get(a);
		if (!h) healthCache.set(a, (h = computeAssetHealth(a.prices)));
		return h;
	}

	const classes = $derived(ASSET_CLASSIFICATIONS.filter((c) => app.assets.some((a) => a.classification === c)));
	const rows = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = app.assets.filter(
			(a) =>
				(filter === 'all' || a.classification === filter) &&
				(!q || a.name.toLowerCase().includes(q) || a.isin?.toLowerCase().includes(q) || a.wkn?.toLowerCase().includes(q))
		);
		const by: Record<typeof sort, (a: Asset, b: Asset) => number> = {
			name: (a, b) => a.name.localeCompare(b.name),
			return: (a, b) => health(b).annualizedReturn - health(a).annualizedReturn,
			volatility: (a, b) => health(a).volatility - health(b).volatility,
			points: (a, b) => b.prices.length - a.prices.length,
			updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt)
		};
		return list.sort(by[sort]);
	});
	const selectedIsins = $derived(selected.map((id) => app.assetById.get(id)?.isin).filter((x): x is string => !!x));

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
	}

	async function remove(a: Asset) {
		const ok = await confirmAction({
			title: 'Delete asset',
			message: `Delete “${a.name}”? It is also removed from portfolios, strategies and transactions.`,
			confirmLabel: 'Delete',
			danger: true
		});
		if (!ok) return;
		await app.deleteAsset(a.id);
		selected = selected.filter((x) => x !== a.id);
		notify.show(`Deleted “${a.name}”`);
	}
</script>

<PageHeader title="Assets" subtitle="Price histories for securities, funds and crypto.">
	{#snippet actions()}
		{#if app.assets.some((a) => a.isin || a.wkn)}
			<Button icon="refresh" loading={jobs.refreshing} onclick={() => jobs.refreshAssets(app.assets.filter((a) => a.isin || a.wkn))}
				>Refresh all</Button
			>
		{/if}
	{/snippet}
</PageHeader>

<div class="stack" style="--gap: 20px">
	<div class="add-grid">
		<Card title="Look up by identifier">
			<form class="stack" style="--gap: 10px" onsubmit={doLookup}>
				<div class="lookup-row">
					<input
						class="input"
						bind:value={lookup}
						placeholder="ISIN, WKN or ticker"
						aria-label="Identifier"
						aria-describedby="lookup-hint"
						autocapitalize="characters"
						autocomplete="off"
						spellcheck="false"
						aria-invalid={!!lookup.trim() && !idType}
					/>
					<Button type="submit" variant="primary" icon="search" loading={fetching} disabled={!idType}>Fetch</Button>
				</div>
				<p id="lookup-hint" class="hint" class:pos={!!idType}>{idHint}</p>
				{#if lookupError}<p class="error-text">{lookupError}</p>{/if}
			</form>
			{#if found}
				<div class="preview stack" style="--gap: 10px">
					<div class="row" style="--gap: 6px">
						<Badge tone="accent">{found.prices.length} prices</Badge>
						<Badge>{fmt.date(found.prices[0]?.date)} – {fmt.date(found.prices.at(-1)?.date)}</Badge>
						<Badge>via {found.source}</Badge>
					</div>
					{#if existingMatch}<p class="small warn">Already in your library as “{existingMatch.name}”.</p>{/if}
					<div class="grid" style="--min: 150px">
						<div><label class="label" for="lk-name">Name</label><input id="lk-name" class="input" bind:value={draft.name} /></div>
						<div>
							<label class="label" for="lk-cur">Currency</label>
							<select id="lk-cur" class="select" bind:value={draft.currency}>
								{#each [...new Set([draft.currency, ...COMMON_CURRENCIES])] as c (c)}<option>{c}</option>{/each}
							</select>
						</div>
						<div>
							<label class="label" for="lk-cls">Type</label>
							<select id="lk-cls" class="select" bind:value={draft.classification}>
								{#each ASSET_CLASSIFICATIONS as c (c)}<option value={c}>{c.toUpperCase()}</option>{/each}
							</select>
						</div>
					</div>
					<div class="row">
						<Button variant="primary" icon="plus" onclick={saveLookup}>Add asset</Button>
						<Button variant="ghost" onclick={() => (found = null)}>Cancel</Button>
					</div>
				</div>
			{/if}
		</Card>
		<Card title="Upload CSV">
			<FileDrop onfiles={onFiles} hint="Date + close price columns. EU and US formats are detected automatically." />
		</Card>
	</div>

	{#if app.assets.length === 0}
		<Card>
			<EmptyState icon="assets" title="No assets yet">Look up an ISIN above or upload price history CSV files to get started.</EmptyState>
		</Card>
	{:else}
		<Card padded={false}>
			<div class="toolbar">
				<input class="input search" type="search" placeholder="Search name, ISIN, WKN" bind:value={search} aria-label="Search assets" />
				<select class="select" bind:value={filter} aria-label="Filter by type">
					<option value="all">All types</option>
					{#each classes as c (c)}<option value={c}>{c.toUpperCase()}</option>{/each}
				</select>
				<select class="select" bind:value={sort} aria-label="Sort by">
					<option value="name">Name</option>
					<option value="return">Return</option>
					<option value="volatility">Volatility</option>
					<option value="points">Data points</option>
					<option value="updated">Recently updated</option>
				</select>
			</div>
			{#if selected.length}
				<div class="selection">
					<span class="small"><b>{selected.length}</b> selected</span>
					<div class="row">
						<Button
							size="sm"
							variant="primary"
							icon="compare"
							disabled={selected.length < 2}
							onclick={() => goto(`/compare?slugs=${selected.map((id) => app.assetSlug(id)).join(',')}`)}>Compare</Button
						>
						<ShareButton
							url={shareUrl(encodeAssetList(selectedIsins))}
							title="Shared assets"
							disabled={!selectedIsins.length}
							reason="Only assets with an ISIN can be shared"
						/>
						<Button size="sm" variant="ghost" onclick={() => (selected = [])}>Clear</Button>
					</div>
				</div>
			{/if}
			<ul class="asset-list">
				{#each rows as a (a.id)}
					{@const h = health(a)}
					<li class:sel={selected.includes(a.id)}>
						<input type="checkbox" checked={selected.includes(a.id)} onchange={() => toggle(a.id)} aria-label="Select {a.name}" />
						<a class="main" href="/assets/{app.assetSlug(a.id)}">
							<span class="name truncate">{a.name}</span>
							<span class="meta xs muted">
								<Badge>{a.classification.toUpperCase()}</Badge>
								{#if a.isin}<span class="mono">{a.isin}</span>{/if}
								<span>{a.currency}</span>
								<span>{a.prices.length} pts</span>
								{#if a.prices.length}<span class="hide-sm">{fmt.date(a.prices[0]?.date)} – {fmt.date(a.prices.at(-1)?.date)}</span>{/if}
							</span>
						</a>
						<div class="figs">
							<span class="num {fmt.signClass(h.annualizedReturn)}" title="Annualized log return">{fmt.pct(h.annualizedReturn, 1)}</span>
							<span class="num xs muted" title="Volatility">σ {fmt.pct(h.volatility, 0)}</span>
						</div>
						<div class="acts">
							{#if h.warnings.length}<span class="warn-icon" title={h.warnings.map((w) => w.message).join('\n')}
									><Icon name="alert" size={16} /></span
								>{/if}
							<button
								class="icon-btn"
								class:on={app.isBenchmark('asset', a.id)}
								aria-pressed={app.isBenchmark('asset', a.id)}
								title="Benchmark"
								aria-label="Use {a.name} as benchmark"
								onclick={() => app.toggleBenchmark('asset', a.id)}><Icon name="star" size={16} /></button
							>
							<button class="icon-btn" title="Delete" aria-label="Delete {a.name}" onclick={() => remove(a)}
								><Icon name="trash" size={16} /></button
							>
						</div>
					</li>
				{:else}
					<li class="none muted small">No assets match your filters.</li>
				{/each}
			</ul>
		</Card>
	{/if}
</div>

{#if currentFile}
	<FormatDialog
		bind:open={formatOpen}
		text={currentFile.text}
		fileName={currentFile.name}
		queue={{ index: queueIndex, total: queueTotal }}
		onconfirm={async ({ result, name, currency, classification }) => {
			const a = assetFromParse(result, currentFile.text, { name, currency, classification });
			await app.saveAsset(a);
			notify.success(`Imported “${a.name}” (${a.prices.length} prices)`);
			nextFile();
		}}
		onskip={nextFile}
	/>
{/if}

<style>
	.add-grid {
		display: grid;
		gap: var(--space-4);
	}
	@media (min-width: 1000px) {
		.add-grid {
			grid-template-columns: 3fr 2fr;
		}
	}
	.lookup-row {
		display: flex;
		gap: 8px;
	}
	.lookup-row .input {
		font-family: var(--mono);
		text-transform: uppercase;
	}
	.preview {
		margin-top: var(--space-4);
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}
	.warn {
		color: var(--warning);
	}
	.toolbar {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.toolbar .search {
		grid-column: 1 / -1;
	}
	@media (min-width: 640px) {
		.toolbar {
			grid-template-columns: 1fr 160px 170px;
		}
		.toolbar .search {
			grid-column: auto;
		}
	}
	.selection {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
		padding: 10px var(--space-4);
		background: var(--accent-soft);
	}
	.asset-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.asset-list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-areas: 'cb main figs' 'cb main acts';
		align-items: center;
		gap: 2px 12px;
		padding: 12px var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	@media (min-width: 640px) {
		.asset-list li {
			grid-template-columns: auto minmax(0, 1fr) auto auto;
			grid-template-areas: 'cb main figs acts';
		}
	}
	.asset-list li:last-child {
		border-bottom: none;
	}
	.asset-list li.sel {
		background: var(--accent-soft);
	}
	input[type='checkbox'] {
		grid-area: cb;
	}
	.main {
		grid-area: main;
		display: grid;
		gap: 3px;
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}
	.main:hover .name {
		color: var(--accent);
	}
	.name {
		font-weight: 600;
	}
	.meta {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	@media (max-width: 640px) {
		.hide-sm {
			display: none;
		}
	}
	.figs {
		grid-area: figs;
		display: grid;
		justify-items: end;
		font-weight: 600;
	}
	.acts {
		grid-area: acts;
		display: flex;
		gap: 2px;
		justify-content: flex-end;
		align-items: center;
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: none;
		border-radius: 50%;
		background: none;
		color: var(--muted);
	}
	.icon-btn:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.icon-btn.on {
		color: var(--chart-4);
	}
	.icon-btn.on :global(svg) {
		fill: currentColor;
	}
	.warn-icon {
		color: var(--warning);
		display: grid;
		padding: 0 4px;
	}
	.none {
		display: block !important;
		text-align: center;
		padding: var(--space-5) !important;
	}
</style>
