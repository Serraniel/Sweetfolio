<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import { generateSleeves, type Sleeve, type SleeveMode } from '$lib/engine/sleeves';
	import { detectTreeShape } from '$lib/engine/strategy';
	import type { Strategy } from '$lib/types';

	let {
		strategy,
		assetNames = {},
		open = $bindable(false),
		ongenerate,
	}: {
		strategy: Strategy;
		assetNames?: Record<string, string>;
		open?: boolean;
		ongenerate: (sleeves: Sleeve[], mode: SleeveMode) => void;
	} = $props();

	let selectedMode: SleeveMode = $state('top-level');

	const treeShape = $derived(detectTreeShape(strategy.root));

	const modes: Array<{ value: SleeveMode; label: string; description: string }> = [
		{
			value: 'top-level',
			label: 'Top-level buckets',
			description: 'One portfolio per top-level group (e.g. Core, Satellite)',
		},
		{
			value: 'per-branch',
			label: 'One portfolio per branch',
			description: 'One portfolio per terminal group (e.g. Core, China, Crypto)',
		},
		{
			value: 'flat',
			label: 'Single flat portfolio',
			description: 'All assets combined into one portfolio',
		},
	];

	const previews = $derived(
		Object.fromEntries(
			modes.map((m) => {
				const sleeves = generateSleeves(strategy.root, m.value);
				return [m.value, sleeves];
			}),
		) as Record<SleeveMode, Sleeve[]>,
	);

	function resolveLabel(sleeve: Sleeve): string {
		return assetNames[sleeve.label] ?? sleeve.label;
	}

	function handleGenerate() {
		const sleeves = generateSleeves(strategy.root, selectedMode);
		ongenerate(sleeves, selectedMode);
		open = false;
	}
</script>

<Modal bind:open={open} title="Generate Portfolios">
	{#if treeShape === 'mixed'}
		<p class="shape-hint">
			This strategy has a mixed tree shape. Some modes may produce unexpected groupings.
		</p>
	{/if}

	<fieldset class="mode-group">
		<legend class="mode-legend">Select generation mode</legend>
		{#each modes as mode}
			<label class="mode-option" class:selected={selectedMode === mode.value}>
				<input
					type="radio"
					name="sleeve-mode"
					value={mode.value}
					bind:group={selectedMode}
				/>
				<div class="mode-content">
					<span class="mode-label">{mode.label}</span>
					<span class="mode-description">{mode.description}</span>
					<div class="mode-preview">
						{#each previews[mode.value] as sleeve}
							<span class="preview-tag">
								{resolveLabel(sleeve)}
								<span class="preview-count">({sleeve.allocations.length} {sleeve.allocations.length === 1 ? 'asset' : 'assets'})</span>
							</span>
						{/each}
					</div>
				</div>
			</label>
		{/each}
	</fieldset>

	<p class="feedback-link">
		Missing an option? <a href="https://github.com/nicosskyline/Sweetfolio/discussions" target="_blank" rel="noopener noreferrer">Leave feedback on GitHub</a>
	</p>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => open = false}>Cancel</Button>
		<Button variant="primary" onclick={handleGenerate}>Generate</Button>
	{/snippet}
</Modal>

<style>
	.shape-hint {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		background: var(--color-bg-tertiary);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-sm);
		margin-bottom: var(--spacing-md);
	}

	.mode-group {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.mode-legend {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-sm);
	}

	.mode-option {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: border-color var(--transition-fast), background-color var(--transition-fast);
	}

	.mode-option:hover {
		border-color: var(--color-text-muted);
	}

	.mode-option.selected {
		border-color: var(--color-accent);
		background: rgba(141, 208, 196, 0.06);
	}

	.mode-option input[type='radio'] {
		margin-top: 2px;
		accent-color: var(--color-accent);
	}

	.mode-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		flex: 1;
		min-width: 0;
	}

	.mode-label {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.mode-description {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.mode-preview {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		margin-top: var(--spacing-xs);
	}

	.preview-tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: var(--font-size-xs);
		background: var(--color-bg-tertiary);
		padding: 2px 8px;
		border-radius: 999px;
		color: var(--color-text-secondary);
	}

	.preview-count {
		color: var(--color-text-muted);
	}

	.feedback-link {
		margin-top: var(--spacing-lg);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-align: center;
	}

	.feedback-link a {
		color: var(--color-accent);
	}

	.feedback-link a:hover {
		text-decoration: underline;
	}
</style>
