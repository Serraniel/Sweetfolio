<script lang="ts">
	let {
		accept = '.csv',
		onfiles
	}: {
		accept?: string;
		onfiles: (files: FileList) => void;
	} = $props();

	let dragging = $state(false);
	let inputRef: HTMLInputElement | undefined = $state();

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragging = true;
	}

	function handleDragLeave() {
		dragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (e.dataTransfer?.files?.length) {
			onfiles(e.dataTransfer.files);
		}
	}

	function handleClick() {
		inputRef?.click();
	}

	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.length) {
			onfiles(input.files);
			input.value = '';
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="dropzone"
	class:dragging
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onclick={handleClick}
	onkeydown={(e) => e.key === 'Enter' && handleClick()}
	role="button"
	tabindex="0"
>
	<input
		bind:this={inputRef}
		type="file"
		{accept}
		multiple
		oninput={handleInput}
		class="sr-only"
	/>

	<div class="dropzone-content">
		<svg class="dropzone-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
			<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
			<polyline points="17 8 12 3 7 8"/>
			<line x1="12" y1="3" x2="12" y2="15"/>
		</svg>
		<p class="dropzone-text">Drop CSV files here or click to browse</p>
		<p class="dropzone-hint">Supports historical price data in CSV format</p>
	</div>
</div>

<style>
	.dropzone {
		border: 2px dashed var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-2xl) var(--spacing-lg);
		text-align: center;
		cursor: pointer;
		transition: border-color var(--transition-fast), background-color var(--transition-fast);
	}

	.dropzone:hover,
	.dropzone:focus-visible {
		border-color: var(--color-accent);
		background: rgba(141, 208, 196, 0.05);
	}

	.dropzone.dragging {
		border-color: var(--color-accent);
		background: rgba(141, 208, 196, 0.1);
		border-style: solid;
	}

	.dropzone-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-sm);
		pointer-events: none;
	}

	.dropzone-icon {
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.dragging .dropzone-icon {
		color: var(--color-accent);
	}

	.dropzone-text {
		font-size: var(--font-size-base);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.dropzone-hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}
</style>
