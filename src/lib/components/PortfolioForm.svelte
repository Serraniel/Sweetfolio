<script lang="ts">
	/** Create/edit a portfolio (PM-1, PT-1, PT-7). */
	import { COMMON_CURRENCIES, type Allocation, type Portfolio, type PortfolioMode, type RebalanceFrequency } from '#lib/domain/types.ts';
	import { cleanAllocations, newPortfolio } from '#lib/domain/factories.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import Toggle from '#lib/ui/Toggle.svelte';
	import AllocationEditor from './AllocationEditor.svelte';

	let {
		open = $bindable(false),
		portfolio = null,
		onsaved
	}: { open?: boolean; portfolio?: Portfolio | null; onsaved?: (p: Portfolio) => void } = $props();

	let name = $state('');
	let mode = $state<PortfolioMode>('model');
	let allocations = $state<Allocation[]>([]);
	let rebalance = $state<RebalanceFrequency>('none');
	let trackCash = $state(false);
	let cashCurrency = $state('EUR');
	let benchmark = $state(false);
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		name = portfolio?.name ?? '';
		mode = portfolio?.mode ?? 'model';
		allocations = portfolio ? portfolio.allocations.map((a) => ({ ...a })) : [];
		rebalance = portfolio?.rebalance ?? 'none';
		trackCash = portfolio?.trackCash ?? false;
		cashCurrency = portfolio?.cashCurrency ?? app.settings.mainCurrency;
		benchmark = portfolio ? app.isBenchmark('portfolio', portfolio.id) : false;
	});

	const needsAllocations = $derived(mode !== 'tracked');
	const valid = $derived(name.trim().length > 0 && (!needsAllocations || allocations.some((a) => a.weight > 0)));

	async function save(e?: Event) {
		e?.preventDefault();
		if (!valid) return;
		saving = true;
		const base = portfolio ?? newPortfolio({ name: name.trim() });
		const p: Portfolio = {
			...base,
			name: name.trim(),
			mode,
			allocations: cleanAllocations(allocations),
			rebalance,
			trackCash,
			cashCurrency,
			isBenchmark: false,
			updatedAt: new Date().toISOString()
		};
		await app.savePortfolio(p);
		if (benchmark !== app.isBenchmark('portfolio', p.id)) await app.toggleBenchmark('portfolio', p.id);
		saving = false;
		open = false;
		onsaved?.(p);
	}
</script>

<Dialog bind:open title={portfolio ? 'Edit portfolio' : 'New portfolio'} size="md">
	<form id="pf-form" class="stack" onsubmit={save}>
		<div>
			<label class="label" for="pf-name">Name</label><input
				id="pf-name"
				class="input"
				bind:value={name}
				required
				placeholder="e.g. World 70/30"
			/>
		</div>
		<div>
			<span class="label">Type</span>
			<Segmented
				bind:value={mode}
				label="Portfolio type"
				options={[
					{ value: 'model', label: 'Model' },
					{ value: 'tracked', label: 'Tracked' },
					{ value: 'both', label: 'Model + tracked' }
				]}
			/>
			<p class="hint">
				{mode === 'model'
					? 'Target weights for backtesting and simulation.'
					: mode === 'tracked'
						? 'Record real transactions; holdings and P&L are computed.'
						: 'Target weights and real transactions — enables drift analysis and rebalancing.'}
			</p>
		</div>
		{#if needsAllocations}
			<div>
				<span class="label">Allocation</span>
				<AllocationEditor bind:allocations assets={app.assets} />
			</div>
			<div>
				<label class="label" for="pf-rb">Rebalancing in backtest</label>
				<select id="pf-rb" class="select" bind:value={rebalance}>
					<option value="none">None (buy &amp; hold)</option>
					<option value="monthly">Monthly</option>
					<option value="quarterly">Quarterly</option>
					<option value="annually">Annually</option>
				</select>
			</div>
			<Toggle
				bind:checked={benchmark}
				label="Use as benchmark"
				description="Overlay this portfolio on charts and the efficient frontier."
			/>
		{/if}
		{#if mode !== 'model'}
			<div>
				<label class="label" for="pf-cur">Portfolio currency</label>
				<select id="pf-cur" class="select" bind:value={cashCurrency}
					>{#each [...new Set([cashCurrency, ...COMMON_CURRENCIES])] as c (c)}<option>{c}</option>{/each}</select
				>
			</div>
			<Toggle
				bind:checked={trackCash}
				label="Track cash"
				description="Derive a cash balance from deposits, buys, sells, dividends and fees."
			/>
		{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" type="submit" form="pf-form" disabled={!valid} loading={saving}>{portfolio ? 'Save' : 'Create'}</Button>
	{/snippet}
</Dialog>
