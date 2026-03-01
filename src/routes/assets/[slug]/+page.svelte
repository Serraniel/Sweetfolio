<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/shared/Card.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import MetricsTable from '$lib/components/shared/MetricsTable.svelte';
	import PriceChart from '$lib/charts/PriceChart.svelte';
	import DrawdownChart from '$lib/charts/DrawdownChart.svelte';
	import { assets, removeAsset, updateAsset } from '$lib/stores/assets';
	import { encodeAssetList } from '$lib/sharing/codec';
	import ShareButton from '$lib/components/sharing/ShareButton.svelte';
	import { settings } from '$lib/stores/settings';
	import { currencies } from '$lib/stores/currencies';
	import { benchmarkRef, benchmark, setBenchmark } from '$lib/stores/benchmark';
	import { calculateMetrics } from '$lib/workers/manager';
	import PriceDataSection from '$lib/components/PriceDataSection.svelte';
	import { slugify } from '$lib/utils/slug';
	import { ASSET_CLASSIFICATIONS, type AssetClassification, type MetricsResult, type CurrencyRate } from '$lib/types';

	const slug = $derived(page.params.slug ?? '');
	const asset = $derived($assets.find((a) => slugify(a.name) === slug));
	const assetId = $derived(asset?.id ?? '');
	const isCurrentBenchmark = $derived(
		$benchmarkRef !== null && $benchmarkRef.type === 'asset' && $benchmarkRef.id === assetId
	);

	async function toggleBenchmark() {
		if (isCurrentBenchmark) {
			await setBenchmark(null);
		} else {
			await setBenchmark({ type: 'asset', id: assetId });
		}
	}

	// Build chart series with benchmark overlay
	const priceChartSeries = $derived.by(() => {
		if (!asset) return [];
		const series: Array<{ label: string; prices: typeof asset.prices; isBenchmark?: boolean }> = [
			{ label: asset.name, prices: asset.prices }
		];
		const bm = $benchmark;
		if (bm && bm.ref.id !== assetId && bm.prices.length > 0) {
			series.push({ label: bm.name, prices: bm.prices, isBenchmark: true });
		}
		return series;
	});


	let metrics: MetricsResult | null = $state(null);
	let metricsLoading = $state(false);

	// Edit modal state
	let showEditModal = $state(false);
	let editName = $state('');
	let editIsin = $state('');
	let editWkn = $state('');
	let editCurrency = $state('EUR');
	let editClassification: AssetClassification = $state('unknown');
	let editErrors: Record<string, string> = $state({});

	const supportedCurrencies = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK'];

	function openEditModal() {
		if (!asset) return;
		editName = asset.name;
		editIsin = asset.isin ?? '';
		editWkn = asset.wkn ?? '';
		editCurrency = asset.currency;
		editClassification = asset.classification;
		editErrors = {};
		showEditModal = true;
	}

	function validateIsin(value: string): string | null {
		if (!value) return null;
		if (!/^[A-Za-z0-9]{12}$/.test(value)) return 'ISIN must be exactly 12 alphanumeric characters';
		return null;
	}

	function validateWkn(value: string): string | null {
		if (!value) return null;
		if (!/^[A-Za-z0-9]{6}$/.test(value)) return 'WKN must be exactly 6 alphanumeric characters';
		return null;
	}

	async function handleEditSave() {
		if (!asset) return;

		const errors: Record<string, string> = {};
		if (!editName.trim()) errors.name = 'Name is required';
		const isinError = validateIsin(editIsin.trim());
		if (isinError) errors.isin = isinError;
		const wknError = validateWkn(editWkn.trim());
		if (wknError) errors.wkn = wknError;

		if (Object.keys(errors).length > 0) {
			editErrors = errors;
			return;
		}

		const newName = editName.trim();
		await updateAsset({
			...asset,
			name: newName,
			isin: editIsin.trim().toUpperCase() || null,
			wkn: editWkn.trim().toUpperCase() || null,
			currency: editCurrency,
			classification: editClassification,
			updatedAt: new Date().toISOString()
		});
		showEditModal = false;

		// Navigate to updated slug if name changed
		const newSlug = slugify(newName);
		if (newSlug !== slug) {
			goto(`/assets/${newSlug}`, { replaceState: true });
		}
	}

	// Find currency conversion data if asset currency differs from main currency
	function findCurrencyConversion(assetCurrency: string, mainCurrency: string, rates: CurrencyRate[]) {
		if (assetCurrency === mainCurrency) return undefined;
		const directPair = assetCurrency + mainCurrency;
		const inversePair = mainCurrency + assetCurrency;
		const rate = rates.find((r) => r.pair === directPair || r.pair === inversePair);
		if (!rate) return undefined;
		return {
			currencyRate: rate,
			sourceCurrency: assetCurrency,
			targetCurrency: mainCurrency,
		};
	}

	// Compute metrics when asset changes
	$effect(() => {
		if (!asset || asset.prices.length < 2) {
			metrics = null;
			return;
		}

		metricsLoading = true;
		const riskFreeRate = (($settings.riskFreeRate as number) ?? 0) / 100;
		const mainCurrency = ($settings.mainCurrency as string) ?? 'EUR';
		const conversion = findCurrencyConversion(asset.currency, mainCurrency, $currencies);
		calculateMetrics(asset.id, asset.prices, riskFreeRate, conversion)
			.then((result) => {
				metrics = result;
			})
			.finally(() => {
				metricsLoading = false;
			});
	});

	const dateRange = $derived(
		asset && asset.prices.length > 0
			? `${asset.prices[0].date} \u2013 ${asset.prices[asset.prices.length - 1].date}`
			: ''
	);

	// Toast notifications
	let toasts: Array<{ id: number; message: string }> = $state([]);
	let toastCounter = 0;

	function showToast(message: string) {
		const id = ++toastCounter;
		toasts = [...toasts, { id, message }];
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 4000);
	}

	const shareUrl = $derived.by(() => {
		if (!asset?.isin) return '';
		const hash = encodeAssetList([asset.isin]);
		return `${window.location.origin}${window.location.pathname}${hash}`;
	});

	async function handleDelete() {
		if (!asset) return;
		if (!confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;
		await removeAsset(asset.id);
		goto('/assets');
	}
</script>

<svelte:head>
	<title>{asset ? `${asset.name} – Sweetfolio` : 'Asset not found – Sweetfolio'}</title>
</svelte:head>

{#if !asset}
	<div class="asset-detail">
		<Card padding="lg">
			<div class="empty-state">
				<h3>Asset not found</h3>
				<p>This asset may have been deleted.</p>
				<a href="/assets">Back to Assets</a>
			</div>
		</Card>
	</div>
{:else}
	<div class="asset-detail">
		<header class="page-header">
			<div class="page-header-row">
				<div>
					<a href="/assets" class="back-link">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="15 18 9 12 15 6"/>
						</svg>
						Assets
					</a>
					<h1>
						{asset.name}
						{#if isCurrentBenchmark}
							<span class="benchmark-badge">Benchmark</span>
						{/if}
					</h1>
				</div>
				<div class="header-actions">
					{#if asset.isin}
						<ShareButton
							url={shareUrl}
							title={asset.name}
							ontoast={showToast}
						/>
					{/if}
					<Button variant={isCurrentBenchmark ? 'primary' : 'default'} size="sm" onclick={toggleBenchmark}>
						{isCurrentBenchmark ? 'Remove Benchmark' : 'Set as Benchmark'}
					</Button>
					<Button variant="default" size="sm" onclick={openEditModal}>Edit</Button>
					<Button variant="danger" size="sm" onclick={handleDelete}>Delete</Button>
				</div>
			</div>
		</header>

		<section class="asset-meta">
			<Card>
				<div class="meta-grid">
					<div class="meta-item">
						<span class="meta-label">ISIN</span>
						<span class="meta-value mono">{asset.isin ?? '\u2014'}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">WKN</span>
						<span class="meta-value mono">{asset.wkn ?? '\u2014'}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Currency</span>
						<span class="meta-value">{asset.currency}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Data Points</span>
						<span class="meta-value mono">{asset.prices.length.toLocaleString()}</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Date Range</span>
						<span class="meta-value">{dateRange || '\u2014'}</span>
					</div>
				</div>
			</Card>
		</section>

		<section class="asset-metrics">
			<h2>Financial Metrics</h2>
			<Card>
				{#if metricsLoading}
					<p class="loading-text">Calculating metrics...</p>
				{:else}
					<MetricsTable metrics={metrics?.periods ?? {}} />
				{/if}
			</Card>
		</section>

		<section class="asset-charts">
			{#if asset.prices.length > 0}
				<h2>Price History</h2>
				<Card padding="lg">
					<PriceChart series={priceChartSeries} />
				</Card>

				<h2>Drawdown</h2>
				<Card padding="lg">
					<DrawdownChart prices={asset.prices} />
				</Card>
			{:else}
				<Card padding="lg">
					<div class="chart-placeholder">
						<p>No price data available for charts.</p>
					</div>
				</Card>
			{/if}
		</section>

		<PriceDataSection {asset} />

		<Modal bind:open={showEditModal} title="Edit Asset">
			<div class="edit-form">
				<div class="form-field">
					<label for="edit-name">Name</label>
					<input id="edit-name" type="text" bind:value={editName} />
					{#if editErrors.name}<span class="field-error">{editErrors.name}</span>{/if}
				</div>
				<div class="form-field">
					<label for="edit-isin">ISIN</label>
					<input id="edit-isin" type="text" bind:value={editIsin} placeholder="e.g. DE0005140008" maxlength="12" />
					{#if editErrors.isin}<span class="field-error">{editErrors.isin}</span>{/if}
				</div>
				<div class="form-field">
					<label for="edit-wkn">WKN</label>
					<input id="edit-wkn" type="text" bind:value={editWkn} placeholder="e.g. 514000" maxlength="6" />
					{#if editErrors.wkn}<span class="field-error">{editErrors.wkn}</span>{/if}
				</div>
				<div class="form-field">
					<label for="edit-currency">Currency</label>
					<select id="edit-currency" bind:value={editCurrency}>
						{#each supportedCurrencies as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>
				<div class="form-field">
					<label for="edit-classification">Classification</label>
					<select id="edit-classification" bind:value={editClassification}>
						{#each ASSET_CLASSIFICATIONS as cls}
							<option value={cls}>{cls.toUpperCase()}</option>
						{/each}
					</select>
				</div>
			</div>
			{#snippet footer()}
				<Button variant="ghost" onclick={() => showEditModal = false}>Cancel</Button>
				<Button variant="primary" onclick={handleEditSave}>Save</Button>
			{/snippet}
		</Modal>
	</div>
{/if}

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div class="toast">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
					<polyline points="22 4 12 14.01 9 11.01"/>
				</svg>
				<span>{toast.message}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.asset-detail {
		max-width: 1100px;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-md);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.back-link:hover {
		color: var(--color-accent);
	}

	.page-header h1 {
		margin-bottom: 0;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.benchmark-badge {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		background: rgba(141, 208, 196, 0.15);
		color: var(--color-accent);
		white-space: nowrap;
	}

	.header-actions {
		display: flex;
		gap: var(--spacing-sm);
		flex-shrink: 0;
	}

	.asset-meta {
		margin-bottom: var(--spacing-xl);
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--spacing-lg);
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.meta-label {
		font-size: var(--font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.meta-value {
		font-size: var(--font-size-base);
		font-weight: 500;
	}

	.mono {
		font-family: var(--font-mono);
	}

	.asset-metrics {
		margin-bottom: var(--spacing-xl);
	}

	.asset-metrics h2,
	.asset-charts h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-md);
	}

	.asset-charts {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.chart-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-md);
		min-height: 300px;
		color: var(--color-text-muted);
		text-align: center;
		font-size: var(--font-size-sm);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		text-align: center;
		padding: var(--spacing-xl) 0;
		color: var(--color-text-muted);
	}

	.empty-state h3 {
		color: var(--color-text-secondary);
	}

	.loading-text {
		padding: var(--spacing-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.form-field > label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.field-error {
		font-size: var(--font-size-xs);
		color: var(--color-negative);
	}
</style>
