<script lang="ts">
	import LogoS1 from '$lib/components/LogoS1.svelte';

	const sizes = [16, 32, 64, 128, 256, 512];
</script>

<div class="preview-page">
	<h1>Sweetfolio Logo</h1>
	<p class="subtitle">Flowing twin-tail strands with pink S-curve accent.</p>

	<div class="logo-row">
		<div class="logo-sizes">
			{#each sizes as s}
				<div class="logo-cell">
					<LogoS1 size={s} />
					<span class="size-label">{s}px</span>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.preview-page {
		padding: 32px;
		max-width: 1200px;
		margin: 0 auto;
	}

	h1 {
		font-size: 2rem;
		margin-bottom: 4px;
	}

	.subtitle {
		color: var(--color-text-muted);
		margin-bottom: 32px;
	}

	.logo-row {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 24px;
		background: var(--color-bg-secondary);
	}

	.logo-sizes {
		display: flex;
		align-items: flex-end;
		gap: 32px;
		flex-wrap: wrap;
	}

	.logo-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.size-label {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		font-family: var(--font-mono);
	}
</style>
