<script lang="ts">
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import { confirmService } from './confirm.svelte.ts';

	let typed = $state('');
	let open = $state(false);
	const req = $derived(confirmService.current);

	$effect(() => {
		open = !!req;
		typed = '';
	});
</script>

<Dialog bind:open title={req?.title ?? ''} size="sm" onclose={() => confirmService.answer(false)}>
	{#if req}
		<div class="stack" style="--gap: 12px">
			<p>{req.message}</p>
			{#if req.typed}
				<label class="label" for="confirm-typed">Type <strong>{req.typed}</strong> to confirm</label>
				<input id="confirm-typed" class="input" bind:value={typed} autocomplete="off" />
			{/if}
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => confirmService.answer(false)}>Cancel</Button>
		<Button
			variant={req?.danger ? 'danger' : 'primary'}
			disabled={!!req?.typed && typed.trim() !== req.typed}
			onclick={() => confirmService.answer(true)}>{req?.confirmLabel ?? 'Confirm'}</Button
		>
	{/snippet}
</Dialog>
