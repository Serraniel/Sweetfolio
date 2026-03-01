<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import { ALL_SCOPES, type SweetfolioScope } from '$lib/io/schema';
	import { streamExport } from '$lib/io/download';

	let {
		open = $bindable(false),
	}: {
		open?: boolean;
	} = $props();

	const scopeLabels: Record<SweetfolioScope, string> = {
		assets: 'Assets',
		portfolios: 'Portfolios',
		strategies: 'Strategies',
		settings: 'Settings',
		currencies: 'Exchange Rates',
		simulations: 'Simulations',
	};

	let selectedScopes: Set<SweetfolioScope> = $state(new Set(ALL_SCOPES));
	let exporting = $state(false);
	let exportPhase: string = $state('');
	let error: string | null = $state(null);

	function toggleScope(scope: SweetfolioScope) {
		const next = new Set(selectedScopes);
		if (next.has(scope)) {
			next.delete(scope);
		} else {
			next.add(scope);
		}
		selectedScopes = next;
	}

	async function handleExport() {
		error = null;
		exporting = true;
		try {
			await streamExport([...selectedScopes], (phase) => {
				exportPhase = phase;
			});
			open = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
		} finally {
			exporting = false;
			exportPhase = '';
		}
	}
</script>

<Modal bind:open title="Export Data">
	<p class="export-description">Select which data to include in the export file.</p>

	<div class="scope-list">
		{#each ALL_SCOPES as scope}
			<label class="scope-item">
				<input
					type="checkbox"
					checked={selectedScopes.has(scope)}
					disabled={exporting}
					onchange={() => toggleScope(scope)}
				/>
				<span>{scopeLabels[scope]}</span>
			</label>
		{/each}
	</div>

	{#if exporting}
		<div class="export-progress">
			<div class="spinner"></div>
			<span>{exportPhase}</span>
		</div>
	{/if}

	{#if error}
		<div class="export-error">{error}</div>
	{/if}

	{#snippet footer()}
		<Button variant="default" onclick={() => open = false} disabled={exporting}>Cancel</Button>
		<Button
			variant="primary"
			onclick={handleExport}
			disabled={exporting || selectedScopes.size === 0}
		>
			{exporting ? 'Exporting...' : 'Export'}
		</Button>
	{/snippet}
</Modal>

<style>
	.export-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.scope-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.scope-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		cursor: pointer;
		padding: var(--spacing-xs) 0;
	}

	.scope-item input[type="checkbox"] {
		accent-color: var(--color-accent);
	}

	.export-progress {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.export-error {
		margin-top: var(--spacing-md);
		font-size: var(--font-size-xs);
		color: var(--color-negative, #e55);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(232, 23, 93, 0.08);
		border: 1px solid rgba(232, 23, 93, 0.2);
		border-radius: var(--radius-sm);
	}
</style>
