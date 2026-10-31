<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ASSET_CLASSIFICATIONS, COMMON_CURRENCIES, type PricePoint } from '#lib/domain/types.ts';
	import { drawdownSeries, maxDrawdown } from '#lib/core/metrics.ts';
	import { isValidISIN, isValidWKN } from '#lib/parsers/identifiers.ts';
	import { encodeAssetList, shareUrl } from '#lib/sharing/codec.ts';
	import { exportPortfolioPerformanceQuotes } from '#lib/io/pp-export.ts';
	import { saveText, safeFileName } from '#lib/io/download.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { jobs } from '#lib/state/jobs.svelte.ts';
	import { asyncDerived } from '#lib/state/async.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import * as calc from '#lib/workers/client.ts';
	import * as fmt from '#lib/format.ts';
	import { confirmAction } from '#lib/ui/confirm.svelte.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import MetricsTable from '#lib/components/MetricsTable.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';
	import PriceTable from '#lib/components/PriceTable.svelte';
	import FormatDialog from '#lib/components/FormatDialog.svelte';
	import LineChart from '#lib/charts/LineChart.svelte';

	// Keep showing the same record while its slug changes after a rename.
	let pinned = { slug: '', id: '' };
	const asset = $derived(
		app.assetBySlug(page.params.slug ?? '') ?? (pinned.slug === page.params.slug ? app.assetById.get(pinned.id) : undefined)
	);
	$effect(() => {
		if (asset) pinned = { slug: page.params.slug ?? '', id: asset.id };
	});
	const conv = $derived(asset ? app.converted(asset) : null);
	const prices = $derived(conv?.prices ?? []);
	const metrics = asyncDerived(() => (prices.length > 1 ? calc.metrics(prices, app.riskFreeRate) : null));
	const isBench = $derived(asset ? app.isBenchmark('asset', asset.id) : false);
	const bench = $derived(app.benchmarkResolved && !isBench ? app.benchmarkSeries() : null);
	const dd = $derived(drawdownSeries(prices));
	const rawAvailable = $derived(!!asset?.rawCSV);

	let editOpen = $state(false);
	let reparseOpen = $state(false);
	let form = $state({ name: '', isin: '', wkn: '', currency: 'EUR', classification: 'unknown' as (typeof ASSET_CLASSIFICATIONS)[number] });
	const isinError = $derived(form.isin && !isValidISIN(form.isin) ? 'ISIN must be 12 characters with a valid check digit.' : null);
	const wknError = $derived(form.wkn && !isValidWKN(form.wkn) ? 'WKN must be 6 letters/digits.' : null);

	function openEdit() {
		if (!asset) return;
		form = {
			name: asset.name,
			isin: asset.isin ?? '',
			wkn: asset.wkn ?? '',
			currency: asset.currency,
			classification: asset.classification
		};
		editOpen = true;
	}

	async function saveEdit() {
		if (!asset || isinError || wknError || !form.name.trim()) return;
		const id = asset.id;
		await app.saveAsset({
			...asset,
			name: form.name.trim(),
			isin: form.isin.trim().toUpperCase() || null,
			wkn: form.wkn.trim().toUpperCase() || null,
			currency: form.currency,
			classification: form.classification,
			updatedAt: new Date().toISOString()
		});
		editOpen = false;
		const slug = app.assetSlug(id);
		if (slug !== page.params.slug) await goto(`/assets/${slug}`, { replace: true });
		void jobs.fetchCurrencyRates();
	}

	async function savePrices(p: PricePoint[]) {
		if (asset) await app.saveAsset({ ...asset, prices: p, updatedAt: new Date().toISOString() });
	}

	async function remove() {
		if (!asset) return;
		const ok = await confirmAction({
			title: 'Delete asset',
			message: `Delete “${asset.name}”? It is also removed from portfolios, strategies and transactions.`,
			confirmLabel: 'Delete',
			danger: true
		});
		if (!ok) return;
		const name = asset.name;
		await app.deleteAsset(asset.id);
		notify.show(`Deleted “${name}”`);
		await goto('/assets');
	}

	function downloadCsv() {
		if (asset) saveText(`${safeFileName(asset.name)}.csv`, exportPortfolioPerformanceQuotes(asset), 'text/csv');
	}
</script>

{#if !asset}
	<PageHeader title="Asset not found" back={{ href: '/assets', label: 'Assets' }} />
	<Card><EmptyState icon="search" title="This asset does not exist">It may have been deleted or renamed.</EmptyState></Card>
{:else}
	<PageHeader title={asset.name} back={{ href: '/assets', label: 'Assets' }}>
		{#snippet meta()}
			<Badge tone="accent">{asset.classification.toUpperCase()}</Badge>
			{#if asset.isin}<Badge><span class="mono">{asset.isin}</span></Badge>{/if}
			{#if asset.wkn}<Badge>WKN <span class="mono">{asset.wkn}</span></Badge>{/if}
			<Badge>{asset.currency}</Badge>
			{#if isBench}<Badge tone="warning">Benchmark</Badge>{/if}
		{/snippet}
		{#snippet actions()}
			{#if asset.isin || asset.wkn}<Button icon="refresh" size="sm" loading={jobs.refreshing} onclick={() => jobs.refreshAssets([asset])}
					>Refresh</Button
				>{/if}
			<Button icon="star" size="sm" onclick={() => app.toggleBenchmark('asset', asset.id)}
				>{isBench ? 'Unset benchmark' : 'Set as benchmark'}</Button
			>
			{#if asset.isin}<ShareButton url={shareUrl(encodeAssetList([asset.isin]))} title={asset.name} />{/if}
			<Button icon="edit" size="sm" onclick={openEdit}>Edit</Button>
			<Button icon="trash" size="sm" variant="ghost" onclick={remove} aria-label="Delete asset" />
		{/snippet}
	</PageHeader>

	{#if conv?.status === 'missing'}
		<p class="notice small">
			No exchange rates for {asset.currency} → {app.settings.mainCurrency} yet — figures are shown in {asset.currency}.
			<a href="/settings#currency">Exchange rates</a>
		</p>
	{/if}

	<div class="stack" style="--gap: 20px">
		{#if prices.length < 2}
			<Card><EmptyState icon="assets" title="Not enough price data">Add prices below or refresh from the data source.</EmptyState></Card>
		{:else}
			<Card title="Price history" subtitle={conv?.status === 'converted' ? `Converted to ${app.settings.mainCurrency}` : undefined}>
				<LineChart
					series={[
						{ label: asset.name, data: prices, fill: !bench },
						...(bench ? [{ label: `${app.benchmarkResolved?.name} (benchmark)`, data: bench, dashed: true, color: 'var(--chart-2)' }] : [])
					]}
					format="currency"
					currency={conv?.status === 'missing' ? asset.currency : app.settings.mainCurrency}
					allowRelative
					mode={bench ? 'relative' : 'value'}
					label="Price history of {asset.name}"
				/>
			</Card>
			<Card title="Financial metrics" subtitle="Periods without enough history are hidden">
				<MetricsTable metrics={metrics.value} loading={metrics.loading} />
			</Card>
			<Card title="Drawdown" subtitle="Max drawdown {fmt.pct(maxDrawdown(prices))}">
				<LineChart
					series={[{ label: 'Drawdown', data: dd, fill: true, color: 'var(--chart-2)' }]}
					format="percent"
					height={200}
					label="Drawdown chart"
				/>
			</Card>
		{/if}

		<Card title="Price data">
			{#snippet actions()}
				{#if rawAvailable}<Button size="sm" icon="file" onclick={() => (reparseOpen = true)}>Re-parse CSV</Button>{/if}
				<Button size="sm" icon="download" onclick={downloadCsv} disabled={!asset.prices.length}>CSV</Button>
			{/snippet}
			<PriceTable {asset} onsave={savePrices} />
			{#if asset.rawCSVStoredAt}<p class="xs muted">
					Original CSV kept until {fmt.date(new Date(Date.parse(asset.rawCSVStoredAt) + 30 * 864e5).toISOString())}. Last refresh: {fmt.relativeTime(
						asset.lastRefreshedAt
					)}.
				</p>{:else if asset.lastRefreshedAt}<p class="xs muted">Last refresh: {fmt.relativeTime(asset.lastRefreshedAt)}</p>{/if}
		</Card>
	</div>

	<Dialog bind:open={editOpen} title="Edit asset" size="sm">
		<form
			class="stack"
			style="--gap: 12px"
			onsubmit={(e) => {
				e.preventDefault();
				saveEdit();
			}}
			id="edit-asset"
		>
			<div><label class="label" for="ea-name">Name</label><input id="ea-name" class="input" bind:value={form.name} required /></div>
			<div>
				<label class="label" for="ea-isin">ISIN</label>
				<input
					id="ea-isin"
					class="input mono"
					bind:value={form.isin}
					maxlength="12"
					aria-invalid={!!isinError}
					autocapitalize="characters"
				/>
				{#if isinError}<p class="error-text">{isinError}</p>{/if}
			</div>
			<div>
				<label class="label" for="ea-wkn">WKN</label>
				<input id="ea-wkn" class="input mono" bind:value={form.wkn} maxlength="6" aria-invalid={!!wknError} autocapitalize="characters" />
				{#if wknError}<p class="error-text">{wknError}</p>{/if}
			</div>
			<div class="grid" style="--min: 140px">
				<div>
					<label class="label" for="ea-cur">Currency</label>
					<select id="ea-cur" class="select" bind:value={form.currency}
						>{#each [...new Set([form.currency, ...COMMON_CURRENCIES])] as c (c)}<option>{c}</option>{/each}</select
					>
				</div>
				<div>
					<label class="label" for="ea-cls">Type</label>
					<select id="ea-cls" class="select" bind:value={form.classification}
						>{#each ASSET_CLASSIFICATIONS as c (c)}<option value={c}>{c.toUpperCase()}</option>{/each}</select
					>
				</div>
			</div>
		</form>
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (editOpen = false)}>Cancel</Button>
			<Button variant="primary" type="submit" form="edit-asset" disabled={!!isinError || !!wknError || !form.name.trim()}>Save</Button>
		{/snippet}
	</Dialog>

	{#if asset.rawCSV}
		<FormatDialog
			bind:open={reparseOpen}
			text={asset.rawCSV}
			title="Re-parse CSV"
			showMeta={false}
			initialFormat={asset.formatConfig ?? undefined}
			onconfirm={async ({ result }) => {
				await app.saveAsset({ ...asset, prices: result.prices, formatConfig: result.format, updatedAt: new Date().toISOString() });
				notify.success(`Re-parsed: ${result.prices.length} prices`);
			}}
		/>
	{/if}
{/if}

<style>
	.notice {
		padding: 10px 14px;
		margin-bottom: var(--space-4);
		border-radius: var(--radius);
		background: var(--warning-soft);
		color: var(--warning);
	}
</style>
