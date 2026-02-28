<script lang="ts">
	import LogoFlowV1 from '$lib/components/LogoFlowV1.svelte';
	import LogoE2 from '$lib/components/LogoE2.svelte';
	import LogoS1 from '$lib/components/LogoS1.svelte';
	import LogoS2 from '$lib/components/LogoS2.svelte';
	import LogoS3 from '$lib/components/LogoS3.svelte';
	import LogoS4 from '$lib/components/LogoS4.svelte';
	import LogoS5 from '$lib/components/LogoS5.svelte';
	import LogoS6 from '$lib/components/LogoS6.svelte';

	const logos = [
		{ name: 'BASE: V1 (reference)', desc: 'Your liked base. No pink.', component: LogoFlowV1 },
		{ name: 'BASE: E2 (reference)', desc: 'Varying waviness base. No pink.', component: LogoE2 },
		{ name: 'S1: Base + pink S (normal)', desc: 'V1 base + pink strand flowing from upper bundle (right) through gap as S-curve into lower bundle (left).', component: LogoS1 },
		{ name: 'S2: Base + pink S (wide swing)', desc: 'V1 base + pink strand with more pronounced S-curve, wider swing through the gap.', component: LogoS2 },
		{ name: 'S3: Base + pink S (thin/delicate)', desc: 'V1 base + thin, delicate pink strand. Like a single dyed hair.', component: LogoS3 },
		{ name: 'S4: E2 + pink S (normal)', desc: 'E2 waviness base + pink strand flowing through gap.', component: LogoS4 },
		{ name: 'S5: E2 + pink S (wide swing)', desc: 'E2 waviness base + pink strand with stronger S-curve.', component: LogoS5 },
		{ name: 'S6: E2 + pink S (thin/delicate)', desc: 'E2 waviness base + thin, delicate pink strand.', component: LogoS6 },
	];

	const sizes = [32, 64, 128, 256];

	const navSize = [
		{ name: 'S1', component: LogoS1 },
		{ name: 'S2', component: LogoS2 },
		{ name: 'S3', component: LogoS3 },
		{ name: 'S4', component: LogoS4 },
		{ name: 'S5', component: LogoS5 },
		{ name: 'S6', component: LogoS6 },
	];
</script>

<div class="preview-page">
	<h1>Pink S-Strand Variants</h1>
	<p class="subtitle">Pink hair strand weaving from upper bundle (right) through the gap in an S-curve into the lower bundle (left). Three thicknesses on each base.</p>

	<div class="logo-row">
		<div class="logo-info">
			<h2>Nav size comparison (32px)</h2>
			<p>How each variant looks at the actual nav logo size.</p>
		</div>
		<div class="nav-compare">
			{#each navSize as v}
				<div class="nav-cell">
					<v.component size={32} />
					<span class="size-label">{v.name}</span>
				</div>
			{/each}
		</div>
	</div>

	{#each logos as logo}
		<div class="logo-row">
			<div class="logo-info">
				<h2>{logo.name}</h2>
				<p>{logo.desc}</p>
			</div>
			<div class="logo-sizes">
				{#each sizes as s}
					<div class="logo-cell">
						<logo.component size={s} />
						<span class="size-label">{s}px</span>
					</div>
				{/each}
			</div>
		</div>
	{/each}
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
		margin-bottom: 24px;
		background: var(--color-bg-secondary);
	}

	.logo-info {
		margin-bottom: 16px;
	}

	.logo-info h2 {
		font-size: 1.1rem;
		margin-bottom: 4px;
	}

	.logo-info p {
		font-size: 0.85rem;
		color: var(--color-text-muted);
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

	.nav-compare {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
	}

	.nav-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
</style>
