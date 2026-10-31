<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';

	let {
		accept = '.csv,text/csv',
		multiple = true,
		label = 'Drop CSV files here or tap to choose',
		hint,
		onfiles
	}: { accept?: string; multiple?: boolean; label?: string; hint?: string; onfiles: (files: File[]) => void } = $props();
	let over = $state(false);
	let input: HTMLInputElement | undefined = $state();
</script>

<label
	class="drop"
	class:over
	ondragover={(e) => {
		e.preventDefault();
		over = true;
	}}
	ondragleave={() => (over = false)}
	ondrop={(e) => {
		e.preventDefault();
		over = false;
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length) onfiles(multiple ? files : files.slice(0, 1));
	}}
>
	<input
		bind:this={input}
		type="file"
		{accept}
		{multiple}
		class="sr-only"
		onchange={() => {
			const files = Array.from(input?.files ?? []);
			if (files.length) onfiles(files);
			if (input) input.value = '';
		}}
	/>
	<Icon name="upload" size={22} />
	<span class="small strong">{label}</span>
	{#if hint}<span class="xs muted">{hint}</span>{/if}
</label>

<style>
	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: var(--space-5) var(--space-4);
		border: 2px dashed var(--border-strong);
		border-radius: var(--radius);
		color: var(--text-2);
		text-align: center;
		cursor: pointer;
		transition:
			border-color 0.15s,
			background 0.15s;
	}
	.drop:hover,
	.over {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.drop:focus-within {
		outline: 2px solid var(--focus);
	}
	.strong {
		font-weight: 600;
	}
</style>
