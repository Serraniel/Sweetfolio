<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Portfolio } from '#lib/domain/types.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { trackedView } from '#lib/state/portfolio-view.ts';
	import { confirmAction } from '#lib/ui/confirm.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import PortfolioForm from '#lib/components/PortfolioForm.svelte';
	import { colorAt } from '#lib/charts/palette.ts';

	let createOpen = $state(false);
	const list = $derived([...app.portfolios].sort((a, b) => a.name.localeCompare(b.name)));
	const MODE_LABEL = { model: 'Model', tracked: 'Tracked', both: 'Model + tracked' } as const;

	async function remove(p: Portfolio) {
		const n = app.transactionsOf(p.id).length;
		const ok = await confirmAction({
			title: 'Delete portfolio',
			message: `Delete “${p.name}”${n ? ` and its ${n} transaction${n === 1 ? '' : 's'}` : ''}?`,
			confirmLabel: 'Delete',
			danger: true
		});
		if (!ok) return;
		await app.deletePortfolio(p.id);
		notify.show(`Deleted “${p.name}”`);
	}
</script>

<PageHeader title="Portfolios" subtitle="Model allocations for backtesting and tracked portfolios with real transactions.">
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={() => (createOpen = true)}>New portfolio</Button>
	{/snippet}
</PageHeader>

{#if list.length === 0}
	<Card>
		<EmptyState icon="portfolio" title="No portfolios yet">
			Create a model portfolio from your assets, track real transactions, or import from Portfolio Performance, Parqet or your broker in <a
				href="/settings#data">Settings</a
			>.
			{#snippet actions()}<Button variant="primary" icon="plus" onclick={() => (createOpen = true)}>New portfolio</Button>{/snippet}
		</EmptyState>
	</Card>
{:else}
	<div class="grid" style="--min: 290px">
		{#each list as p (p.id)}
			{@const tv = p.mode !== 'model' ? trackedView(p) : null}
			<article class="pf-card">
				<a class="body" href="/portfolios/{app.portfolioSlug(p.id)}">
					<div class="spread">
						<h2 class="truncate">{p.name}</h2>
						{#if app.isBenchmark('portfolio', p.id)}<Badge tone="warning">Benchmark</Badge>{/if}
					</div>
					<div class="row" style="--gap: 6px">
						<Badge tone="accent">{MODE_LABEL[p.mode]}</Badge>
						{#if p.allocations.length}<Badge>{p.allocations.length} assets</Badge>{/if}
						{#if p.sourceStrategyId}<Badge>From strategy</Badge>{/if}
					</div>
					{#if tv}
						<div class="value">
							<span class="num big">{fmt.money(tv.summary.totalValue, p.cashCurrency)}</span>
							<span class="num small {fmt.signClass(tv.summary.totalReturn)}"
								>{fmt.money(tv.summary.totalReturn, p.cashCurrency, { signed: true })} ({fmt.pct(
									tv.summary.totalReturnPercent,
									1,
									true
								)})</span
							>
						</div>
					{/if}
					{#if p.allocations.length}
						<div class="bar" aria-hidden="true">
							{#each p.allocations as a, i (a.assetId)}<span style="flex: {a.weight}; background: {colorAt(i)}"></span>{/each}
						</div>
						<ul class="allocs xs">
							{#each p.allocations.slice(0, 4) as a (a.assetId)}
								<li>
									<span class="truncate">{app.assetById.get(a.assetId)?.name ?? 'Unknown'}</span><span class="num muted"
										>{fmt.pct(a.weight, 1)}</span
									>
								</li>
							{/each}
							{#if p.allocations.length > 4}<li class="muted">+{p.allocations.length - 4} more</li>{/if}
						</ul>
					{/if}
				</a>
				<div class="foot">
					<button
						class="icon-btn"
						class:on={app.isBenchmark('portfolio', p.id)}
						title="Benchmark"
						aria-label="Use {p.name} as benchmark"
						aria-pressed={app.isBenchmark('portfolio', p.id)}
						disabled={!p.allocations.length}
						onclick={() => app.toggleBenchmark('portfolio', p.id)}><Icon name="star" size={16} /></button
					>
					<button class="icon-btn" title="Delete" aria-label="Delete {p.name}" onclick={() => remove(p)}
						><Icon name="trash" size={16} /></button
					>
				</div>
			</article>
		{/each}
	</div>
{/if}

<PortfolioForm bind:open={createOpen} onsaved={(p) => goto(`/portfolios/${app.portfolioSlug(p.id)}`)} />

<style>
	.pf-card {
		display: flex;
		flex-direction: column;
		background: var(--surface);
		backdrop-filter: var(--glass-blur);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		transition:
			border-color 0.15s,
			transform 0.15s;
	}
	.pf-card:hover {
		border-color: var(--accent);
	}
	.body {
		display: grid;
		/* Without minmax(0, …) a long, non-wrapping title widens the card past its column. */
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		padding: var(--space-4);
		color: inherit;
		text-decoration: none;
		flex: 1;
	}
	.body:hover {
		text-decoration: none;
	}
	.value {
		display: grid;
	}
	.big {
		font-size: var(--text-xl);
		font-weight: 650;
	}
	.bar {
		display: flex;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		gap: 2px;
	}
	.allocs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 4px;
	}
	.allocs li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		gap: 2px;
		padding: 4px 8px 8px;
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
	.icon-btn:hover:not(:disabled) {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.icon-btn:disabled {
		opacity: 0.3;
	}
	.icon-btn.on {
		color: var(--chart-4);
	}
	.icon-btn.on :global(svg) {
		fill: currentColor;
	}
</style>
