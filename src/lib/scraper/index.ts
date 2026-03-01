/**
 * ISIN/WKN scraper module (best-effort, client-side).
 *
 * This module provides a client-side interface for fetching historical price data
 * by ISIN or WKN from public financial data sources. All requests are made directly
 * from the browser — no server-side proxy is used.
 *
 * IMPORTANT: This feature is experimental and best-effort. It may fail due to:
 * - CORS restrictions on target APIs
 * - Rate limiting
 * - API changes or deprecation
 * - Network connectivity issues
 *
 * On failure, users should fall back to manual CSV upload.
 */

import type { PricePoint, AssetClassification } from '$lib/types';

export interface ScraperResult {
  prices: PricePoint[];
  name: string | null;
  currency: string | null;
  source: string;
  classification: AssetClassification | null;
}

export interface ScraperError {
  message: string;
  source: string;
  recoverable: boolean;
}

export type ScraperOutcome =
  | { success: true; data: ScraperResult }
  | { success: false; error: ScraperError };

/**
 * Validate an ISIN (International Securities Identification Number).
 * Must be exactly 12 alphanumeric characters.
 */
export function validateISIN(isin: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin.toUpperCase());
}

/**
 * Validate a WKN (Wertpapierkennnummer).
 * Must be exactly 6 alphanumeric characters.
 */
export function validateWKN(wkn: string): boolean {
  return /^[A-Z0-9]{6}$/.test(wkn.toUpperCase());
}

/**
 * Validate a crypto ticker symbol.
 * Must be 2-10 alphanumeric characters, and must NOT match ISIN or WKN patterns
 * (those are checked first in the UI detection flow).
 */
export function validateTicker(ticker: string): boolean {
  const upper = ticker.toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(upper)) return false;
  if (validateISIN(upper)) return false;
  if (validateWKN(upper)) return false;
  return true;
}

/**
 * Attempt to fetch historical price data by ISIN.
 *
 * Tries available data sources in order until one succeeds.
 * Returns a ScraperOutcome indicating success or failure.
 */
export async function fetchByISIN(isin: string): Promise<ScraperOutcome> {
  if (!validateISIN(isin)) {
    return {
      success: false,
      error: {
        message: `Invalid ISIN format: "${isin}". Expected 12-character alphanumeric code starting with a 2-letter country code.`,
        source: 'validation',
        recoverable: false,
      },
    };
  }

  // Try each data source in order
  for (const source of DATA_SOURCES) {
    try {
      const result = await source.fetchByISIN(isin.toUpperCase());
      if (result) {
        return { success: true, data: { ...result, source: source.name } };
      }
    } catch {
      // Source failed, try next
      continue;
    }
  }

  return {
    success: false,
    error: {
      message: `Could not fetch data for ISIN ${isin}. All data sources failed. Please upload a CSV file instead.`,
      source: 'all',
      recoverable: true,
    },
  };
}

/**
 * Attempt to fetch historical price data by WKN.
 *
 * Tries available data sources in order until one succeeds.
 * Returns a ScraperOutcome indicating success or failure.
 */
export async function fetchByWKN(wkn: string): Promise<ScraperOutcome> {
  if (!validateWKN(wkn)) {
    return {
      success: false,
      error: {
        message: `Invalid WKN format: "${wkn}". Expected 6-character alphanumeric code.`,
        source: 'validation',
        recoverable: false,
      },
    };
  }

  for (const source of DATA_SOURCES) {
    if (!source.fetchByWKN) continue;
    try {
      const result = await source.fetchByWKN(wkn.toUpperCase());
      if (result) {
        return { success: true, data: { ...result, source: source.name } };
      }
    } catch {
      continue;
    }
  }

  return {
    success: false,
    error: {
      message: `Could not fetch data for WKN ${wkn}. All data sources failed. Please upload a CSV file instead.`,
      source: 'all',
      recoverable: true,
    },
  };
}

// --- Data source interface ---

interface DataSource {
  name: string;
  fetchByISIN(isin: string): Promise<Omit<ScraperResult, 'source'> | null>;
  fetchByWKN?(wkn: string): Promise<Omit<ScraperResult, 'source'> | null>;
}

/**
 * Registered data sources, tried in order.
 *
 * To add a new source, create a module that implements the DataSource interface
 * and push it to this array.
 */
const DATA_SOURCES: DataSource[] = [];

/**
 * Register a new data source for fetching price data.
 * Sources are tried in the order they are registered.
 */
export function registerDataSource(source: DataSource): void {
  DATA_SOURCES.push(source);
}

// --- Register built-in data sources ---

import { fetchPriceData as onvistaFetch } from '$lib/fetchers/onvista';

registerDataSource({
  name: 'onvista',
  async fetchByISIN(isin) {
    const outcome = await onvistaFetch(isin);
    if (!outcome.success) return null;
    return {
      prices: outcome.data.prices,
      name: outcome.data.name,
      currency: outcome.data.currency,
      classification: outcome.data.classification,
    };
  },
  async fetchByWKN(wkn) {
    const outcome = await onvistaFetch(wkn);
    if (!outcome.success) return null;
    return {
      prices: outcome.data.prices,
      name: outcome.data.name,
      currency: outcome.data.currency,
      classification: outcome.data.classification,
    };
  },
});

import { fetchPriceData as alphaVantageFetch } from '$lib/fetchers/alphavantage';
import { get } from 'svelte/store';
import { settings } from '$lib/stores/settings';

registerDataSource({
  name: 'alphavantage',
  async fetchByISIN(isin) {
    const apiKey = get(settings).alphaVantageApiKey as string | undefined;
    if (!apiKey) return null;
    const outcome = await alphaVantageFetch(isin, apiKey);
    if (!outcome.success) return null;
    return {
      prices: outcome.data.prices,
      name: outcome.data.name,
      currency: outcome.data.currency,
      classification: outcome.data.classification,
    };
  },
  async fetchByWKN(wkn) {
    const apiKey = get(settings).alphaVantageApiKey as string | undefined;
    if (!apiKey) return null;
    const outcome = await alphaVantageFetch(wkn, apiKey);
    if (!outcome.success) return null;
    return {
      prices: outcome.data.prices,
      name: outcome.data.name,
      currency: outcome.data.currency,
      classification: outcome.data.classification,
    };
  },
});
