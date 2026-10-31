<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Transaction, TransactionType } from '#lib/domain/types.ts';
	import { benchmarkCorrelation } from '#lib/core/correlation.ts';
	import { drawdownSeries, maxDrawdown } from '#lib/core/metrics.ts';
	import { encodePortfolio, shareUrl } from '#lib/sharing/codec.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { crisis } from '#lib/state/crisis.svelte.ts';
	import { asyncDerived } from '#lib/state/async.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { driftView, trackedHistory, trackedView } from '#lib/state/portfolio-view.ts';
	import * as calc from '#lib/workers/client.ts';
	import * as fmt from '#lib/format.ts';
	import { confirmAction } from '#lib/ui/confirm.svelte.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Stat from '#lib/ui/Stat.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Toggle from '#lib/ui/Toggle.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import MetricsTable from '#lib/components/MetricsTable.svelte';
	import PortfolioCrises from '#lib/components/PortfolioCrises.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';
	import PortfolioForm from '#lib/components/PortfolioForm.svelte';
	import TransactionForm from '#lib/components/TransactionForm.svelte';
	import ImportWizard from '#lib/components/ImportWizard.svelte';
	import LineChart from '#lib/charts/LineChart.svelte';
	import Donut from '#lib/charts/Donut.svelte';
	import Heatmap from '#lib/charts/Heatmap.svelte';
	import DriftBars from '#lib/charts/DriftBars.svelte';

	// Keep showing the same record while its slug changes after a rename.
	let pinned = { slug: '', id: '' };
	const portfolio = $derived(
		app.portfolioBySlug(page.params.slug ?? '') ?? (pinned.slug === page.params.slug ? app.portfolioById.get(pinned.id) : undefined)
	);
	$effect(() => {
		if (portfolio) pinned = { slug: page.params.slug ?? '', id: portfolio.id };
	});
	type Tab = 'overview' | 'holdings' | 'transactions' | 'drift';
	let tab = $state<Tab>('overview');
	const tabs = $derived.by(() => {
		if (!portfolio) return [] as Array<{ value: Tab; label: string }>;
		const t: Array<{ value: Tab; label: string }> = [];
		if (portfolio.mode !== 'tracked') t.push({ value: 'overview', label: 'Backtest' });
		if (portfolio.mode !== 'model') t.push({ value: 'holdings', label: 'Holdings' }, { value: 'transactions', label: 'Transactions' });
		if (portfolio.mode === 'both') t.push({ value: 'drift', label: 'Drift' });
		return t;
	});
	$effect(() => {
		if (tabs.length && !tabs.some((t) => t.value === tab)) tab = tabs[0]!.value;
	});

	// --- Model backtest (PM-2, PM-3)
	const backtest = $derived(portfolio && portfolio.mode !== 'tracked' ? app.portfolioSeries(portfolio) : null);
	const prices = $derived(backtest?.prices ?? []);
	const metrics = asyncDerived(() => (prices.length > 1 ? calc.metrics(prices, app.riskFreeRate) : null));
	const isBench = $derived(portfolio ? app.isBenchmark('portfolio', portfolio.id) : false);
	const bench = $derived(app.benchmarkResolved && !isBench && tab === 'overview' ? app.benchmarkSeries() : null);
	// Benchmark over the portfolio's dates, so metrics, drawdown and correlation compare like with like.
	const benchWindow = $derived.by(() => {
		if (!bench || prices.length < 2) return null;
		const start = prices[0]!.date;
		const end = prices.at(-1)!.date;
		const w = bench.filter((p) => p.date >= start && p.date <= end);
		return w.length > 1 ? w : null;
	});
	const benchMetrics = asyncDerived(() => (benchWindow ? calc.metrics(benchWindow, app.riskFreeRate) : null));
	const benchCorrelation = $derived(benchWindow ? benchmarkCorrelation(prices, benchWindow) : null);
	const benchName = $derived(app.benchmarkResolved?.name ?? 'Benchmark');
	const constituents = $derived(
		portfolio ? portfolio.allocations.map((a) => ({ alloc: a, asset: app.assetById.get(a.assetId) })).filter((c) => !!c.asset) : []
	);
	const correlation = asyncDerived(() =>
		tab === 'overview' && constituents.length >= 2
			? calc.correlation(constituents.map((c) => ({ id: c.asset!.id, prices: app.converted(c.asset!).prices })))
			: null
	);
	const constituentMetrics = asyncDerived(() =>
		tab === 'overview' && constituents.length
			? Promise.all(constituents.map((c) => calc.metrics(app.converted(c.asset!).prices, app.riskFreeRate)))
			: null
	);
	const labels = $derived(new Map(app.assets.map((a) => [a.id, a.name])));
	const shareable = $derived(constituents.length > 0 && constituents.every((c) => c.asset?.isin));

	// --- Tracked (PT-5 … PT-8)
	const tracked = $derived(portfolio && portfolio.mode !== 'model' ? trackedView(portfolio) : null);
	const history = $derived(portfolio && tracked && tab === 'holdings' ? trackedHistory(portfolio) : []);
	let cashOnly = $state(false);
	const drift = $derived(portfolio && tracked && portfolio.mode === 'both' ? driftView(portfolio, tracked, cashOnly) : null);
	const nameOf = (id: string) => app.assetById.get(id)?.name ?? 'Unknown asset';

	// --- Transactions
	let txOpen = $state(false);
	let editing = $state<Transaction | null>(null);
	let importOpen = $state(false);
	let txFilterAsset = $state('');
	let txFilterType = $state<TransactionType | ''>('');
	const txs = $derived(
		portfolio
			? app
					.transactionsOf(portfolio.id)
					.filter((t) => (!txFilterAsset || t.assetId === txFilterAsset) && (!txFilterType || t.type === txFilterType))
					.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
			: []
	);
	const txAssets = $derived([
		...new Set(
			portfolio
				? app
						.transactionsOf(portfolio.id)
						.map((t) => t.assetId)
						.filter(Boolean)
				: []
		)
	]);

	function txTotal(t: Transaction): number {
		const q = t.quantity ?? 0;
		const p = t.price ?? 0;
		if (t.type === 'buy') return -(q * p + t.fee);
		if (t.type === 'sell') return q * p - t.fee;
		if (t.type === 'dividend') return (t.amount ?? 0) - t.withholdingTax - t.fee;
		if (t.type === 'deposit') return t.amount ?? 0;
		return -(t.amount ?? 0);
	}

	async function removeTx(t: Transaction) {
		if (
			await confirmAction({
				title: 'Delete transaction',
				message: `Delete the ${t.type} on ${fmt.date(t.date)}?`,
				confirmLabel: 'Delete',
				danger: true
			})
		)
			await app.deleteTransactions([t.id]);
	}

	let editOpen = $state(false);
	async function remove() {
		if (!portfolio) return;
		const n = app.transactionsOf(portfolio.id).length;
		const ok = await confirmAction({
			title: 'Delete portfolio',
			message: `Delete “${portfolio.name}”${n ? ` and its ${n} transactions` : ''}?`,
			confirmLabel: 'Delete',
			danger: true
		});
		if (!ok) return;
		const name = portfolio.name;
		await app.deletePortfolio(portfolio.id);
		notify.show(`Deleted “${name}”`);
		await goto('/portfolios');
	}

	const TYPE_LABEL: Record<TransactionType, string> = {
		buy: 'Buy',
		sell: 'Sell',
		dividend: 'Dividend',
		deposit: 'Deposit',
		withdrawal: 'Withdrawal',
		fee: 'Fee',
		tax: 'Tax'
	};
</script>

{#if !portfolio}
	<PageHeader title="Portfolio not found" back={{ href: '/portfolios', label: 'Portfolios' }} />
	<Card><EmptyState icon="search" title="This portfolio does not exist">It may have been deleted or renamed.</EmptyState></Card>
{:else}
	<PageHeader title={portfolio.name} back={{ href: '/portfolios', label: 'Portfolios' }}>
		{#snippet meta()}
			<Badge tone="accent">{portfolio.mode === 'both' ? 'Model + tracked' : portfolio.mode === 'model' ? 'Model' : 'Tracked'}</Badge>
			{#if portfolio.mode !== 'tracked' && portfolio.rebalance && portfolio.rebalance !== 'none'}<Badge
					>Rebalanced {portfolio.rebalance}</Badge
				>{/if}
			{#if isBench}<Badge tone="warning">Benchmark</Badge>{/if}
			{#if portfolio.sourceStrategyId}{@const s = app.strategies.find((x) => x.id === portfolio.sourceStrategyId)}{#if s}<a
						href="/strategies/{app.strategySlug(s.id)}"><Badge>From {s.name}</Badge></a
					>{/if}{/if}
		{/snippet}
		{#snippet actions()}
			{#if portfolio.allocations.length}
				<Button size="sm" icon="star" onclick={() => app.toggleBenchmark('portfolio', portfolio.id)}
					>{isBench ? 'Unset benchmark' : 'Set as benchmark'}</Button
				>
				<ShareButton
					url={shareable
						? shareUrl(
								encodePortfolio(
									portfolio.name,
									constituents.map((c) => ({ isin: c.asset!.isin!, weight: c.alloc.weight }))
								)
							)
						: ''}
					title={portfolio.name}
					disabled={!shareable}
					reason="All assets need an ISIN to share"
				/>
			{/if}
			<Button size="sm" icon="edit" onclick={() => (editOpen = true)}>Edit</Button>
			<Button size="sm" icon="trash" variant="ghost" aria-label="Delete portfolio" onclick={remove} />
		{/snippet}
	</PageHeader>

	{#if tabs.length > 1}<div class="tabs"><Segmented bind:value={tab} options={tabs} label="Portfolio view" /></div>{/if}

	{#if tab === 'overview'}
		<div class="stack" style="--gap: 20px">
			{#if backtest?.unconverted.length}<p class="notice small">
					No exchange rates for {backtest.unconverted.join(', ')} — these are included unconverted.
				</p>{/if}
			{#if prices.length < 2}
				<Card
					><EmptyState icon="portfolio" title="No overlapping price history"
						>Add assets with price data covering a common period.</EmptyState
					></Card
				>
			{:else}
				<Card title="Backtest" subtitle="Start value 100 on {fmt.date(prices[0]?.date)}, in {app.settings.mainCurrency}">
					<LineChart
						series={[
							{ label: portfolio.name, data: prices, fill: !bench },
							...(bench
								? [{ label: `${app.benchmarkResolved?.name} (benchmark)`, data: bench, dashed: true, color: 'var(--chart-2)' }]
								: [])
						]}
						allowRelative
						mode={bench ? 'relative' : 'value'}
						label="Portfolio backtest"
					/>
				</Card>
				<Card title="Financial metrics" subtitle={benchWindow ? `Second line: ${benchName} (benchmark) over the same dates` : undefined}
					><MetricsTable
						metrics={metrics.value}
						loading={metrics.loading}
						benchmark={benchMetrics.value}
						benchmarkLabel={benchName}
						correlation={benchCorrelation}
					/></Card
				>
				<div class="two">
					<Card title="Allocation">
						<Donut
							items={constituents.map((c) => ({
								label: c.asset!.name,
								value: c.alloc.weight,
								href: `/assets/${app.assetSlug(c.asset!.id)}`
							}))}
							centerLabel="Assets"
							centerValue={String(constituents.length)}
						/>
					</Card>
					<Card
						title="Drawdown"
						subtitle="Max {fmt.pct(maxDrawdown(prices))}{benchWindow ? ` · benchmark ${fmt.pct(maxDrawdown(benchWindow))}` : ''}"
					>
						<LineChart
							series={[
								{ label: 'Drawdown', data: drawdownSeries(prices), fill: true, color: 'var(--chart-2)' },
								...(benchWindow
									? [{ label: `${benchName} (benchmark)`, data: drawdownSeries(benchWindow), color: 'var(--silver)', width: 1 }]
									: [])
							]}
							format="percent"
							height={220}
							label="Drawdown"
						/>
					</Card>
				</div>
			{/if}
			{#if constituents.length}
				<Card
					title="Crises"
					subtitle="How this allocation would have done in historical crises{portfolio.rebalance && portfolio.rebalance !== 'none'
						? ` with ${portfolio.rebalance} rebalancing`
						: ', bought and held'}"
				>
					<PortfolioCrises weights={crisis.portfolioWeights(portfolio)} rebalance={portfolio.rebalance ?? 'none'} name={portfolio.name} />
				</Card>
				<Card title="Constituents">
					<div class="scroll-x">
						<table class="table">
							<thead
								><tr
									><th>Asset</th><th class="right">Weight</th><th class="right">Return p.a. 1Y</th><th class="right">Return p.a. all</th><th
										class="right">Volatility</th
									><th class="right">Max DD</th></tr
								></thead
							>
							<tbody>
								{#each constituents as c, i (c.asset!.id)}
									{@const m = constituentMetrics.value?.[i]}
									<tr>
										<td><a href="/assets/{app.assetSlug(c.asset!.id)}">{c.asset!.name}</a></td>
										<td class="right num">{fmt.pct(c.alloc.weight, 1)}</td>
										<td class="right num {fmt.signClass(m?.['1y']?.annualizedReturn)}">{fmt.pct(m?.['1y']?.annualizedReturn)}</td>
										<td class="right num {fmt.signClass(m?.all?.annualizedReturn)}">{fmt.pct(m?.all?.annualizedReturn)}</td>
										<td class="right num">{fmt.pct(m?.all?.volatility)}</td>
										<td class="right num neg">{fmt.pct(m?.all?.maxDrawdown)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card>
			{/if}
			{#if correlation.value}
				<Card title="Correlation"
					><Heatmap
						matrix={correlation.value}
						{labels}
						onselect={(a, b) => goto(`/compare?slugs=${[a, b].map((id) => app.assetSlug(id)).join(',')}`)}
					/></Card
				>
			{/if}
		</div>
	{:else if tab === 'holdings' && tracked}
		{@const s = tracked.summary}
		{@const cur = portfolio.cashCurrency}
		<div class="stack" style="--gap: 20px">
			{#if tracked.unconverted}<p class="notice small">
					{tracked.unconverted} transaction(s) are in a currency without exchange rates and are counted unconverted.
				</p>{/if}
			<div class="stat-grid">
				<Card><Stat label="Value" value={fmt.money(s.totalValue, cur)} /></Card>
				<Card
					><Stat
						label="Total return"
						value={fmt.money(s.totalReturn, cur, { signed: true })}
						sub={fmt.pct(s.totalReturnPercent, 2, true)}
						tone={fmt.signClass(s.totalReturn)}
					/></Card
				>
				<Card
					><Stat
						label="Unrealized"
						value={fmt.money(s.unrealizedGain, cur, { signed: true })}
						tone={fmt.signClass(s.unrealizedGain)}
					/></Card
				>
				<Card
					><Stat
						label="Realized + dividends"
						value={fmt.money(s.realizedGain + s.dividends, cur, { signed: true })}
						sub="Dividends {fmt.money(s.dividends, cur)}"
						tone={fmt.signClass(s.realizedGain + s.dividends)}
					/></Card
				>
				{#if s.cash !== null}<Card><Stat label="Cash" value={fmt.money(s.cash, cur)} tone={s.cash < 0 ? 'neg' : ''} /></Card>{/if}
				<Card><Stat label="Fees & taxes" value={fmt.money(s.fees, cur)} /></Card>
			</div>
			{#if s.holdings.length === 0}
				<Card
					><EmptyState icon="wallet" title="No open positions"
						>Add buy transactions or import them from your broker.{#snippet actions()}<Button
								variant="primary"
								icon="plus"
								onclick={() => {
									editing = null;
									txOpen = true;
								}}>Add transaction</Button
							>{/snippet}</EmptyState
					></Card
				>
			{:else}
				{#if history.length > 1}
					<Card title="Value over time">
						<LineChart
							series={[
								{ label: 'Market value', data: history.map((h) => ({ date: h.date, close: h.value })), fill: true },
								{
									label: portfolio.trackCash ? 'Net deposits' : 'Invested',
									data: history.map((h) => ({ date: h.date, close: h.invested })),
									dashed: true,
									color: 'var(--chart-5)'
								}
							]}
							format="currency"
							currency={cur}
							label="Portfolio value history"
						/>
					</Card>
				{/if}
				<Card title="Holdings" padded={false}>
					<div class="scroll-x">
						<table class="table holdings">
							<thead
								><tr
									><th>Asset</th><th class="right">Qty</th><th class="right">Avg cost</th><th class="right">Price</th><th class="right"
										>Value</th
									><th class="right">Gain</th><th class="right">Weight</th></tr
								></thead
							>
							<tbody>
								{#each s.holdings as h (h.assetId)}
									<tr>
										<td><a href="/assets/{app.assetSlug(h.assetId)}">{nameOf(h.assetId)}</a></td>
										<td class="right num">{fmt.qty(h.quantity)}</td>
										<td class="right num">{fmt.money(h.avgCost, cur)}</td>
										<td class="right num">{h.currentPrice === null ? '–' : fmt.money(h.currentPrice, cur)}</td>
										<td class="right num">{fmt.money(h.currentValue, cur)}</td>
										<td class="right num {fmt.signClass(h.unrealizedGain)}"
											>{fmt.money(h.unrealizedGain, cur, { signed: true })}<br /><span class="xs"
												>{fmt.pct(h.unrealizedGainPercent, 1, true)}</span
											></td
										>
										<td class="right num">{fmt.pct(h.weight, 1)}</td>
									</tr>
								{/each}
								{#if s.cash !== null}
									<tr
										><td>Cash</td><td></td><td></td><td></td><td class="right num">{fmt.money(s.cash, cur)}</td><td></td><td
											class="right num">{fmt.pct(s.totalValue > 0 ? Math.max(0, s.cash) / s.totalValue : 0, 1)}</td
										></tr
									>
								{/if}
							</tbody>
							<tfoot
								><tr
									><td>Total</td><td></td><td></td><td></td><td class="right num">{fmt.money(s.totalValue, cur)}</td><td
										class="right num {fmt.signClass(s.unrealizedGain)}">{fmt.money(s.unrealizedGain, cur, { signed: true })}</td
									><td></td></tr
								></tfoot
							>
						</table>
					</div>
				</Card>
				<Card title="Actual allocation">
					<Donut
						items={[
							...s.holdings.map((h) => ({ label: nameOf(h.assetId), value: h.currentValue, href: `/assets/${app.assetSlug(h.assetId)}` })),
							...(s.cash && s.cash > 0 ? [{ label: 'Cash', value: s.cash, color: 'var(--silver)' }] : [])
						]}
						centerLabel="Value"
						centerValue={fmt.money(s.totalValue, cur, { compact: true })}
					/>
				</Card>
				{#if portfolio.mode === 'tracked'}
					<Card title="Crises" subtitle="How the current holdings would have done in historical crises, bought and held">
						<PortfolioCrises
							weights={s.holdings.filter((h) => h.currentValue > 0).map((h) => ({ assetId: h.assetId, weight: h.currentValue }))}
							rebalance="none"
							name={portfolio.name}
						/>
					</Card>
				{/if}
			{/if}
		</div>
	{:else if tab === 'transactions'}
		<Card padded={false}>
			<div class="tx-toolbar">
				<select class="select" bind:value={txFilterAsset} aria-label="Filter by asset">
					<option value="">All assets</option>
					{#each txAssets as id (id)}<option value={id}>{nameOf(id)}</option>{/each}
				</select>
				<select class="select" bind:value={txFilterType} aria-label="Filter by type">
					<option value="">All types</option>
					{#each Object.entries(TYPE_LABEL) as [k, l] (k)}<option value={k}>{l}</option>{/each}
				</select>
				<div class="row">
					<Button icon="upload" size="sm" onclick={() => (importOpen = true)}>Import</Button>
					<Button
						icon="plus"
						size="sm"
						variant="primary"
						onclick={() => {
							editing = null;
							txOpen = true;
						}}>Add</Button
					>
				</div>
			</div>
			{#if txs.length === 0}
				<EmptyState icon="list" title="No transactions"
					>Add your buys, sells and dividends, or import them from Portfolio Performance, Parqet or a broker CSV.</EmptyState
				>
			{:else}
				<ul class="tx-list">
					{#each txs as t (t.id)}
						{@const total = txTotal(t)}
						<li>
							<div class="tx-main">
								<span class="tx-type {t.type}">{TYPE_LABEL[t.type]}</span>
								<div class="truncate">
									<span class="small strong">{t.assetId ? nameOf(t.assetId) : t.notes || TYPE_LABEL[t.type]}</span>
									<span class="xs muted block"
										>{fmt.date(t.date)}{#if t.quantity}
											· {fmt.qty(t.quantity)} × {fmt.money(t.price, t.currency)}{/if}{#if t.fee}
											· fee {fmt.money(t.fee, t.currency)}{/if}{#if t.withholdingTax}
											· tax {fmt.money(t.withholdingTax, t.currency)}{/if}</span
									>
									{#if t.notes && t.assetId}<span class="xs muted block truncate">{t.notes}</span>{/if}
								</div>
							</div>
							<span class="num small {fmt.signClass(total)}">{fmt.money(total, t.currency, { signed: true })}</span>
							<div class="acts">
								<button
									aria-label="Edit transaction"
									onclick={() => {
										editing = t;
										txOpen = true;
									}}><Icon name="edit" size={16} /></button
								>
								<button aria-label="Delete transaction" onclick={() => removeTx(t)}><Icon name="trash" size={16} /></button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	{:else if tab === 'drift' && drift}
		<div class="stack" style="--gap: 20px">
			<Card title="Drift analysis" subtitle="Actual vs model weights of your securities">
				{#if drift.drift.length}<DriftBars items={drift.drift} {nameOf} />{:else}<p class="muted small">
						No holdings or model weights yet.
					</p>{/if}
			</Card>
			<Card title="Rebalancing suggestions">
				{#if portfolio.trackCash}<Toggle
						bind:checked={cashOnly}
						label="Only buy with available cash"
						description="Don't sell — invest the cash balance into underweight assets."
					/>{/if}
				{#if drift.trades.length}
					<div class="scroll-x">
						<table class="table">
							<thead
								><tr
									><th>Asset</th><th>Action</th><th class="right">Amount</th><th class="right">≈ Units</th><th class="right"
										>Now → target</th
									></tr
								></thead
							>
							<tbody>
								{#each drift.trades as t (t.assetId)}
									<tr>
										<td>{nameOf(t.assetId)}</td>
										<td><Badge tone={t.action === 'buy' ? 'accent' : 'negative'}>{t.action === 'buy' ? 'Buy' : 'Sell'}</Badge></td>
										<td class="right num">{fmt.money(t.value, portfolio.cashCurrency)}</td>
										<td class="right num">{t.quantity === null ? '–' : fmt.num(t.quantity, 4, 0)}</td>
										<td class="right num">{fmt.pct(t.currentWeight, 1)} → {fmt.pct(t.targetWeight, 1)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="muted small">Your portfolio matches the model. 🎉</p>
				{/if}
			</Card>
		</div>
	{/if}

	<PortfolioForm
		bind:open={editOpen}
		{portfolio}
		onsaved={(p) => {
			const slug = app.portfolioSlug(p.id);
			if (slug !== page.params.slug) goto(`/portfolios/${slug}`, { replace: true });
		}}
	/>
	<TransactionForm bind:open={txOpen} {portfolio} transaction={editing} />
	<ImportWizard bind:open={importOpen} targetPortfolio={portfolio} />
{/if}

<style>
	.tabs {
		margin-bottom: var(--space-4);
	}
	.notice {
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--warning-soft);
		color: var(--warning);
	}
	.two {
		display: grid;
		gap: var(--space-4);
	}
	@media (min-width: 1000px) {
		.two {
			grid-template-columns: 1fr 1fr;
		}
	}
	.stat-grid {
		display: grid;
		gap: var(--space-3);
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 170px), 1fr));
	}
	.tx-toolbar {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		padding: var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.tx-toolbar .row {
		grid-column: 1 / -1;
		justify-content: flex-end;
	}
	@media (min-width: 640px) {
		.tx-toolbar {
			grid-template-columns: 220px 160px 1fr;
		}
		.tx-toolbar .row {
			grid-column: auto;
		}
	}
	.tx-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tx-list li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 10px;
		align-items: center;
		padding: 10px var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.tx-list li:last-child {
		border-bottom: none;
	}
	.tx-main {
		display: flex;
		gap: 10px;
		align-items: center;
		min-width: 0;
	}
	.tx-type {
		flex-shrink: 0;
		width: 82px;
		text-align: center;
		font-size: var(--text-xs);
		font-weight: 650;
		padding: 3px 0;
		border-radius: 6px;
		background: var(--surface-2);
	}
	.tx-type.buy,
	.tx-type.deposit {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.tx-type.sell,
	.tx-type.withdrawal,
	.tx-type.fee,
	.tx-type.tax {
		background: var(--negative-soft);
		color: var(--negative);
	}
	.tx-type.dividend {
		background: var(--warning-soft);
		color: var(--warning);
	}
	.block {
		display: block;
	}
	.strong {
		font-weight: 600;
	}
	.acts {
		display: flex;
	}
	.acts button {
		border: none;
		background: none;
		color: var(--muted);
		padding: 6px;
		display: grid;
	}
	.acts button:hover {
		color: var(--accent);
	}
	.holdings td:first-child {
		min-width: 160px;
	}
</style>
