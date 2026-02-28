/**
 * Shared types for data fetcher modules.
 */

import type { PricePoint } from '$lib/types';

/** Result from a successful price data fetch. */
export interface FetchResult {
  prices: PricePoint[];
  name: string | null;
  isin: string | null;
  wkn: string | null;
  currency: string | null;
}

/** Error from a failed fetch attempt. */
export interface FetchError {
  message: string;
  recoverable: boolean;
}

export type FetchOutcome =
  | { success: true; data: FetchResult }
  | { success: false; error: FetchError };
