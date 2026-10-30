<script lang="ts">
	/** Copy link (with feedback) + native share sheet (SH-3). */
	import Button from '#lib/ui/Button.svelte';
	import { notify } from '#lib/state/toasts.svelte.ts';

	let { url, title, disabled = false, reason }: { url: string; title: string; disabled?: boolean; reason?: string } = $props();
	let copied = $state(false);
	const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

	async function copy() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			notify.error('Could not copy the link.');
		}
	}

	async function share() {
		try {
			await navigator.share({ title, url });
		} catch (err) {
			if (!(err instanceof DOMException && err.name === 'AbortError')) await copy();
		}
	}
</script>

<div class="share">
	<Button size="sm" icon={copied ? 'check' : 'link'} onclick={copy} {disabled} title={disabled ? reason : 'Copy share link'}
		>{copied ? 'Copied' : 'Copy link'}</Button
	>
	{#if canShare}<Button
			size="sm"
			icon="share"
			iconOnly
			aria-label="Share"
			onclick={share}
			{disabled}
			title={disabled ? reason : 'Share'}
		/>{/if}
</div>

<style>
	.share {
		display: inline-flex;
		gap: 4px;
	}
</style>
