<script lang="ts">
	import { notify } from '#lib/state/toasts.svelte.ts';
	import Icon from './Icon.svelte';
	import Progress from './Progress.svelte';
</script>

<div class="toaster" aria-live="polite">
	{#each notify.tasks as task (task.id)}
		<div class="toast task" role="status">
			<div class="spread">
				<strong class="small">{task.label}</strong>
				{#if task.done}
					<button class="x" aria-label="Dismiss" onclick={() => notify.dismissTask(task.id)}><Icon name="x" size={14} /></button>
				{:else if task.total}
					<span class="xs muted num">{task.current}/{task.total}</span>
				{/if}
			</div>
			{#if task.done}
				{#if task.summary}<p class="small">{task.summary}</p>{/if}
				{#if task.errors.length}
					<details class="small">
						<summary class="neg">{task.errors.length} problem{task.errors.length === 1 ? '' : 's'}</summary>
						<ul>
							{#each task.errors as e, i (i)}<li>{e}</li>{/each}
						</ul>
					</details>
				{/if}
			{:else}
				{#if task.detail}<p class="xs muted truncate">{task.detail}</p>{/if}
				<Progress value={task.current} max={task.total || 1} label={task.label} />
			{/if}
		</div>
	{/each}
	{#each notify.toasts as t (t.id)}
		<div class="toast {t.kind}" role={t.kind === 'error' ? 'alert' : 'status'}>
			<Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'info'} size={16} />
			<span class="msg small">{t.message}</span>
			{#if t.action}
				{#if t.action.href}
					<a class="small act" href={t.action.href} onclick={() => notify.dismiss(t.id)}>{t.action.label}</a>
				{:else}
					<button
						class="small act link"
						onclick={() => {
							t.action?.run?.();
							notify.dismiss(t.id);
						}}>{t.action.label}</button
					>
				{/if}
			{/if}
			<button class="x" aria-label="Dismiss" onclick={() => notify.dismiss(t.id)}><Icon name="x" size={14} /></button>
		</div>
	{/each}
</div>

<style>
	.toaster {
		position: fixed;
		z-index: 100;
		left: 12px;
		right: 12px;
		bottom: calc(var(--tabbar-height) + env(safe-area-inset-bottom) + 12px);
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: none;
	}
	@media (min-width: 900px) {
		.toaster {
			left: auto;
			right: 20px;
			bottom: 20px;
			width: 380px;
		}
	}
	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--surface-solid);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-lg);
		animation: in 0.2s var(--ease);
	}
	.task {
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
	}
	.msg {
		flex: 1;
	}
	.success {
		border-left: 3px solid var(--positive);
	}
	.error {
		border-left: 3px solid var(--negative);
	}
	.error :global(.icon) {
		color: var(--negative);
	}
	.success :global(.icon) {
		color: var(--positive);
	}
	.x {
		border: none;
		background: none;
		color: var(--muted);
		padding: 4px;
		display: grid;
	}
	.act {
		font-weight: 600;
	}
	.link {
		border: none;
		background: none;
		color: var(--accent);
		padding: 0;
	}
	ul {
		margin: 4px 0 0;
		padding-left: 18px;
		max-height: 140px;
		overflow: auto;
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
</style>
