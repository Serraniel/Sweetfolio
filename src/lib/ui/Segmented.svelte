<script lang="ts" generics="T extends string">
	let {
		value = $bindable(),
		options,
		label,
		disabled = [],
		size = 'md'
	}: { value: T; options: Array<{ value: T; label: string }>; label: string; disabled?: T[]; size?: 'sm' | 'md' } = $props();
</script>

<div class="seg {size}" role="radiogroup" aria-label={label}>
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === o.value}
			class:active={value === o.value}
			disabled={disabled.includes(o.value)}
			onclick={() => (value = o.value)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		padding: 3px;
		gap: 2px;
		background: var(--surface-2);
		border-radius: 999px;
		max-width: 100%;
		overflow-x: auto;
		scrollbar-width: none;
	}
	button {
		border: none;
		background: transparent;
		color: var(--text-2);
		padding: 6px 12px;
		border-radius: 999px;
		font-size: var(--text-sm);
		font-weight: 550;
		white-space: nowrap;
		min-height: 32px;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.sm button {
		padding: 4px 10px;
		font-size: var(--text-xs);
		min-height: 28px;
	}
	button.active {
		background: var(--surface-solid);
		color: var(--accent);
		box-shadow: var(--shadow-sm);
	}
	button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
</style>
