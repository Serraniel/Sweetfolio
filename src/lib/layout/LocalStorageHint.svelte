<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';

	const KEY = 'sweetfolio-hint-local-storage-dismissed';
	let dismissed = $state(true);

	$effect(() => {
		try {
			dismissed = localStorage.getItem(KEY) === 'true';
		} catch {
			dismissed = false;
		}
	});

	function dismiss() {
		dismissed = true;
		try {
			localStorage.setItem(KEY, 'true');
		} catch {
			/* ignore */
		}
	}
</script>

{#if !dismissed}
	<aside class="hint-banner" role="note">
		<Icon name="info" size={18} />
		<p class="small">
			Your data is stored only in this browser — nothing is uploaded. Clearing site data deletes it, so
			<a href="/settings#data">export a backup</a> from time to time.
		</p>
		<button aria-label="Dismiss" onclick={dismiss}><Icon name="x" size={16} /></button>
	</aside>
{/if}

<style>
	.hint-banner {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 14px;
		margin-bottom: var(--space-4);
		border-radius: var(--radius);
		background: var(--accent-soft);
		color: var(--text-2);
	}
	.hint-banner :global(.icon) {
		color: var(--accent);
		margin-top: 2px;
	}
	p {
		flex: 1;
	}
	button {
		border: none;
		background: none;
		color: var(--muted);
		padding: 2px;
		display: grid;
	}
</style>
