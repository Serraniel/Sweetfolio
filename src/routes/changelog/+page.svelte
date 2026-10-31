<script lang="ts">
	import changelog from '../../../CHANGELOG.md?raw';
	import { parseChangelog, render } from '#lib/markdown.ts';
	import * as fmt from '#lib/format.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
	import Badge from '#lib/ui/Badge.svelte';

	const releases = parseChangelog(changelog);
</script>

<PageHeader title="Changelog" subtitle="You're running v{__APP_VERSION__}" />

<div class="layout">
	<nav class="versions" aria-label="Versions">
		{#each releases as r (r.version)}<a href="#v{r.version}">v{r.version}</a>{/each}
	</nav>
	<div class="stack" style="--gap: 16px">
		{#each releases as r (r.version)}
			<Card>
				<article id="v{r.version}" class="release">
					<header class="row">
						<h2>v{r.version}</h2>
						{#if r.date}<span class="muted small">{fmt.date(r.date)}</span>{/if}{#if r.version === __APP_VERSION__}<Badge tone="accent"
								>Current</Badge
							>{/if}
					</header>
					<div class="md">{@html render(r.body)}</div>
				</article>
			</Card>
		{/each}
	</div>
</div>

<style>
	.layout {
		display: grid;
		gap: var(--space-4);
	}
	.versions {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.versions a {
		flex-shrink: 0;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--surface-2);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	@media (min-width: 1000px) {
		.layout {
			grid-template-columns: 140px minmax(0, 1fr);
			align-items: start;
		}
		.versions {
			position: sticky;
			top: var(--space-6);
			flex-direction: column;
			max-height: 80dvh;
			overflow-y: auto;
		}
		.versions a {
			background: none;
		}
	}
	.release {
		scroll-margin-top: 80px;
	}
	.md :global(h5) {
		font-size: var(--text-sm);
		margin: var(--space-3) 0 var(--space-1);
		color: var(--accent);
	}
	.md :global(ul) {
		margin: 0;
		padding-left: 20px;
		font-size: var(--text-sm);
	}
	.md :global(li) {
		margin: 2px 0;
		overflow-wrap: anywhere;
	}
</style>
