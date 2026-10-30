<script lang="ts">
	/** Add/edit a transaction with per-type fields and validation (PT-2, PT-3). */
	import { COMMON_CURRENCIES, TRANSACTION_TYPES, type Portfolio, type Transaction, type TransactionType } from '#lib/domain/types.ts';
	import { newTransaction } from '#lib/domain/factories.ts';
	import { positionAt } from '#lib/core/tracking.ts';
	import { todayISO, isISODate } from '#lib/core/dates.ts';
	import { app } from '#lib/state/app.svelte.ts';
	import * as fmt from '#lib/format.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';

	let {
		open = $bindable(false),
		portfolio,
		transaction = null
	}: { open?: boolean; portfolio: Portfolio; transaction?: Transaction | null } = $props();

	const TYPE_LABELS: Record<TransactionType, string> = {
		buy: 'Buy',
		sell: 'Sell',
		dividend: 'Dividend',
		deposit: 'Deposit',
		withdrawal: 'Withdrawal',
		fee: 'Fee',
		tax: 'Tax'
	};
	let f = $state({
		type: 'buy' as TransactionType,
		assetId: '',
		date: todayISO(),
		quantity: '',
		price: '',
		fee: '',
		amount: '',
		tax: '',
		currency: 'EUR',
		notes: ''
	});
	let saving = $state(false);

	$effect(() => {
		if (!open) return;
		const t = transaction;
		const s = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? '' : String(v));
		f = {
			type: t?.type ?? 'buy',
			assetId: t?.assetId ?? '',
			date: t?.date ?? todayISO(),
			quantity: s(t?.quantity),
			price: s(t?.price),
			fee: s(t?.fee),
			amount: s(t?.amount),
			tax: s(t?.withholdingTax),
			currency: t?.currency ?? portfolio.cashCurrency,
			notes: t?.notes ?? ''
		};
	});

	const needsAsset = $derived(f.type === 'buy' || f.type === 'sell' || f.type === 'dividend');
	const isTrade = $derived(f.type === 'buy' || f.type === 'sell');
	const assets = $derived([...app.assets].sort((a, b) => a.name.localeCompare(b.name)));
	const q = $derived(fmt.parseInput(f.quantity));
	const p = $derived(fmt.parseInput(f.price));
	const fee = $derived(fmt.parseInput(f.fee) ?? 0);
	const amount = $derived(fmt.parseInput(f.amount));
	const tax = $derived(fmt.parseInput(f.tax) ?? 0);
	const position = $derived(
		f.assetId && f.type === 'sell' ? positionAt(app.transactionsOf(portfolio.id), f.assetId, f.date, transaction?.id) : null
	);

	const errors = $derived.by(() => {
		const e: string[] = [];
		if (!isISODate(f.date)) e.push('Enter a valid date.');
		if (needsAsset && !f.assetId) e.push('Choose an asset.');
		if (isTrade && !(q !== null && q > 0)) e.push('Quantity must be positive.');
		if (isTrade && !(p !== null && p > 0)) e.push('Price must be positive.');
		if (!isTrade && !(amount !== null && amount > 0)) e.push('Amount must be positive.');
		if (fee < 0 || tax < 0) e.push('Fees and taxes cannot be negative.');
		if (f.type === 'sell' && position !== null && q !== null && q > position + 1e-9)
			e.push(`You only hold ${fmt.qty(position)} units on ${fmt.date(f.date)}.`);
		return e;
	});

	const total = $derived(
		isTrade && q && p ? q * p + (f.type === 'buy' ? fee : -fee) : f.type === 'dividend' && amount ? amount - tax - fee : amount
	);

	async function save(e?: Event) {
		e?.preventDefault();
		if (errors.length) return;
		saving = true;
		const base = transaction ?? newTransaction({ portfolioId: portfolio.id, type: f.type, date: f.date });
		await app.saveTransactions([
			{
				...base,
				type: f.type,
				assetId: needsAsset ? f.assetId : '',
				date: f.date,
				quantity: isTrade ? q : null,
				price: isTrade ? p : null,
				fee: f.type === 'buy' || f.type === 'sell' || f.type === 'dividend' ? fee : 0,
				amount: isTrade ? null : amount,
				withholdingTax: f.type === 'dividend' ? tax : 0,
				currency: f.currency,
				notes: f.notes.trim(),
				updatedAt: new Date().toISOString()
			}
		]);
		saving = false;
		open = false;
	}
</script>

<Dialog bind:open title={transaction ? 'Edit transaction' : 'Add transaction'}>
	<form id="tx-form" class="stack" style="--gap: 14px" onsubmit={save}>
		<div class="types" role="radiogroup" aria-label="Transaction type">
			{#each TRANSACTION_TYPES as t (t)}
				<button type="button" role="radio" aria-checked={f.type === t} class:active={f.type === t} onclick={() => (f.type = t)}
					>{TYPE_LABELS[t]}</button
				>
			{/each}
		</div>
		<div class="grid" style="--min: 160px">
			<div>
				<label class="label" for="tx-date">Date</label><input
					id="tx-date"
					class="input"
					type="date"
					bind:value={f.date}
					max={todayISO()}
					required
				/>
			</div>
			{#if needsAsset}
				<div class="span">
					<label class="label" for="tx-asset">Asset</label>
					<select
						id="tx-asset"
						class="select"
						bind:value={f.assetId}
						required
						onchange={() => {
							const a = app.assetById.get(f.assetId);
							if (a && !transaction) f.currency = a.currency === portfolio.cashCurrency ? a.currency : f.currency;
						}}
					>
						<option value="">Choose…</option>
						{#each assets as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
					</select>
				</div>
			{/if}
		</div>
		<div class="grid" style="--min: 130px">
			{#if isTrade}
				<div>
					<label class="label" for="tx-q">Quantity</label><input
						id="tx-q"
						class="input num"
						inputmode="decimal"
						bind:value={f.quantity}
						placeholder="0"
					/>
				</div>
				<div>
					<label class="label" for="tx-p">Price per unit</label><input
						id="tx-p"
						class="input num"
						inputmode="decimal"
						bind:value={f.price}
						placeholder="0.00"
					/>
				</div>
			{:else}
				<div>
					<label class="label" for="tx-a">{f.type === 'dividend' ? 'Gross amount' : 'Amount'}</label><input
						id="tx-a"
						class="input num"
						inputmode="decimal"
						bind:value={f.amount}
						placeholder="0.00"
					/>
				</div>
			{/if}
			{#if needsAsset}<div>
					<label class="label" for="tx-fee">Fee</label><input
						id="tx-fee"
						class="input num"
						inputmode="decimal"
						bind:value={f.fee}
						placeholder="0.00"
					/>
				</div>{/if}
			{#if f.type === 'dividend'}<div>
					<label class="label" for="tx-tax">Withholding tax</label><input
						id="tx-tax"
						class="input num"
						inputmode="decimal"
						bind:value={f.tax}
						placeholder="0.00"
					/>
				</div>{/if}
			<div>
				<label class="label" for="tx-cur">Currency</label>
				<select id="tx-cur" class="select" bind:value={f.currency}
					>{#each [...new Set([f.currency, portfolio.cashCurrency, ...COMMON_CURRENCIES])] as c (c)}<option>{c}</option>{/each}</select
				>
			</div>
		</div>
		<div><label class="label" for="tx-notes">Notes</label><input id="tx-notes" class="input" bind:value={f.notes} /></div>
		{#if position !== null}<p class="hint">Position on that date: {fmt.qty(position)} units</p>{/if}
		<p class="total small">
			{f.type === 'buy' ? 'Total cost' : f.type === 'sell' ? 'Net proceeds' : 'Net amount'}:
			<b class="num">{fmt.money(total ?? 0, f.currency)}</b>
		</p>
		{#if errors.length && (f.quantity || f.price || f.amount)}<ul class="errors">
				{#each errors as e (e)}<li class="error-text">{e}</li>{/each}
			</ul>{/if}
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" type="submit" form="tx-form" disabled={errors.length > 0} loading={saving}>Save</Button>
	{/snippet}
</Dialog>

<style>
	.types {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.types button {
		border: 1px solid var(--border-strong);
		background: var(--surface-solid);
		border-radius: 999px;
		padding: 6px 12px;
		font-size: var(--text-sm);
		font-weight: 550;
	}
	.types button.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
	}
	.span {
		grid-column: span 2;
	}
	@media (max-width: 420px) {
		.span {
			grid-column: auto;
		}
	}
	.total {
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}
	.errors {
		margin: 0;
		padding-left: 18px;
	}
</style>
