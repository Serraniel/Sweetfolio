/** Minimal typed Parqet Connect API client (EX-5). */
import { PARQET_API } from './oauth.ts';

export interface ParqetPortfolio {
	id: string;
	name: string;
	currency: string;
	createdAt?: string;
}

export type ParqetActivityType =
	'buy' | 'sell' | 'dividend' | 'interest' | 'transfer_in' | 'transfer_out' | 'fees_taxes' | 'deposit' | 'withdrawal';

export interface ParqetActivity {
	id: string;
	type: ParqetActivityType | string;
	holdingId?: string;
	holdingAssetType?: string;
	shares?: number;
	price?: number;
	amount?: number;
	tax?: number;
	fee?: number;
	currency?: string;
	datetime: string;
	description?: string;
	asset?: { isin?: string; symbol?: string; name?: string; wkn?: string };
}

export class ParqetClient {
	constructor(
		private readonly getToken: () => Promise<string>,
		private readonly fetcher: typeof fetch = (...a) => fetch(...a)
	) {}

	private async get<T>(path: string): Promise<T> {
		const res = await this.fetcher(`${PARQET_API}${path}`, { headers: { Authorization: `Bearer ${await this.getToken()}` } });
		if (res.status === 401) throw new Error('Parqet session expired. Please connect again.');
		if (!res.ok) throw new Error(`Parqet API error ${res.status}`);
		return res.json() as Promise<T>;
	}

	async portfolios(): Promise<ParqetPortfolio[]> {
		const r = await this.get<{ items?: ParqetPortfolio[] } | ParqetPortfolio[]>('/portfolios');
		return Array.isArray(r) ? r : (r.items ?? []);
	}

	async activities(portfolioId: string, onPage?: (count: number) => void): Promise<ParqetActivity[]> {
		const all: ParqetActivity[] = [];
		let cursor: string | null = null;
		for (let page = 0; page < 1000; page++) {
			const q = new URLSearchParams({ limit: '500' });
			if (cursor) q.set('cursor', cursor);
			const r: { activities?: ParqetActivity[]; items?: ParqetActivity[]; cursor?: string | null } = await this.get(
				`/portfolios/${encodeURIComponent(portfolioId)}/activities?${q}`
			);
			all.push(...(r.activities ?? r.items ?? []));
			onPage?.(all.length);
			cursor = r.cursor ?? null;
			if (!cursor) break;
		}
		return all;
	}
}
