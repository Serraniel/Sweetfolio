<script lang="ts">
	/**
	 * Accessible modal built on <dialog> (focus trap, Esc). Renders as a bottom
	 * sheet on small screens (UI-7).
	 */
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		title,
		size = 'md',
		children,
		footer,
		onclose,
		dismissible = true
	}: {
		open?: boolean;
		title: string;
		size?: 'sm' | 'md' | 'lg';
		children: Snippet;
		footer?: Snippet;
		onclose?: () => void;
		dismissible?: boolean;
	} = $props();

	let el: HTMLDialogElement | undefined = $state();

	$effect(() => () => {
		if (open) document.documentElement.classList.remove('modal-open');
	});

	$effect(() => {
		if (!el) return;
		if (open && !el.open) {
			el.showModal();
			document.documentElement.classList.add('modal-open');
		} else if (!open && el.open) {
			el.close();
		}
	});

	function handleClose() {
		document.documentElement.classList.remove('modal-open');
		if (open) {
			open = false;
			onclose?.();
		}
	}

	function handleCancel(e: Event) {
		if (!dismissible) e.preventDefault();
	}

	function handleClick(e: MouseEvent) {
		if (dismissible && e.target === el) open = false;
	}
</script>

<dialog
	bind:this={el}
	class="dialog {size}"
	onclose={handleClose}
	oncancel={handleCancel}
	onclick={handleClick}
	aria-labelledby="dlg-title"
>
	{#if open}
		<div class="panel">
			<header>
				<h2 id="dlg-title">{title}</h2>
				{#if dismissible}
					<button class="close" type="button" aria-label="Close" onclick={() => (open = false)}><Icon name="x" /></button>
				{/if}
			</header>
			<div class="body">{@render children()}</div>
			{#if footer}<footer>{@render footer()}</footer>{/if}
		</div>
	{/if}
</dialog>

<style>
	.dialog {
		padding: 0;
		border: none;
		background: transparent;
		max-width: 100vw;
		max-height: 100dvh;
		width: 100%;
		margin: auto auto 0;
		color: var(--text);
	}
	.dialog::backdrop {
		background: rgb(10 12 14 / 0.45);
		backdrop-filter: blur(3px);
	}
	.dialog[open] {
		animation: up 0.22s var(--ease);
	}
	.panel {
		display: flex;
		flex-direction: column;
		max-height: 92dvh;
		background: var(--surface-solid);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: var(--shadow-lg);
		padding-bottom: env(safe-area-inset-bottom);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-4) var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.close {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: none;
		background: var(--surface-2);
		color: var(--text-2);
	}
	.body {
		padding: var(--space-4);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--border);
	}
	@media (min-width: 640px) {
		.dialog {
			margin: auto;
			width: calc(100% - 32px);
		}
		.sm {
			max-width: 420px;
		}
		.md {
			max-width: 600px;
		}
		.lg {
			max-width: 920px;
		}
		.panel {
			border-radius: var(--radius-lg);
			max-height: 88dvh;
			padding-bottom: 0;
		}
		.dialog[open] {
			animation: pop 0.18s var(--ease);
		}
		.body {
			padding: var(--space-5);
		}
		header {
			padding: var(--space-4) var(--space-5);
		}
		footer {
			padding: var(--space-3) var(--space-5);
		}
	}
	@keyframes up {
		from {
			transform: translateY(24px);
			opacity: 0;
		}
	}
	@keyframes pop {
		from {
			transform: scale(0.97);
			opacity: 0;
		}
	}
	:global(html.modal-open) {
		overflow: hidden;
	}
</style>
