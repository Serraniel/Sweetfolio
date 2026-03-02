import { writable } from 'svelte/store';
import type { Transaction } from '$lib/types';
import * as txStorage from '$lib/storage/transactions';

export const transactions = writable<Transaction[]>([]);

export async function loadTransactions(): Promise<void> {
	const all = await txStorage.getAll();
	transactions.set(all);
}

export async function loadTransactionsByPortfolio(portfolioId: string): Promise<Transaction[]> {
	return txStorage.getByPortfolioId(portfolioId);
}

export async function addTransaction(tx: Transaction): Promise<void> {
	const plain = JSON.parse(JSON.stringify(tx));
	await txStorage.put(plain);
	transactions.update((all) => [...all, plain]);
}

export async function updateTransaction(tx: Transaction): Promise<void> {
	const plain = JSON.parse(JSON.stringify(tx));
	await txStorage.put(plain);
	transactions.update((all) => all.map((t) => (t.id === tx.id ? plain : t)));
}

export async function removeTransaction(id: string): Promise<void> {
	await txStorage.remove(id);
	transactions.update((all) => all.filter((t) => t.id !== id));
}

export async function removeTransactionsByPortfolio(portfolioId: string): Promise<void> {
	await txStorage.removeByPortfolioId(portfolioId);
	transactions.update((all) => all.filter((t) => t.portfolioId !== portfolioId));
}
