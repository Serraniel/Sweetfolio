<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';
	import Button from '$lib/components/shared/Button.svelte';
	import type { Transaction, Asset, TransactionType } from '$lib/types';

	let {
		open = $bindable(false),
		transaction = null,
		assets,
		portfolioId,
		onsave
	}: {
		open?: boolean;
		transaction?: Transaction | null;
		assets: Asset[];
		portfolioId: string;
		onsave: (tx: Transaction) => void;
	} = $props();

	let type = $state<TransactionType>('buy');
	let assetId = $state('');
	let date = $state('');
	let quantity = $state<number | null>(null);
	let price = $state<number | null>(null);
	let fee = $state(0);
	let amount = $state<number | null>(null);
	let withholdingTax = $state(0);
	let currency = $state('EUR');
	let notes = $state('');

	const isDividend = $derived(type === 'dividend');

	const total = $derived(
		!isDividend && quantity != null && price != null ? quantity * price : null
	);

	const canSave = $derived(
		assetId !== '' &&
			date !== '' &&
			(isDividend ? amount != null && amount > 0 : quantity != null && quantity > 0 && price != null && price > 0)
	);

	const title = $derived(transaction ? 'Edit Transaction' : 'Add Transaction');

	$effect(() => {
		if (open) {
			if (transaction) {
				type = transaction.type;
				assetId = transaction.assetId;
				date = transaction.date;
				quantity = transaction.quantity;
				price = transaction.price;
				fee = transaction.fee;
				amount = transaction.amount;
				withholdingTax = transaction.withholdingTax;
				currency = transaction.currency;
				notes = transaction.notes;
			} else {
				type = 'buy';
				assetId = '';
				date = new Date().toISOString().slice(0, 10);
				quantity = null;
				price = null;
				fee = 0;
				amount = null;
				withholdingTax = 0;
				currency = 'EUR';
				notes = '';
			}
		}
	});

	function handleSave() {
		const now = new Date().toISOString();
		const tx: Transaction = {
			id: transaction?.id ?? crypto.randomUUID(),
			portfolioId,
			type,
			assetId,
			date,
			quantity: isDividend ? null : quantity,
			price: isDividend ? null : price,
			fee,
			amount: isDividend ? amount : total,
			withholdingTax,
			currency,
			notes,
			createdAt: transaction?.createdAt ?? now,
			updatedAt: now
		};
		onsave(tx);
		open = false;
	}
</script>

<Modal bind:open {title}>
	<div class="form">
		<div class="form-row">
			<div class="form-field">
				<label for="tx-type">Type</label>
				<select id="tx-type" bind:value={type}>
					<option value="buy">Buy</option>
					<option value="sell">Sell</option>
					<option value="dividend">Dividend</option>
				</select>
			</div>
			<div class="form-field">
				<label for="tx-date">Date</label>
				<input id="tx-date" type="date" bind:value={date} />
			</div>
		</div>

		<div class="form-field">
			<label for="tx-asset">Asset</label>
			<select id="tx-asset" bind:value={assetId}>
				<option value="" disabled>Select an asset...</option>
				{#each assets as asset (asset.id)}
					<option value={asset.id}>{asset.name}</option>
				{/each}
			</select>
		</div>

		{#if !isDividend}
			<div class="form-row">
				<div class="form-field">
					<label for="tx-quantity">Quantity</label>
					<input id="tx-quantity" type="number" min="0" step="any" bind:value={quantity} placeholder="0" />
				</div>
				<div class="form-field">
					<label for="tx-price">Price</label>
					<input id="tx-price" type="number" min="0" step="any" bind:value={price} placeholder="0.00" />
				</div>
			</div>

			{#if total != null}
				<div class="total-display">
					Total: <span class="total-value">{total.toFixed(2)} {currency}</span>
				</div>
			{/if}
		{:else}
			<div class="form-row">
				<div class="form-field">
					<label for="tx-amount">Amount</label>
					<input id="tx-amount" type="number" min="0" step="any" bind:value={amount} placeholder="0.00" />
				</div>
				<div class="form-field">
					<label for="tx-withholding">Withholding Tax</label>
					<input id="tx-withholding" type="number" min="0" step="any" bind:value={withholdingTax} placeholder="0.00" />
				</div>
			</div>
		{/if}

		<div class="form-row">
			<div class="form-field">
				<label for="tx-fee">Fee</label>
				<input id="tx-fee" type="number" min="0" step="any" bind:value={fee} placeholder="0.00" />
			</div>
			<div class="form-field">
				<label for="tx-currency">Currency</label>
				<input id="tx-currency" type="text" bind:value={currency} placeholder="EUR" />
			</div>
		</div>

		<div class="form-field">
			<label for="tx-notes">Notes</label>
			<textarea id="tx-notes" bind:value={notes} rows="2" placeholder="Optional notes..."></textarea>
		</div>
	</div>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" onclick={handleSave} disabled={!canSave}>Save</Button>
	{/snippet}
</Modal>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
	}

	.form-row > .form-field {
		flex: 1;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.form-field > label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.form-field input,
	.form-field select,
	.form-field textarea {
		padding: var(--spacing-sm);
		border-radius: var(--radius-sm);
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border);
		color: var(--color-text-primary);
		font-size: var(--font-size-sm);
	}

	.form-field textarea {
		resize: vertical;
	}

	.total-display {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		padding: var(--spacing-xs) 0;
	}

	.total-value {
		font-family: var(--font-mono);
		color: var(--color-text-secondary);
		font-weight: 600;
	}
</style>
