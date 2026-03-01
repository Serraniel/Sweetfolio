<script lang="ts">
	import Card from '$lib/components/shared/Card.svelte';
	import licenseText from '../../../LICENSE?raw';
</script>

<svelte:head>
	<title>License – Sweetfolio</title>
</svelte:head>

<div class="license-page">
	<header class="page-header">
		<h1>License</h1>
		<p class="page-subtitle">European Union Public Licence v. 1.2</p>
	</header>

	<Card padding="lg">
		<pre class="license-text">{licenseText}</pre>
	</Card>
</div>

<style>
	.license-page {
		max-width: 800px;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.page-header h1 {
		margin-bottom: var(--spacing-xs);
	}

	.page-subtitle {
		color: var(--color-text-muted);
		font-size: var(--font-size-base);
	}

	.license-text {
		font-size: var(--font-size-sm);
		line-height: 1.6;
		white-space: pre-wrap;
		word-wrap: break-word;
		margin: 0;
		font-family: var(--font-sans, inherit);
	}
</style>
