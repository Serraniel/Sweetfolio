/**
 * ECB exchange rate fetcher.
 * Fetches daily reference exchange rates from the ECB SDMX API (full CORS, no API key).
 * Rates are quoted as "units of foreign currency per 1 EUR".
 *
 * Endpoint format:
 *   https://data-api.ecb.europa.eu/service/data/EXR/D.{CCY}.EUR.SP00.A
 *     ?startPeriod=YYYY-MM-DD&endPeriod=YYYY-MM-DD&format=csvdata
 *
 * The CSV response has many columns; we only need TIME_PERIOD and OBS_VALUE.
 */

import type { CurrencyRate } from '$lib/types';

const ECB_BASE_URL = 'https://data-api.ecb.europa.eu/service/data/EXR';

export interface FetchECBRatesOptions {
  /** ISO 4217 currency code, e.g. "USD", "GBP", "CHF". */
  currency: string;
  /** Start date (YYYY-MM-DD). Defaults to 1999-01-04 (ECB euro inception). */
  startPeriod?: string;
  /** End date (YYYY-MM-DD). Defaults to today. */
  endPeriod?: string;
}

/**
 * Fetch daily exchange rates from the ECB for a given currency against EUR.
 * Returns a CurrencyRate with pair formatted as "{CCY}EUR" (e.g. "USDEUR"),
 * matching the convention used by the existing currency engine.
 *
 * The rate value represents how many units of `currency` equal 1 EUR.
 * For example, USDEUR rate of 1.08 means 1 EUR = 1.08 USD.
 *
 * @throws Error if the fetch fails or the response cannot be parsed.
 */
export async function fetchECBRates(options: FetchECBRatesOptions): Promise<CurrencyRate> {
  const { currency, startPeriod, endPeriod } = options;
  const ccy = currency.toUpperCase();

  if (ccy === 'EUR') {
    return { pair: 'EUREUR', rates: [] };
  }

  if (!/^[A-Z]{3}$/.test(ccy)) {
    throw new Error(`Invalid currency code: ${ccy}`);
  }

  const url = buildURL(ccy, startPeriod, endPeriod);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ECB API request failed: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const rates = parseECBCSV(text);

  return {
    pair: `${ccy}EUR`,
    rates,
  };
}

/**
 * List of commonly available ECB reference currencies.
 * The ECB publishes daily rates for these against EUR.
 */
export const ECB_CURRENCIES = [
  'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'SEK', 'NOK', 'DKK',
  'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'HRK', 'ISK', 'TRY', 'BRL',
  'CNY', 'HKD', 'IDR', 'ILS', 'INR', 'KRW', 'MXN', 'MYR', 'NZD',
  'PHP', 'SGD', 'THB', 'ZAR',
] as const;

function buildURL(ccy: string, startPeriod?: string, endPeriod?: string): string {
  const path = `${ECB_BASE_URL}/D.${ccy}.EUR.SP00.A`;
  const params = new URLSearchParams({ format: 'csvdata' });

  if (startPeriod) params.set('startPeriod', startPeriod);
  if (endPeriod) params.set('endPeriod', endPeriod);

  return `${path}?${params.toString()}`;
}

/**
 * Parse ECB SDMX CSV response into rate entries.
 * Extracts TIME_PERIOD (column index) and OBS_VALUE from each data row.
 */
function parseECBCSV(text: string): Array<{ date: string; rate: number }> {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  const timeIdx = headers.indexOf('TIME_PERIOD');
  const valueIdx = headers.indexOf('OBS_VALUE');

  if (timeIdx === -1 || valueIdx === -1) {
    throw new Error(
      'ECB CSV response missing expected columns (TIME_PERIOD, OBS_VALUE)',
    );
  }

  const rates: Array<{ date: string; rate: number }> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    const fields = parseCSVLine(line);
    const date = fields[timeIdx]?.trim();
    const valueStr = fields[valueIdx]?.trim();

    if (!date || !valueStr) continue;

    const rate = parseFloat(valueStr);
    if (isNaN(rate) || rate <= 0) continue;

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    rates.push({ date, rate });
  }

  rates.sort((a, b) => a.date.localeCompare(b.date));
  return rates;
}

/**
 * Minimal CSV line parser that handles quoted fields.
 * The ECB CSV contains quoted fields with commas (e.g. in TITLE_COMPL).
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}
