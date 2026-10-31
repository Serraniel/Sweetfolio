<script lang="ts">
	import licenseText from '../../../LICENSE?raw';
	import PageHeader from '#lib/ui/PageHeader.svelte';
	import Card from '#lib/ui/Card.svelte';
</script>

<PageHeader title="License" subtitle="European Union Public Licence v1.2" />
<Card><pre>{licenseText}</pre></Card>

<style>
	pre {
		white-space: pre-wrap;
		font-size: var(--text-xs);
		margin: 0;
		font-family: var(--mono);
	}
</style>
