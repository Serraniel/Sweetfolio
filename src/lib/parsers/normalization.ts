/**
 * Normalize parsed CSV data into PricePoint[] with ISO dates.
 */

import type { DetectedFormat, ParseResult, PricePoint } from '$lib/types';
import { parseCSVRows } from './csv';
import { detectFormat, parseDateString, parseNumericValue } from './format-detection';

/**
 * Parse a raw CSV string into normalized PricePoint[] data.
 * Optionally accepts a pre-detected format; otherwise auto-detects.
 */
export function parseCSV(
  text: string,
  formatOverride?: Partial<DetectedFormat>,
): ParseResult {
  const detected = detectFormat(text);
  const format: DetectedFormat = { ...detected, ...formatOverride };
  const rows = parseCSVRows(text, format.delimiter);
  const dataRows = format.hasHeader ? rows.slice(1) : rows;

  const prices: PricePoint[] = [];
  const warnings: string[] = [];
  let rowCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;
    rowCount++;

    const dateRaw = row[format.dateColumn];
    const closeRaw = row[format.closeColumn];

    if (!dateRaw || !closeRaw) {
      warnings.push(`Row ${i + 1}: missing date or close value`);
      continue;
    }

    const date = parseDateString(dateRaw, format.dateFormat);
    if (!date) {
      warnings.push(`Row ${i + 1}: could not parse date "${dateRaw}"`);
      continue;
    }

    const close = parseNumericValue(closeRaw, format.decimalSeparator);
    if (close === null) {
      warnings.push(`Row ${i + 1}: could not parse number "${closeRaw}"`);
      continue;
    }

    prices.push({ date, close });
  }

  // Sort by date ascending
  prices.sort((a, b) => a.date.localeCompare(b.date));

  return {
    prices,
    detectedFormat: format,
    warnings,
    rowCount,
  };
}
