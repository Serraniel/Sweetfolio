<script lang="ts">
	import { shareOrCopy } from '$lib/sharing/share';

	let {
		url,
		title,
		disabled = false,
		size = 'sm' as 'sm' | 'md',
		ontoast
	}: {
		url: string;
		title: string;
		disabled?: boolean;
		size?: 'sm' | 'md';
		ontoast?: (message: string) => void;
	} = $props();

	function toast(msg: string) {
		if (msg && ontoast) ontoast(msg);
	}

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(url);
			toast('Link copied to clipboard');
		} catch {
			toast('Could not copy to clipboard');
		}
	}

	async function handleShare() {
		const msg = await shareOrCopy(url, title);
		toast(msg);
	}
</script>

<div class="share-group share-group--{size}" class:disabled>
	<button
		class="share-btn share-copy"
		{disabled}
		onclick={handleCopy}
		title="Copy link to clipboard"
	>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
			<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
		</svg>
	</button>
	<button
		class="share-btn share-action"
		{disabled}
		onclick={handleShare}
		title="Share"
	>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="18" cy="5" r="3"/>
			<circle cx="6" cy="12" r="3"/>
			<circle cx="18" cy="19" r="3"/>
			<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
			<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
		</svg>
		Share
	</button>
</div>

<style>
	.share-group {
		display: inline-flex;
		border-radius: var(--radius-sm);
		overflow: hidden;
		border: 1px solid var(--color-border);
	}

	.share-group.disabled {
		opacity: 0.5;
		pointer-events: none;
	}

	.share-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		font-weight: 500;
		white-space: nowrap;
		background: var(--color-bg-tertiary);
		color: var(--color-text-primary);
		border: none;
		cursor: pointer;
		transition: background-color var(--transition-fast), color var(--transition-fast);
	}

	.share-btn:hover:not(:disabled) {
		background: var(--color-border);
	}

	.share-btn:disabled {
		cursor: not-allowed;
	}

	.share-copy {
		border-right: 1px solid var(--color-border);
	}

	.share-group--sm .share-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-xs);
	}

	.share-group--md .share-btn {
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
	}
</style>
