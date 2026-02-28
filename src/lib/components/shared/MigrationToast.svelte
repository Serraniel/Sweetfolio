<script lang="ts">
	import { migrationProgress } from '$lib/migrations/runner';

	const progress = $derived($migrationProgress);
	const visible = $derived(progress.active || progress.result !== null);
	const percent = $derived(progress.total > 0 ? (progress.current / progress.total) * 100 : 0);
	const hasErrors = $derived((progress.result?.errors.length ?? 0) > 0);
	const hasChanges = $derived((progress.result?.changes.length ?? 0) > 0);

	let dismissed = $state(false);
	let showDetails = $state(false);

	function dismiss() {
		dismissed = true;
		showDetails = false;
	}

	// Reset dismissed state when a new migration starts
	$effect(() => {
		if (progress.active) {
			dismissed = false;
			showDetails = false;
		}
	});

	// Prevent accidental page close while migration is running
	$effect(() => {
		if (progress.active) {
			const handler = (e: BeforeUnloadEvent) => {
				e.preventDefault();
			};
			window.addEventListener('beforeunload', handler);
			return () => window.removeEventListener('beforeunload', handler);
		}
	});

	// Auto-dismiss after 8 seconds when complete with no errors
	$effect(() => {
		if (!progress.active && progress.result && !hasErrors) {
			const timer = setTimeout(() => {
				dismissed = true;
			}, 8000);
			return () => clearTimeout(timer);
		}
	});
</script>

{#if visible && !dismissed}
	<div class="migration-toast">
		<div class="migration-toast-content">
			{#if progress.active}
				<div class="migration-status">
					<span class="migration-text">
						{progress.migrationLabel} ({progress.current}/{progress.total})
					</span>
					<span class="migration-detail">{progress.detail}</span>
				</div>
				<div class="progress-bar-track">
					<div class="progress-bar-fill" style="width: {percent}%"></div>
				</div>
			{:else if progress.result}
				<div class="migration-done">
					<div class="migration-messages">
						{#if hasChanges}
							<span class="migration-success">
								Updated {progress.result.changes.length} asset{progress.result.changes.length !== 1 ? 's' : ''}
							</span>
						{:else if !hasErrors}
							<span class="migration-success">No changes needed</span>
						{/if}
						{#if hasErrors}
							<span class="migration-errors">
								{progress.result.errors.length} error{progress.result.errors.length !== 1 ? 's' : ''}
							</span>
						{/if}
						{#if hasChanges || hasErrors}
							<button class="details-btn" onclick={() => (showDetails = !showDetails)}>
								{showDetails ? 'Hide' : 'Show'} details
							</button>
						{/if}
					</div>
					<button class="dismiss-btn" onclick={dismiss} aria-label="Dismiss">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
				{#if showDetails && progress.result}
					<div class="migration-details">
						{#each progress.result.changes as change}
							<div class="detail-change">{change}</div>
						{/each}
						{#each progress.result.errors as error}
							<div class="detail-error">{error}</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.migration-toast {
		position: fixed;
		bottom: var(--spacing-lg);
		right: var(--spacing-lg);
		z-index: 1000;
		min-width: 300px;
		max-width: 420px;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
		animation: migration-toast-slide-in 0.3s ease-out;
		backdrop-filter: blur(12px);
	}

	.migration-toast-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.migration-status {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--spacing-sm);
	}

	.migration-text {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.migration-detail {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 160px;
	}

	.progress-bar-track {
		height: 4px;
		background: var(--color-bg-tertiary);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		background: var(--color-accent);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.migration-done {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.migration-messages {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.migration-success {
		font-size: var(--font-size-sm);
		color: var(--color-accent);
	}

	.migration-errors {
		font-size: var(--font-size-sm);
		color: var(--color-warning, #e6a817);
	}

	.details-btn {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 2px;
	}

	.details-btn:hover {
		color: var(--color-text-primary);
	}

	.dismiss-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		flex-shrink: 0;
	}

	.dismiss-btn:hover {
		color: var(--color-text-primary);
		background: var(--color-bg-tertiary);
	}

	.migration-details {
		max-height: 200px;
		overflow-y: auto;
		border-top: 1px solid var(--color-border);
		padding-top: var(--spacing-xs);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.detail-change {
		font-size: var(--font-size-xs);
		color: var(--color-accent);
	}

	.detail-error {
		font-size: var(--font-size-xs);
		color: var(--color-warning, #e6a817);
	}

	@keyframes migration-toast-slide-in {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
