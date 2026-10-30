import type { AssetClassification, PricePoint } from '#lib/domain/types.ts';

export interface InstrumentData {
	prices: PricePoint[];
	name: string | null;
	isin: string | null;
	wkn: string | null;
	currency: string | null;
	classification: AssetClassification | null;
	source: string;
}

export interface InstrumentInfo {
	name: string;
	isin: string | null;
	wkn: string | null;
	currency: string | null;
	classification: AssetClassification | null;
}

export type FetchOutcome = { ok: true; data: InstrumentData } | { ok: false; error: string };
