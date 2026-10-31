<script lang="ts">
	let { value, max = 1, label }: { value: number; max?: number; label?: string } = $props();
	const pct = $derived(max > 0 ? Math.min(100, (value / max) * 100) : 0);
</script>

<div class="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100" aria-label={label}>
	<div class="bar" style="width: {pct}%"></div>
</div>

<style>
	.progress {
		height: 6px;
		border-radius: 999px;
		background: var(--surface-3);
		overflow: hidden;
	}
	.bar {
		height: 100%;
		background: linear-gradient(90deg, var(--deep-teal), var(--miku));
		border-radius: inherit;
		transition: width 0.2s var(--ease);
	}
</style>
