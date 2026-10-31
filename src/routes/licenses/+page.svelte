<script lang="ts">
	import notices from '../../../THIRD_PARTY_NOTICES.md?raw';
	import { render } from '#lib/markdown.ts';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
</script>

<PageHeader title="Third-party notices" subtitle="Open-source software shipped with Sweetfolio" />
<Card><div class="md">{@html render(notices)}</div></Card>

<style>
	.md :global(h3) {
		margin-top: var(--space-4);
		font-size: var(--text-base);
	}
	.md :global(ul) {
		padding-left: 20px;
		font-size: var(--text-sm);
	}
	.md :global(pre),
	.md :global(p) {
		font-size: var(--text-sm);
	}
</style>
