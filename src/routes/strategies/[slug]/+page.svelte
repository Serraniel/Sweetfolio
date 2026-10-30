<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Portfolio, StrategyGroupNode, StrategyNode } from '#lib/domain/types.ts';
	import { newPortfolio } from '#lib/domain/factories.ts';
	import {
		absoluteWeights,
		addChild,
		flattenStrategy,
		generateSleeves,
		normalizeGroup,
		removeNode,
		unbalancedGroups,
		updateNode,
		type SleeveMode
	} from '#lib/core/strategy.ts';
	import { encodeStrategy, shareUrl, toSharedTree } from '#lib/sharing/codec.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { confirmAction } from '#lib/ui/confirm.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import StrategyNodeView from '#lib/components/StrategyNode.svelte';
	import ShareButton from '#lib/components/ShareButton.svelte';
	import TreeChart from '#lib/charts/TreeChart.svelte';

	// Keep showing the same record while its slug changes after a rename.
	let pinned = { slug: '', id: '' };
	const strategy = $derived(
		app.strategyBySlug(page.params.slug ?? '') ??
			(pinned.slug === page.params.slug ? app.strategies.find((x) => x.id === pinned.id) : undefined)
	);
	$effect(() => {
		if (strategy) pinned = { slug: page.params.slug ?? '', id: strategy.id };
	});
	let root = $state.raw<StrategyGroupNode | null>(null);
	let history = $state.raw<StrategyGroupNode[]>([]);
	let future = $state.raw<StrategyGroupNode[]>([]);
	let loadedId = '';
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saved = $state(true);

	$effect(() => {
		if (strategy && strategy.id !== loadedId) {
			loadedId = strategy.id;
			root = strategy.root;
			history = [];
			future = [];
		}
	});

	function commit(next: StrategyGroupNode | null) {
		if (!root || !strategy) return;
		if (!next) {
			notify.error('A strategy needs at least one node.');
			return;
		}
		history = [...history.slice(-49), root];
		future = [];
		root = next;
		scheduleSave();
	}

	function scheduleSave() {
		saved = false;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 600);
	}

	async function save() {
		if (!strategy || !root) return;
		await app.saveStrategy({ ...strategy, root, updatedAt: new Date().toISOString() });
		saved = true;
	}

	function undo() {
		if (!history.length || !root) return;
		future = [root, ...future];
		root = history.at(-1)!;
		history = history.slice(0, -1);
		scheduleSave();
	}
	function redo() {
		if (!future.length || !root) return;
		history = [...history, root];
		root = future[0]!;
		future = future.slice(1);
		scheduleSave();
	}

	const ops = {
		update: (id: string, patch: Partial<StrategyNode>) => root && commit(updateNode(root, id, (n) => ({ ...n, ...patch }) as StrategyNode)),
		remove: (id: string) => root && commit(removeNode(root, id) ?? { ...root, children: [] }),
		addGroup: (parentId: string) =>
			root && commit(addChild(root, parentId, { type: 'group', id: crypto.randomUUID(), label: 'New group', weight: 0, children: [] })),
		addAsset: (parentId: string, assetId: string) =>
			root && commit(addChild(root, parentId, { type: 'leaf', id: crypto.randomUUID(), assetId, weight: 0 })),
		normalize: (id: string) => root && commit(updateNode(root, id, (n) => (n.type === 'group' ? normalizeGroup(n) : n)))
	};

	const absolute = $derived(root ? absoluteWeights(root) : new Map<string, number>());
	const flat = $derived(root ? flattenStrategy(root).sort((a, b) => b.weight - a.weight) : []);
	const flatTotal = $derived(flat.reduce((s, a) => s + a.weight, 0));
	const issues = $derived(root ? unbalancedGroups(root) : []);
	const usedAssets = $derived(new Set(flat.map((a) => a.assetId)));
	let viz = $state<'sunburst' | 'icicle'>('sunburst');
	const nameOf = (id: string) => app.assetById.get(id)?.name ?? 'Unknown';

	// Name editing
	let nameEdit = $state(false);
	let nameDraft = $state('');
	async function saveName() {
		if (!strategy || !nameDraft.trim()) return;
		const id = strategy.id;
		await app.saveStrategy({ ...strategy, name: nameDraft.trim(), root: root ?? strategy.root, updatedAt: new Date().toISOString() });
		nameEdit = false;
		await goto(`/strategies/${app.strategySlug(id)}`, { replace: true });
	}

	// Sleeves (ST-4)
	let sleeveOpen = $state(false);
	let mode = $state<SleeveMode>('top-level');
	const sleeves = $derived(root ? generateSleeves(root, mode, nameOf) : []);
	const generated = $derived(strategy ? app.portfolios.filter((p) => p.sourceStrategyId === strategy.id) : []);
	const outOfSync = (p: Portfolio) => !!strategy && strategy.updatedAt > p.updatedAt;

	async function generate() {
		if (!strategy || !root) return;
		await save();
		const toSave: Portfolio[] = [];
		for (const s of sleeves) {
			if (!s.allocations.length) continue;
			const name = sleeves.length === 1 ? strategy.name : `${strategy.name} – ${s.label}`;
			const existing = generated.find((p) => p.name === name);
			toSave.push(
				existing
					? { ...existing, allocations: s.allocations, updatedAt: new Date().toISOString() }
					: newPortfolio({ name, allocations: s.allocations, sourceStrategyId: strategy.id })
			);
		}
		await app.savePortfolios(toSave);
		const ids = [...new Set([...strategy.generatedPortfolioIds, ...toSave.map((p) => p.id)])];
		await app.saveStrategy({ ...app.strategies.find((x) => x.id === strategy.id)!, generatedPortfolioIds: ids });
		// The strategy save bumps updatedAt; mark the portfolios as synced after it.
		await app.savePortfolios(toSave.map((p) => ({ ...app.portfolioById.get(p.id)!, updatedAt: new Date(Date.now() + 1).toISOString() })));
		sleeveOpen = false;
		notify.success(`${toSave.length} portfolio${toSave.length === 1 ? '' : 's'} generated`);
	}

	async function remove() {
		if (!strategy) return;
		if (
			!(await confirmAction({
				title: 'Delete strategy',
				message: `Delete “${strategy.name}”? Generated portfolios are kept but unlinked.`,
				confirmLabel: 'Delete',
				danger: true
			}))
		)
			return;
		await app.deleteStrategy(strategy.id);
		await goto('/strategies');
	}

	const share = $derived(
		strategy && root && flat.length
			? shareUrl(
					encodeStrategy(
						strategy.name,
						toSharedTree(root, (id) => app.assetById.get(id))
					)
				)
			: ''
	);
</script>

{#if !strategy || !root}
	<PageHeader title="Strategy not found" back={{ href: '/strategies', label: 'Strategies' }} />
	<Card><EmptyState icon="search" title="This strategy does not exist" /></Card>
{:else}
	<PageHeader title={strategy.name} back={{ href: '/strategies', label: 'Strategies' }}>
		{#snippet meta()}
			<Badge tone={saved ? 'neutral' : 'warning'}>{saved ? 'Saved' : 'Saving…'}</Badge>
			{#if issues.length}<Badge tone="warning">{issues.length} unbalanced group{issues.length === 1 ? '' : 's'}</Badge>{/if}
		{/snippet}
		{#snippet actions()}
			<Button
				size="sm"
				icon="edit"
				onclick={() => {
					nameDraft = strategy.name;
					nameEdit = true;
				}}>Rename</Button
			>
			{#if share}<ShareButton url={share} title={strategy.name} />{/if}
			<Button size="sm" variant="primary" icon="portfolio" disabled={!flat.length} onclick={() => (sleeveOpen = true)}
				>Generate portfolios</Button
			>
			<Button size="sm" variant="ghost" icon="trash" aria-label="Delete strategy" onclick={remove} />
		{/snippet}
	</PageHeader>

	<div class="layout">
		<Card title="Allocation tree">
			{#snippet actions()}
				<Button size="sm" variant="ghost" icon="undo" iconOnly aria-label="Undo" disabled={!history.length} onclick={undo} />
				<Button size="sm" variant="ghost" icon="redo" iconOnly aria-label="Redo" disabled={!future.length} onclick={redo} />
				<Button size="sm" onclick={() => root && commit(normalizeGroup(root, true))}>Normalize all</Button>
			{/snippet}
			{#if !app.assets.length}<p class="small muted">Add assets first to build a strategy.</p>{/if}
			<StrategyNodeView node={root} {absolute} {ops} {usedAssets} />
		</Card>
		<div class="stack" style="--gap: 20px">
			<Card title="Visualization">
				{#snippet actions()}<Segmented
						bind:value={viz}
						size="sm"
						label="Chart type"
						options={[
							{ value: 'sunburst', label: 'Sunburst' },
							{ value: 'icicle', label: 'Icicle' }
						]}
					/>{/snippet}
				<TreeChart {root} kind={viz} labelForAsset={nameOf} />
			</Card>
			<Card title="Flattened weights">
				{#if flat.length}
					<table class="table">
						<tbody>
							{#each flat as a (a.assetId)}<tr
									><td><a href="/assets/{app.assetSlug(a.assetId)}">{nameOf(a.assetId)}</a></td><td class="right num"
										>{fmt.pct(a.weight, 2)}</td
									></tr
								>{/each}
						</tbody>
						<tfoot
							><tr><td>Total</td><td class="right num" class:neg={Math.abs(flatTotal - 1) > 1e-6}>{fmt.pct(flatTotal, 2)}</td></tr></tfoot
						>
					</table>
				{:else}<p class="small muted">No assets in the tree yet.</p>{/if}
			</Card>
			{#if generated.length}
				<Card title="Generated portfolios">
					<ul class="gen">
						{#each generated as p (p.id)}
							<li>
								<a href="/portfolios/{app.portfolioSlug(p.id)}" class="truncate">{p.name}</a>{#if outOfSync(p)}<Badge tone="warning"
										>Out of sync</Badge
									>{:else}<Badge>In sync</Badge>{/if}
							</li>
						{/each}
					</ul>
					{#if generated.some(outOfSync)}<Button size="sm" icon="refresh" onclick={() => (sleeveOpen = true)}>Regenerate</Button>{/if}
				</Card>
			{/if}
		</div>
	</div>

	<Dialog bind:open={sleeveOpen} title="Generate model portfolios">
		<div class="stack">
			<Segmented
				bind:value={mode}
				label="Sleeve mode"
				options={[
					{ value: 'top-level', label: 'Per top-level group' },
					{ value: 'per-branch', label: 'Per branch' },
					{ value: 'flat', label: 'One portfolio' }
				]}
			/>
			<p class="hint">
				{mode === 'flat'
					? 'One portfolio with all assets at their absolute weights.'
					: mode === 'top-level'
						? 'One portfolio per top-level group (weights normalized within the group).'
						: 'One portfolio per group that directly contains assets.'}
			</p>
			<ul class="preview">
				{#each sleeves as s (s.nodeId)}
					<li>
						<b class="small">{sleeves.length === 1 ? strategy.name : `${strategy.name} – ${s.label}`}</b><span class="xs muted"
							>{s.allocations.map((a) => `${nameOf(a.assetId)} ${fmt.pct(a.weight, 0)}`).join(' · ')}</span
						>
					</li>
				{/each}
			</ul>
			<p class="xs muted">Existing generated portfolios with the same name are updated.</p>
		</div>
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (sleeveOpen = false)}>Cancel</Button>
			<Button variant="primary" onclick={generate}>Generate {sleeves.length}</Button>
		{/snippet}
	</Dialog>

	<Dialog bind:open={nameEdit} title="Rename strategy" size="sm">
		<input class="input" bind:value={nameDraft} aria-label="Strategy name" />
		{#snippet footer()}
			<Button variant="ghost" onclick={() => (nameEdit = false)}>Cancel</Button>
			<Button variant="primary" onclick={saveName} disabled={!nameDraft.trim()}>Save</Button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.layout {
		display: grid;
		gap: var(--space-4);
		align-items: start;
	}
	@media (min-width: 1100px) {
		.layout {
			grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		}
	}
	.gen,
	.preview {
		list-style: none;
		margin: 0 0 12px;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.gen li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: center;
	}
	.preview li {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}
</style>
