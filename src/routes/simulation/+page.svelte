<script lang="ts">
	import type { Asset } from '#lib/domain/types.ts';
	import { newPortfolio, cleanAllocations } from '#lib/domain/factories.ts';
	import { bestIndex, dominatingIndices, seriesStats, validateConstraints, weightsAt } from '#lib/core/montecarlo.ts';
	import { daysBetween } from '#lib/core/dates.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { sim } from '#lib/state/simulation.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { runMonteCarlo } from '#lib/workers/client.ts';
	import * as fmt from '#lib/format.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Toggle from '#lib/ui/Toggle.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import Stat from '#lib/ui/Stat.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import AssetPicker from '#lib/components/AssetPicker.svelte';
	import Frontier from '#lib/charts/Frontier.svelte';
	import { colorAt } from '#lib/charts/palette.ts';

	const eligible = $derived(app.assets.filter((a) => a.prices.length > 20));
	const warnings = $derived(
		new Map(
			eligible
				.filter((a) => app.converted(a).status === 'missing')
				.map((a) => [a.id, `No ${a.currency}→${app.settings.mainCurrency} rates — unconverted`])
		)
	);
	const selectedAssets = $derived(sim.assetIds.map((id) => app.assetById.get(id)).filter((a): a is Asset => !!a));
	const parsed = $derived(sim.parsedConstraints());
	const validation = $derived(
		sim.useConstraints
			? validateConstraints(
					parsed.constraints,
					parsed,
					selectedAssets.map((a) => a.name)
				)
			: { ok: true, errors: [] }
	);
	const canRun = $derived(selectedAssets.length >= 2 && sim.count >= 100 && sim.count <= 100_000 && validation.ok);
	$effect(() => {
		for (const id of sim.assetIds) if (!sim.constraints[id]) sim.constraints[id] = { min: '', max: '' };
	});
	let colorBySharpe = $state(true);
	let showDominating = $state(false);
	let onlyDominating = $state(false);

	function inputs(ids: string[]) {
		return ids.map((id) => {
			const a = app.assetById.get(id)!;
			return { id, prices: app.converted(a).prices.map((p) => ({ date: p.date, close: p.close })) };
		});
	}

	async function run() {
		if (!canRun) return;
		sim.selected = null;
		sim.progress = { done: 0, total: sim.count };
		sim.riskFreeRate = app.riskFreeRate;
		const ids = selectedAssets.map((a) => a.id);
		sim.run = runMonteCarlo(
			{
				assets: inputs(ids),
				count: sim.count,
				riskFreeRate: app.riskFreeRate,
				constraints: parsed.constraints,
				minAssets: parsed.minAssets,
				maxAssets: parsed.maxAssets
			},
			(done, total) => (sim.progress = { done, total })
		);
		try {
			sim.result = await sim.run.promise;
			sim.selected = bestIndex(sim.result, 'sharpe');
		} catch (err) {
			if (!(err instanceof DOMException && err.name === 'AbortError'))
				notify.error(`Simulation failed: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			sim.progress = null;
			sim.run = null;
		}
	}

	const result = $derived(sim.result);
	const resultAssets = $derived(result ? result.assetIds.map((id) => app.assetById.get(id)) : []);

	// Benchmark measured over the same window as the simulation (MC-6).
	const benchmark = $derived.by(() => {
		const b = app.benchmarkResolved;
		if (!b || !result) return null;
		const series = app.benchmarkSeries();
		const stats = series ? seriesStats(series, result.window, sim.riskFreeRate) : null;
		return stats ? { label: b.name, ...stats } : null;
	});
	const windowYears = $derived(result ? daysBetween(result.window.start, result.window.end) / 365.25 : 0);
	const limitingAsset = $derived(
		resultAssets
			.filter((a): a is Asset => !!a)
			.reduce<Asset | null>((m, a) => (!m || (a.prices[0]?.date ?? '') > (m.prices[0]?.date ?? '') ? a : m), null)
	);
	const dominating = $derived(result && benchmark && showDominating ? new Set(dominatingIndices(result, benchmark)) : null);
	const markers = $derived([
		...(result?.assetStats ?? []).map((s, i) => ({
			label: app.assetById.get(s.id)?.name ?? s.id,
			volatility: s.volatility,
			annualizedReturn: s.annualizedReturn,
			color: colorAt(i),
			kind: 'asset' as const
		})),
		...(benchmark
			? [
					{
						label: benchmark.label,
						volatility: benchmark.volatility,
						annualizedReturn: benchmark.annualizedReturn,
						kind: 'benchmark' as const
					}
				]
			: [])
	]);

	const inspected = $derived(
		result && sim.selected !== null && sim.selected < result.count
			? {
					i: sim.selected,
					weights: weightsAt(result, sim.selected),
					ret: result.returns[sim.selected]!,
					vol: result.volatilities[sim.selected]!,
					sharpe: result.sharpes[sim.selected]!
				}
			: null
	);

	async function saveAsPortfolio() {
		if (!inspected) return;
		const allocations = cleanAllocations(
			Object.entries(inspected.weights).map(([assetId, weight]) => ({ assetId, weight: Math.round(weight * 1000) / 1000 }))
		);
		const names = allocations
			.sort((a, b) => b.weight - a.weight)
			.map((a) => `${app.assetById.get(a.assetId)?.name.split(' ').slice(0, 2).join(' ')} ${Math.round(a.weight * 100)}%`)
			.join(' / ');
		const p = newPortfolio({ name: `Sim: ${names}`.slice(0, 60), allocations });
		await app.savePortfolio(p);
		notify.success(`Saved “${p.name}”`, { label: 'Open', href: `/portfolios/${app.portfolioSlug(p.id)}` });
	}

	const PRESETS = [1_000, 10_000, 50_000, 100_000];
</script>

<PageHeader title="Monte Carlo simulation" subtitle="Generate random portfolios and explore the efficient frontier." />

<div class="layout">
	<Card title="Configuration">
		<div class="stack">
			<div>
				<label class="label" for="mc-count">Number of portfolios</label>
				<input id="mc-count" class="input num" type="number" min="100" max="100000" step="100" bind:value={sim.count} />
				<div class="row presets">
					{#each PRESETS as p (p)}<button class:active={sim.count === p} onclick={() => (sim.count = p)}>{fmt.compact(p)}</button>{/each}
				</div>
			</div>
			<div>
				<span class="label">Assets (at least 2)</span>
				{#if eligible.length < 2}<p class="small muted">
						You need at least two assets with price history. <a href="/assets">Add assets</a>
					</p>{:else}<AssetPicker assets={eligible} bind:selected={sim.assetIds} {warnings} />{/if}
			</div>
			<div class="constraints">
				<Toggle
					bind:checked={sim.useConstraints}
					label="Weight constraints"
					description="Limit weights for all assets or per asset (e.g. equity ≥ 40 %, gold ≤ 15 %) and the number of assets held."
				/>
				{#if sim.useConstraints && selectedAssets.length}
					<div class="c-table">
						<span class="xs muted">All assets</span><span class="xs muted">Min %</span><span class="xs muted">Max %</span>
						<span class="small">Weight per asset</span>
						<input
							class="input num"
							inputmode="decimal"
							placeholder="0"
							bind:value={sim.limits.minWeight}
							aria-label="Minimum weight per held asset"
						/>
						<input
							class="input num"
							inputmode="decimal"
							placeholder="100"
							bind:value={sim.limits.maxWeight}
							aria-label="Maximum weight per asset"
						/>
						<span class="small">Number of assets</span>
						<input
							class="input num"
							inputmode="numeric"
							placeholder="1"
							bind:value={sim.limits.minAssets}
							aria-label="Minimum number of assets"
						/>
						<input
							class="input num"
							inputmode="numeric"
							placeholder={String(selectedAssets.length)}
							bind:value={sim.limits.maxAssets}
							aria-label="Maximum number of assets"
						/>
					</div>
					<p class="xs muted hint">
						The minimum applies to assets that are held: each weight is 0 % or at least that. Entries per asset override it; a per-asset
						minimum above 0 % means the asset is always held.
					</p>
					<div class="c-table">
						<span class="xs muted">Per asset</span><span class="xs muted">Min %</span><span class="xs muted">Max %</span>
						{#each selectedAssets as a (a.id)}
							{#if sim.constraints[a.id]}
								<span class="truncate small">{a.name}</span>
								<input
									class="input num"
									inputmode="decimal"
									placeholder={sim.limits.minWeight.trim() || '0'}
									bind:value={sim.constraints[a.id]!.min}
									aria-label="Minimum weight of {a.name}"
								/>
								<input
									class="input num"
									inputmode="decimal"
									placeholder={sim.limits.maxWeight.trim() || '100'}
									bind:value={sim.constraints[a.id]!.max}
									aria-label="Maximum weight of {a.name}"
								/>
							{/if}
						{/each}
					</div>
					{#each validation.errors as e (e)}<p class="error-text">{e}</p>{/each}
				{/if}
			</div>
			{#if sim.progress}
				<div class="stack" style="--gap: 6px">
					<Progress value={sim.progress.done} max={sim.progress.total} label="Simulation progress" />
					<div class="spread small">
						<span class="muted num">{fmt.num(sim.progress.done, 0)} / {fmt.num(sim.progress.total, 0)}</span><Button
							size="sm"
							variant="ghost"
							onclick={() => sim.run?.cancel()}>Cancel</Button
						>
					</div>
				</div>
			{:else}
				<Button variant="primary" icon="simulation" disabled={!canRun} onclick={run}>Run simulation</Button>
			{/if}
			<p class="xs muted">
				Returns and risk are estimated on the assets' common history. Risk-free rate {fmt.num(app.settings.riskFreeRate, 2, 0)} %, values in {app
					.settings.mainCurrency}.
			</p>
		</div>
	</Card>

	<div class="stack" style="--gap: 20px">
		{#if !result}
			<Card
				><EmptyState icon="simulation" title="No simulation yet">Pick assets and run a simulation to see the efficient frontier.</EmptyState
				></Card
			>
		{:else}
			{#if windowYears < 3}
				<p class="notice small">
					Estimates use only {fmt.num(windowYears, 1)} years of common history{#if limitingAsset}
						(limited by {limitingAsset.name}){/if}. Results from short periods are unreliable.
				</p>
			{/if}
			<Card
				title="Efficient frontier"
				subtitle="{fmt.num(result.count, 0)} portfolios · estimated from {fmt.date(result.window.start)} to {fmt.date(
					result.window.end
				)}{result.frontierApproximate ? ' · frontier approximated (asset counts / held minimums)' : ''}"
			>
				{#snippet actions()}
					<label class="row xs"><input type="checkbox" bind:checked={colorBySharpe} />Color by Sharpe</label>
					{#if benchmark}<label class="row xs"><input type="checkbox" bind:checked={showDominating} />Beats benchmark</label
						>{#if showDominating}<label class="row xs"><input type="checkbox" bind:checked={onlyDominating} />Only these</label>{/if}{/if}
				{/snippet}
				<Frontier
					{result}
					{colorBySharpe}
					{markers}
					{dominating}
					onlyDominating={onlyDominating && !!dominating}
					selected={sim.selected}
					onselect={(i) => (sim.selected = i)}
				/>
				<div class="row picks">
					<Button size="sm" onclick={() => (sim.selected = bestIndex(result, 'sharpe'))}>Max Sharpe</Button>
					<Button size="sm" onclick={() => (sim.selected = bestIndex(result, 'minVol'))}>Min volatility</Button>
					<Button size="sm" onclick={() => (sim.selected = bestIndex(result, 'maxReturn'))}>Max return</Button>
				</div>
			</Card>
			{#if inspected}
				<Card title="Portfolio inspector">
					{#snippet actions()}<Button size="sm" variant="primary" icon="plus" onclick={saveAsPortfolio}>Save as portfolio</Button>{/snippet}
					<div class="stats">
						<Stat label="Return p.a." value={fmt.pct(inspected.ret)} tone={fmt.signClass(inspected.ret)} />
						<Stat label="Volatility" value={fmt.pct(inspected.vol)} />
						<Stat label="Sharpe" value={fmt.num(inspected.sharpe)} />
					</div>
					<ul class="weights">
						{#each resultAssets as a, i (result.assetIds[i])}
							{@const w = inspected.weights[result.assetIds[i]!] ?? 0}
							<li class:zero={w === 0}>
								<span class="truncate small">{a?.name ?? 'Deleted asset'}</span>
								<span class="bar"><span style="width: {w * 100}%; background: {colorAt(i)}"></span></span>
								<span class="num small">{fmt.pct(w, 1)}</span>
							</li>
						{/each}
					</ul>
				</Card>
			{/if}
		{/if}
	</div>
</div>

<style>
	.notice {
		padding: 10px 14px;
		border-radius: var(--radius);
		background: var(--warning-soft);
		color: var(--warning);
	}
	.layout {
		display: grid;
		gap: var(--space-4);
		align-items: start;
	}
	@media (min-width: 1100px) {
		.layout {
			grid-template-columns: 360px minmax(0, 1fr);
		}
	}
	.presets {
		margin-top: 8px;
		--gap: 6px;
	}
	.presets button {
		border: 1px solid var(--border-strong);
		background: var(--surface-solid);
		border-radius: 999px;
		padding: 4px 10px;
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.presets button.active {
		border-color: var(--accent);
		color: var(--accent);
	}
	.c-table {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 72px 72px;
		gap: 6px 8px;
		align-items: center;
		margin-top: 8px;
	}
	.hint {
		margin: 6px 0 0;
	}
	.c-table .input {
		min-height: 32px;
		padding: 4px 8px;
		text-align: right;
	}
	.picks {
		margin-top: var(--space-3);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.weights {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.weights li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(60px, 2fr) 56px;
		gap: 10px;
		align-items: center;
	}
	.weights li.zero {
		opacity: 0.45;
	}
	.bar {
		height: 8px;
		border-radius: 4px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
	}
	.weights .num {
		text-align: right;
	}
</style>
