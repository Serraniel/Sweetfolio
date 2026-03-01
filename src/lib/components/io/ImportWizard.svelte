<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import { ALL_SCOPES, type SweetfolioScope, type SweetfolioExport } from '$lib/io/schema';
	import { parseImportFile } from '$lib/io/import';
	import { detectConflicts, type ConflictReport, type ConflictItem, type SettingConflict } from '$lib/io/conflicts';
	import { applyImport } from '$lib/io/apply';
	import * as assetsDb from '$lib/storage/assets';
	import * as portfoliosDb from '$lib/storage/portfolios';
	import * as strategiesDb from '$lib/storage/strategies';
	import * as currenciesDb from '$lib/storage/currencies';
	import * as simulationsDb from '$lib/storage/simulations';
	import * as settingsDb from '$lib/storage/settings';
	import { loadAssets } from '$lib/stores/assets';
	import { loadPortfolios } from '$lib/stores/portfolios';
	import { loadStrategies } from '$lib/stores/strategies';
	import { loadCurrencies } from '$lib/stores/currencies';
	import { loadSettings } from '$lib/stores/settings';

	let {
		open = $bindable(false),
	}: {
		open?: boolean;
	} = $props();

	type Step = 'select-file' | 'select-scopes' | 'resolve-conflicts' | 'applying' | 'done';

	let step: Step = $state('select-file');
	let error: string | null = $state(null);
	let importData: SweetfolioExport | null = $state(null);
	let selectedScopes: Set<SweetfolioScope> = $state(new Set());
	let conflictReport: ConflictReport | null = $state(null);
	let applyProgress: string = $state('');

	const scopeLabels: Record<SweetfolioScope, string> = {
		assets: 'Assets',
		portfolios: 'Portfolios',
		strategies: 'Strategies',
		settings: 'Settings',
		currencies: 'Exchange Rates',
		simulations: 'Simulations',
	};

	function reset() {
		step = 'select-file';
		error = null;
		importData = null;
		selectedScopes = new Set();
		conflictReport = null;
		applyProgress = '';
	}

	function handleClose() {
		open = false;
		reset();
	}

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		error = null;

		try {
			importData = await parseImportFile(input.files[0]);
			selectedScopes = new Set(importData.scopes);
			step = 'select-scopes';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to read file';
		}
	}

	function toggleScope(scope: SweetfolioScope) {
		const next = new Set(selectedScopes);
		if (next.has(scope)) {
			next.delete(scope);
		} else {
			next.add(scope);
		}
		selectedScopes = next;
	}

	async function handleDetectConflicts() {
		if (!importData) return;
		error = null;

		try {
			const existing = {
				assets: selectedScopes.has('assets') ? await assetsDb.getAll() : [],
				portfolios: selectedScopes.has('portfolios') ? await portfoliosDb.getAll() : [],
				strategies: selectedScopes.has('strategies') ? await strategiesDb.getAll() : [],
				currencies: selectedScopes.has('currencies') ? await currenciesDb.getAll() : [],
				simulations: selectedScopes.has('simulations') ? await simulationsDb.getAll() : [],
				settings: selectedScopes.has('settings') ? await settingsDb.getAll() : {},
			};

			const filteredData: SweetfolioExport['data'] = {};
			if (selectedScopes.has('assets')) filteredData.assets = importData.data.assets;
			if (selectedScopes.has('portfolios')) filteredData.portfolios = importData.data.portfolios;
			if (selectedScopes.has('strategies')) filteredData.strategies = importData.data.strategies;
			if (selectedScopes.has('settings')) filteredData.settings = importData.data.settings;
			if (selectedScopes.has('currencies')) filteredData.currencies = importData.data.currencies;
			if (selectedScopes.has('simulations')) filteredData.simulations = importData.data.simulations;

			conflictReport = detectConflicts(filteredData, existing);
			step = 'resolve-conflicts';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to detect conflicts';
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function conflictLabel(item: any): string {
		if (typeof item?.name === 'string') return item.name;
		if (typeof item?.pair === 'string') return item.pair;
		if (typeof item?.id === 'string') return item.id;
		return 'Unknown';
	}

	function setResolution<T>(conflict: ConflictItem<T>, resolution: 'keep' | 'replace' | 'skip') {
		conflict.resolution = resolution;
		conflictReport = conflictReport; // trigger reactivity
	}

	function setSettingResolution(conflict: SettingConflict, resolution: 'keep' | 'replace' | 'skip') {
		conflict.resolution = resolution;
		conflictReport = conflictReport;
	}

	function hasUnresolvedConflicts(): boolean {
		if (!conflictReport) return false;
		const scopes = ['assets', 'portfolios', 'strategies', 'currencies', 'simulations'] as const;
		for (const scope of scopes) {
			if (conflictReport[scope].conflicts.some((c) => !c.resolution)) return true;
		}
		if (conflictReport.settings.conflicts.some((c) => !c.resolution)) return true;
		return false;
	}

	async function handleApply() {
		if (!conflictReport) return;
		step = 'applying';
		error = null;

		try {
			await applyImport(conflictReport);

			applyProgress = 'Reloading data...';
			await Promise.all([loadAssets(), loadPortfolios(), loadStrategies(), loadCurrencies(), loadSettings()]);

			step = 'done';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Import failed';
			step = 'resolve-conflicts';
		}
	}

	function totalNewItems(): number {
		if (!conflictReport) return 0;
		return (
			conflictReport.assets.newItems.length +
			conflictReport.portfolios.newItems.length +
			conflictReport.strategies.newItems.length +
			conflictReport.currencies.newItems.length +
			conflictReport.simulations.newItems.length +
			conflictReport.settings.newItems.length
		);
	}

	function totalConflicts(): number {
		if (!conflictReport) return 0;
		return (
			conflictReport.assets.conflicts.length +
			conflictReport.portfolios.conflicts.length +
			conflictReport.strategies.conflicts.length +
			conflictReport.currencies.conflicts.length +
			conflictReport.simulations.conflicts.length +
			conflictReport.settings.conflicts.length
		);
	}
</script>

<Modal bind:open title="Import Data">
	{#if step === 'select-file'}
		<p class="wizard-description">Select a Sweetfolio export file (.json) to import.</p>
		<input type="file" accept=".json" onchange={handleFileSelect} class="file-input" />

		{#if error}
			<div class="wizard-error">{error}</div>
		{/if}

	{:else if step === 'select-scopes'}
		<p class="wizard-description">
			File exported on {importData?.exportedAt ? new Date(importData.exportedAt).toLocaleDateString() : 'unknown'}.
			Select which data to import:
		</p>

		<div class="scope-list">
			{#each ALL_SCOPES as scope}
				{@const available = importData?.scopes.includes(scope)}
				<label class="scope-item" class:disabled={!available}>
					<input
						type="checkbox"
						checked={selectedScopes.has(scope)}
						disabled={!available}
						onchange={() => toggleScope(scope)}
					/>
					<span>{scopeLabels[scope]}</span>
					{#if !available}
						<span class="scope-unavailable">(not in file)</span>
					{/if}
				</label>
			{/each}
		</div>

		{#if error}
			<div class="wizard-error">{error}</div>
		{/if}

	{:else if step === 'resolve-conflicts'}
		<div class="conflict-summary">
			<span class="summary-new">{totalNewItems()} new items</span>
			{#if totalConflicts() > 0}
				<span class="summary-conflicts">{totalConflicts()} conflicts to resolve</span>
			{:else}
				<span class="summary-no-conflicts">No conflicts</span>
			{/if}
		</div>

		{#if conflictReport}
			{#each ['assets', 'portfolios', 'strategies', 'currencies', 'simulations'] as scope}
				{@const report = conflictReport[scope as keyof ConflictReport]}
				{#if 'conflicts' in report && (report.conflicts.length > 0 || report.newItems.length > 0)}
					<div class="conflict-scope">
						<h4>{scopeLabels[scope as SweetfolioScope]}</h4>
						{#if report.newItems.length > 0}
							<p class="scope-info">{report.newItems.length} new item{report.newItems.length !== 1 ? 's' : ''} will be added</p>
						{/if}
						{#each report.conflicts as conflict}
							<div class="conflict-item">
								<div class="conflict-names">
									<span class="conflict-label">{conflictLabel(conflict.existing)}</span>
								</div>
								<div class="conflict-actions">
									<button
										class="resolution-btn"
										class:active={conflict.resolution === 'keep'}
										onclick={() => setResolution(conflict, 'keep')}
									>Keep</button>
									<button
										class="resolution-btn"
										class:active={conflict.resolution === 'replace'}
										onclick={() => setResolution(conflict, 'replace')}
									>Replace</button>
									<button
										class="resolution-btn"
										class:active={conflict.resolution === 'skip'}
										onclick={() => setResolution(conflict, 'skip')}
									>Skip</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/each}

			{#if conflictReport.settings.conflicts.length > 0 || conflictReport.settings.newItems.length > 0}
				<div class="conflict-scope">
					<h4>Settings</h4>
					{#if conflictReport.settings.newItems.length > 0}
						<p class="scope-info">{conflictReport.settings.newItems.length} new setting{conflictReport.settings.newItems.length !== 1 ? 's' : ''} will be added</p>
					{/if}
					{#each conflictReport.settings.conflicts as conflict}
						<div class="conflict-item">
							<div class="conflict-names">
								<span class="conflict-label">{conflict.key}</span>
								<span class="conflict-detail">Current: {JSON.stringify(conflict.existing)} → Imported: {JSON.stringify(conflict.imported)}</span>
							</div>
							<div class="conflict-actions">
								<button
									class="resolution-btn"
									class:active={conflict.resolution === 'keep'}
									onclick={() => setSettingResolution(conflict, 'keep')}
								>Keep</button>
								<button
									class="resolution-btn"
									class:active={conflict.resolution === 'replace'}
									onclick={() => setSettingResolution(conflict, 'replace')}
								>Replace</button>
								<button
									class="resolution-btn"
									class:active={conflict.resolution === 'skip'}
									onclick={() => setSettingResolution(conflict, 'skip')}
								>Skip</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}

		{#if error}
			<div class="wizard-error">{error}</div>
		{/if}

	{:else if step === 'applying'}
		<p class="wizard-description">Importing data... {applyProgress}</p>

	{:else if step === 'done'}
		<p class="wizard-description">Import completed successfully.</p>
	{/if}

	{#snippet footer()}
		{#if step === 'select-file'}
			<Button variant="default" onclick={handleClose}>Cancel</Button>
		{:else if step === 'select-scopes'}
			<Button variant="default" onclick={handleClose}>Cancel</Button>
			<Button
				variant="primary"
				onclick={handleDetectConflicts}
				disabled={selectedScopes.size === 0}
			>
				Next
			</Button>
		{:else if step === 'resolve-conflicts'}
			<Button variant="default" onclick={handleClose}>Cancel</Button>
			<Button
				variant="primary"
				onclick={handleApply}
				disabled={hasUnresolvedConflicts()}
			>
				{hasUnresolvedConflicts() ? 'Resolve all conflicts first' : 'Apply Import'}
			</Button>
		{:else if step === 'done'}
			<Button variant="primary" onclick={handleClose}>Done</Button>
		{/if}
	{/snippet}
</Modal>

<style>
	.wizard-description {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.file-input {
		font-size: var(--font-size-sm);
		width: 100%;
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

	.scope-item.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.scope-item input[type="checkbox"] {
		accent-color: var(--color-accent);
	}

	.scope-unavailable {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.wizard-error {
		margin-top: var(--spacing-md);
		font-size: var(--font-size-xs);
		color: var(--color-negative, #e55);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: rgba(232, 23, 93, 0.08);
		border: 1px solid rgba(232, 23, 93, 0.2);
		border-radius: var(--radius-sm);
	}

	.conflict-summary {
		display: flex;
		gap: var(--spacing-lg);
		margin-bottom: var(--spacing-lg);
		font-size: var(--font-size-sm);
	}

	.summary-new {
		color: var(--color-accent);
	}

	.summary-conflicts {
		color: var(--color-warning, #e6a817);
	}

	.summary-no-conflicts {
		color: var(--color-accent);
	}

	.conflict-scope {
		margin-bottom: var(--spacing-lg);
	}

	.conflict-scope h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		margin-bottom: var(--spacing-sm);
		color: var(--color-text-secondary);
	}

	.scope-info {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.conflict-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) 0;
		border-bottom: 1px solid var(--color-border);
		font-size: var(--font-size-sm);
	}

	.conflict-names {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.conflict-label {
		font-weight: 500;
	}

	.conflict-detail {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.conflict-actions {
		display: flex;
		gap: var(--spacing-xs);
		flex-shrink: 0;
	}

	.resolution-btn {
		font-size: var(--font-size-xs);
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border);
		background: var(--color-bg-tertiary);
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.resolution-btn:hover {
		background: var(--color-border);
		color: var(--color-text-primary);
	}

	.resolution-btn.active {
		background: var(--color-accent);
		color: #fff;
		border-color: var(--color-accent);
	}
</style>
