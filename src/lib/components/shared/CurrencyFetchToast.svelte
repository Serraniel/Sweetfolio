<script lang="ts">
	import { currencyFetchProgress } from '$lib/stores/currency-auto-fetch';

	const progress = $derived($currencyFetchProgress);
	const visible = $derived(progress.active || progress.errors.length > 0);
	const percent = $derived(progress.total > 0 ? (progress.current / progress.total) * 100 : 0);

	let dismissed = $state(false);

	function dismiss() {
		dismissed = true;
	}

	$effect(() => {
		if (progress.active) dismissed = false;
	});

	// Auto-dismiss after 4 seconds when complete with no errors
	$effect(() => {
		if (!progress.active && progress.errors.length === 0 && progress.total > 0) {
			const timer = setTimeout(() => {
				dismissed = true;
			}, 4000);
			return () => clearTimeout(timer);
		}
	});
</script>

{#if visible && !dismissed}
	<div class="currency-toast">
		<div class="currency-toast-content">
			{#if progress.active}
				<div class="currency-status">
					<span class="currency-text">
						Fetching exchange rates... ({progress.current}/{progress.total})
					</span>
					<span class="currency-pair">{progress.currentPair}</span>
				</div>
				<div class="progress-bar-track">
					<div class="progress-bar-fill" style="width: {percent}%"></div>
				</div>
			{:else}
				<div class="currency-done">
					<div class="currency-messages">
						{#if progress.errors.length > 0}
							<span class="currency-errors">
								{progress.errors.length} pair{progress.errors.length > 1 ? 's' : ''} failed to fetch
							</span>
						{:else}
							<span class="currency-success">Exchange rates updated</span>
						{/if}
					</div>
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
	.currency-toast {
		position: fixed;
		bottom: calc(var(--spacing-lg) + 60px);
		right: var(--spacing-lg);
		z-index: 1000;
		min-width: 300px;
		max-width: 420px;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
		animation: currency-toast-slide-in 0.3s ease-out;
		backdrop-filter: blur(12px);
	}

	.currency-toast-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.currency-status {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--spacing-sm);
	}

	.currency-text {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.currency-pair {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-family: var(--font-mono);
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

	.currency-done {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.currency-messages {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.currency-errors {
		font-size: var(--font-size-sm);
		color: var(--color-warning, #e6a817);
	}

	.currency-success {
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

	@keyframes currency-toast-slide-in {
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
