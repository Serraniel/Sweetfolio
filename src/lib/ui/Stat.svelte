<script lang="ts">
	let { label, value, sub, tone = '' }: { label: string; value: string; sub?: string; tone?: string } = $props();
</script>

<div class="stat">
	<span class="label-text">{label}</span>
	<span class="value num {tone}">{value}</span>
	{#if sub}<span class="sub num {tone}">{sub}</span>{/if}
</div>

<style>
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.label-text {
		font-size: var(--text-xs);
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}
	.value {
		font-size: var(--text-xl);
		font-weight: 650;
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: var(--text-sm);
		font-weight: 550;
	}
</style>
