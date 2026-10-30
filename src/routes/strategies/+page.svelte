<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Strategy } from '#lib/domain/types.ts';
	import { newStrategy } from '#lib/domain/factories.ts';
	import { flattenStrategy, leafCount, maxDepth } from '#lib/core/strategy.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import { notify } from '#lib/state/toasts.svelte.ts';
	import { confirmAction } from '#lib/ui/confirm.svelte.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { colorAt } from '#lib/charts/palette.ts';

	let open = $state(false);
	let name = $state('');

	async function create(e?: Event) {
		e?.preventDefault();
		if (!name.trim()) return;
		const s = newStrategy(name.trim());
		await app.saveStrategy(s);
		open = false;
		name = '';
		await goto(`/strategies/${app.strategySlug(s.id)}`);
	}

	async function remove(s: Strategy) {
		if (
			!(await confirmAction({
				title: 'Delete strategy',
				message: `Delete “${s.name}”? Generated portfolios are kept but unlinked.`,
				confirmLabel: 'Delete',
				danger: true
			}))
		)
			return;
		await app.deleteStrategy(s.id);
		notify.show(`Deleted “${s.name}”`);
	}
</script>

<PageHeader title="Strategies" subtitle="Hierarchical allocation plans — why you hold what you hold.">
	{#snippet actions()}<Button variant="primary" icon="plus" onclick={() => (open = true)}>New strategy</Button>{/snippet}
</PageHeader>

{#if app.strategies.length === 0}
	<Card>
		<EmptyState icon="strategy" title="No strategies yet">
			Group your assets into a tree (e.g. Equity › Developed / Emerging, Bonds, Gold) and generate model portfolios from it.
			{#snippet actions()}<Button variant="primary" icon="plus" onclick={() => (open = true)}>New strategy</Button>{/snippet}
		</EmptyState>
	</Card>
{:else}
	<div class="grid" style="--min: 280px">
		{#each app.strategies as s (s.id)}
			{@const flat = flattenStrategy(s.root)}
			<article class="card">
				<a href="/strategies/{app.strategySlug(s.id)}" class="body">
					<h2 class="truncate">{s.name}</h2>
					<div class="row" style="--gap: 6px">
						<Badge tone="accent">{leafCount(s.root)} assets</Badge>
						<Badge>{maxDepth(s.root)} levels</Badge>
						{#if s.generatedPortfolioIds.length}<Badge>{s.generatedPortfolioIds.length} portfolios</Badge>{/if}
					</div>
					{#if flat.length}<div class="bar">
							{#each flat as a, i (a.assetId)}<span style="flex: {a.weight}; background: {colorAt(i)}"></span>{/each}
						</div>{/if}
				</a>
				<div class="foot"><button aria-label="Delete {s.name}" onclick={() => remove(s)}><Icon name="trash" size={16} /></button></div>
			</article>
		{/each}
	</div>
{/if}

<Dialog bind:open title="New strategy" size="sm">
	<form id="st-new" onsubmit={create}>
		<label class="label" for="st-name">Name</label>
		<input id="st-name" class="input" bind:value={name} placeholder="e.g. Core-satellite" required />
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" type="submit" form="st-new" disabled={!name.trim()}>Create</Button>
	{/snippet}
</Dialog>

<style>
	.card {
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
	}
	.card:hover {
		border-color: var(--accent);
	}
	.body {
		display: grid;
		gap: 12px;
		padding: var(--space-4);
		color: inherit;
		text-decoration: none;
	}
	.bar {
		display: flex;
		gap: 2px;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		padding: 0 8px 8px;
	}
	.foot button {
		border: none;
		background: none;
		color: var(--muted);
		padding: 8px;
		display: grid;
	}
</style>
