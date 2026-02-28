<script lang="ts">
	import { browser } from '$app/environment';

	const STORAGE_KEY = 'sweetfolio-hint-local-storage-dismissed';

	let dismissed = $state(
		browser &&
			(() => {
				try {
					return localStorage.getItem(STORAGE_KEY) === 'true';
				} catch {
					return false;
				}
			})()
	);

	function dismiss() {
		dismissed = true;
		try {
			localStorage.setItem(STORAGE_KEY, 'true');
		} catch {
			// Silently fail — hint stays dismissed for this session
		}
	}
</script>

{#if !dismissed}
	<div class="hint" role="status">
		<svg class="hint-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="10"/>
			<line x1="12" y1="16" x2="12" y2="12"/>
			<line x1="12" y1="8" x2="12.01" y2="8"/>
		</svg>
		<p class="hint-text">
			All your data is stored locally in your browser. Nothing is sent to a server. If you clear your browser data, your portfolios and settings will be lost.
		</p>
		<button class="hint-dismiss" onclick={dismiss} aria-label="Dismiss">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"/>
				<line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>
{/if}

<style>
	.hint {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-bottom: var(--spacing-lg);
		background: var(--glass-bg);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		border: 1px solid var(--color-accent-light, rgba(141, 208, 196, 0.3));
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.hint-icon {
		flex-shrink: 0;
		color: var(--color-accent);
		margin-top: 1px;
	}

	.hint-text {
		flex: 1;
		margin: 0;
		line-height: 1.5;
	}

	.hint-dismiss {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xs);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color var(--transition-fast), background-color var(--transition-fast);
	}

	.hint-dismiss:hover {
		color: var(--color-text-primary);
		background: var(--color-bg-tertiary);
	}

	.hint-dismiss:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}
</style>
