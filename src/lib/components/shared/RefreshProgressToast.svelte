<script lang="ts">
	import { refreshProgress } from '$lib/stores/auto-refresh';

	const progress = $derived($refreshProgress);
	const visible = $derived(progress.active || progress.errors.length > 0 || progress.conflicts.length > 0);
	const percent = $derived(progress.total > 0 ? (progress.current / progress.total) * 100 : 0);

	let dismissed = $state(false);

	function dismiss() {
		dismissed = true;
	}

	$effect(() => {
		if (progress.active) dismissed = false;
	});
</script>

{#if visible && !dismissed}
	<div class="refresh-toast">
		<div class="refresh-toast-content">
			{#if progress.active}
				<div class="refresh-status">
					<span class="refresh-text">
						Refreshing assets… ({progress.current}/{progress.total})
					</span>
					<span class="refresh-asset-name">{progress.currentAssetName}</span>
				</div>
				<div class="progress-bar-track">
					<div class="progress-bar-fill" style="width: {percent}%"></div>
				</div>
			{:else}
				<div class="refresh-done">
					{#if progress.errors.length > 0}
						<span class="refresh-errors">
							{progress.errors.length} asset{progress.errors.length > 1 ? 's' : ''} failed to refresh
						</span>
					{/if}
					{#if progress.conflicts.length > 0}
						<span class="refresh-conflicts">
							{progress.conflicts.length} asset{progress.conflicts.length > 1 ? 's' : ''} have price conflicts
						</span>
					{/if}
					{#if progress.errors.length === 0 && progress.conflicts.length === 0}
						<span class="refresh-success">All assets refreshed</span>
					{/if}
					<button class="dismiss-btn" onclick={dismiss} aria-label="Dismiss">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.refresh-toast {
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
		animation: toast-slide-in 0.3s ease-out;
		backdrop-filter: blur(12px);
	}

	.refresh-toast-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.refresh-status {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--spacing-sm);
	}

	.refresh-text {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.refresh-asset-name {
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

	.refresh-done {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.refresh-errors {
		font-size: var(--font-size-sm);
		color: var(--color-warning, #e6a817);
	}

	.refresh-conflicts {
		font-size: var(--font-size-sm);
		color: var(--color-warning, #e6a817);
	}

	.refresh-success {
		font-size: var(--font-size-sm);
		color: var(--color-accent);
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

	@keyframes toast-slide-in {
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
