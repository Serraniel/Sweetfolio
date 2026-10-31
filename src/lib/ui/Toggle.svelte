<script lang="ts">
	let {
		checked = $bindable(false),
		label,
		description,
		onchange,
		disabled = false
	}: { checked?: boolean; label: string; description?: string; onchange?: (v: boolean) => void; disabled?: boolean } = $props();
	const id = `tg-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="toggle-row">
	<div class="text">
		<label for={id} class="name">{label}</label>
		{#if description}<p class="hint">{description}</p>{/if}
	</div>
	<input {id} type="checkbox" role="switch" class="switch" bind:checked {disabled} onchange={() => onchange?.(checked)} />
</div>

<style>
	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-2) 0;
	}
	.name {
		font-weight: 550;
	}
	.switch {
		appearance: none;
		flex-shrink: 0;
		width: 44px;
		height: 26px;
		border-radius: 999px;
		background: var(--surface-3);
		position: relative;
		cursor: pointer;
		transition: background 0.2s var(--ease);
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #fff;
		box-shadow: var(--shadow-sm);
		transition: transform 0.2s var(--ease);
	}
	.switch:checked {
		background: var(--accent);
	}
	.switch:checked::after {
		transform: translateX(18px);
	}
</style>
