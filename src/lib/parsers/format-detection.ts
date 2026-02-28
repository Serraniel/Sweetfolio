/**
 * Auto-detect CSV format: delimiter, date format, decimal separator,
 * header presence, and which columns are date and close price.
 * EU formats (German/European) are prioritized in ambiguous cases.
 */

import type { DetectedFormat } from '$lib/types';
import { parseCSVRows } from './csv';

const SAMPLE_SIZE = 20;

const DATE_PATTERNS: Array<{ format: string; regex: RegExp; parse: (m: RegExpMatchArray) => { y: number; m: number; d: number } }> = [
  {
    format: 'DD.MM.YYYY',
    regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    parse: (m) => ({ d: parseInt(m[1]), m: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  {
    format: 'DD-MM-YYYY',
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    parse: (m) => ({ d: parseInt(m[1]), m: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  {
    format: 'DD/MM/YYYY',
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: (m) => ({ d: parseInt(m[1]), m: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  {
    format: 'YYYY-MM-DD',
    regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    parse: (m) => ({ y: parseInt(m[1]), m: parseInt(m[2]), d: parseInt(m[3]) }),
  },
  {
    format: 'MM/DD/YYYY',
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: (m) => ({ m: parseInt(m[1]), d: parseInt(m[2]), y: parseInt(m[3]) }),
  },
  {
    format: 'MM-DD-YYYY',
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    parse: (m) => ({ m: parseInt(m[1]), d: parseInt(m[2]), y: parseInt(m[3]) }),
  },
];

/**
 * Returns true when format detection is fully unambiguous:
 * - date format is not ambiguous (DD/MM vs MM/DD)
 * - delimiter was detected with consistent usage across rows
 * - a date column was positively identified (score > 0)
 * - a close column was positively identified (header keyword or strong numeric match)
 */
export function isFormatConfident(text: string, format: DetectedFormat): boolean {
  if (format.ambiguous) return false;

  // Verify date column scored well: re-parse sample and check match rate
  const rows = parseCSVRows(text, format.delimiter);
  const hasHeader = format.hasHeader;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const sample = dataRows.slice(0, SAMPLE_SIZE);

  if (sample.length < 2) return false;

  // Check that most sampled rows have a parsable date in the date column
  const datePattern = DATE_PATTERNS.find((p) => p.format === format.dateFormat);
  if (!datePattern) return false;

  let dateHits = 0;
  for (const row of sample) {
    const cell = (row[format.dateColumn] || '').trim();
    const m = cell.match(datePattern.regex);
    if (m) {
      const parsed = datePattern.parse(m);
      if (parsed.m >= 1 && parsed.m <= 12 && parsed.d >= 1 && parsed.d <= 31 && parsed.y >= 1900 && parsed.y <= 2100) {
        dateHits++;
      }
    }
  }
  if (dateHits < sample.length * 0.9) return false;

  // Check that most sampled rows have a parsable number in the close column
  let numericHits = 0;
  for (const row of sample) {
    const cell = (row[format.closeColumn] || '').trim();
    if (isNumericValue(cell, format.decimalSeparator)) {
      numericHits++;
    }
  }
  if (numericHits < sample.length * 0.9) return false;

  // Check that date and close columns are different
  if (format.dateColumn === format.closeColumn) return false;

  return true;
}

export function detectFormat(text: string): DetectedFormat {
  const delimiter = detectDelimiter(text);
  const rows = parseCSVRows(text, delimiter);
  const hasHeader = detectHeader(rows);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const sample = dataRows.slice(0, SAMPLE_SIZE);
  const decimalSeparator = detectDecimalSeparator(sample, delimiter);
  const { dateColumn, dateFormat, ambiguous } = detectDateColumn(sample);
  const closeColumn = detectCloseColumn(rows, hasHeader, dateColumn, decimalSeparator);

  return {
    delimiter,
    decimalSeparator,
    dateFormat,
    hasHeader,
    dateColumn,
    closeColumn,
    ambiguous,
  };
}

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, SAMPLE_SIZE);
  const candidates = [
    { delim: ';', count: 0 },
    { delim: ',', count: 0 },
    { delim: '\t', count: 0 },
  ];

  for (const line of lines) {
    for (const c of candidates) {
      c.count += countUnquoted(line, c.delim);
    }
  }

  // Semicolon is preferred in EU CSVs -- prioritize it if it appears consistently
  candidates.sort((a, b) => b.count - a.count);

  // If semicolon has a reasonable count, prefer it (EU priority)
  const semicolonCandidate = candidates.find((c) => c.delim === ';');
  if (semicolonCandidate && semicolonCandidate.count >= lines.length) {
    return ';';
  }

  return candidates[0].delim;
}

function countUnquoted(line: string, char: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === char && !inQuotes) count++;
  }
  return count;
}

function detectHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const firstRow = rows[0];
  const secondRow = rows[1];

  // If first row has cells that look non-numeric and second row has numeric-looking cells
  let firstRowNumeric = 0;
  let secondRowNumeric = 0;
  for (let i = 0; i < Math.min(firstRow.length, secondRow.length); i++) {
    if (looksNumeric(firstRow[i])) firstRowNumeric++;
    if (looksNumeric(secondRow[i])) secondRowNumeric++;
  }

  return secondRowNumeric > firstRowNumeric;
}

function looksNumeric(value: string): boolean {
  const v = value.trim();
  // Matches numbers like 1234.56, 1.234,56, 1234,56, etc.
  return /^-?[\d.,]+$/.test(v) && /\d/.test(v);
}

function detectDecimalSeparator(sample: string[][], delimiter: string): string {
  // Look at numeric-looking cells (not date cells)
  let commaAsDecimal = 0;
  let dotAsDecimal = 0;

  for (const row of sample) {
    for (const cell of row) {
      const v = cell.trim();
      // Pattern like "1.234,56" or "1234,56" -> comma is decimal
      if (/^\d{1,3}(\.\d{3})*,\d+$/.test(v) || /^\d+,\d{1,2}$/.test(v)) {
        commaAsDecimal++;
      }
      // Pattern like "1,234.56" or "1234.56" -> dot is decimal
      if (/^\d{1,3}(,\d{3})*\.\d+$/.test(v) || /^\d+\.\d{1,2}$/.test(v)) {
        dotAsDecimal++;
      }
    }
  }

  // EU priority: if comma-as-decimal is plausible, prefer it
  if (commaAsDecimal > 0 && commaAsDecimal >= dotAsDecimal) return ',';
  if (dotAsDecimal > 0) return '.';

  // When delimiter is semicolon, EU format is likely -> comma as decimal
  if (delimiter === ';') return ',';

  return '.';
}

function detectDateColumn(sample: string[][]): { dateColumn: number; dateFormat: string; ambiguous: boolean } {
  if (sample.length === 0 || sample[0].length === 0) {
    return { dateColumn: 0, dateFormat: 'YYYY-MM-DD', ambiguous: false };
  }

  const colCount = sample[0].length;
  let bestCol = 0;
  let bestFormat = 'YYYY-MM-DD';
  let bestScore = 0;

  // Track all formats that achieve the best score to detect ambiguity
  const topFormats: string[] = [];

  for (let col = 0; col < colCount; col++) {
    const values = sample.map((row) => (row[col] || '').trim()).filter((v) => v !== '');
    for (const pattern of DATE_PATTERNS) {
      let valid = 0;
      for (const v of values) {
        const m = v.match(pattern.regex);
        if (m) {
          const parsed = pattern.parse(m);
          if (parsed.m >= 1 && parsed.m <= 12 && parsed.d >= 1 && parsed.d <= 31 && parsed.y >= 1900 && parsed.y <= 2100) {
            valid++;
          }
        }
      }
      if (valid > bestScore) {
        bestScore = valid;
        bestCol = col;
        bestFormat = pattern.format;
        topFormats.length = 0;
        topFormats.push(pattern.format);
      } else if (valid === bestScore && valid > 0) {
        topFormats.push(pattern.format);
      }
    }
  }

  // Ambiguous when DD/MM and MM/DD formats both match equally well
  const ambiguous = topFormats.length > 1 && topFormats.some((f) => f.includes('DD/MM') || f.includes('DD-MM') || f.includes('DD.MM'))
    && topFormats.some((f) => f.includes('MM/DD') || f.includes('MM-DD'));

  return { dateColumn: bestCol, dateFormat: bestFormat, ambiguous };
}

function detectCloseColumn(
  rows: string[][],
  hasHeader: boolean,
  dateColumn: number,
  decimalSeparator: string,
): number {
  // If there's a header, look for keywords
  if (hasHeader && rows.length > 0) {
    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const closeKeywords = ['close', 'schluss', 'schlusskurs', 'adj close', 'adj. close', 'last', 'kurs', 'price', 'preis'];
    for (const keyword of closeKeywords) {
      const idx = headers.findIndex((h) => h.includes(keyword));
      if (idx !== -1 && idx !== dateColumn) return idx;
    }
  }

  // Fallback: pick the last numeric column that isn't the date column
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const sample = dataRows.slice(0, SAMPLE_SIZE);
  const colCount = rows[0]?.length ?? 0;

  for (let col = colCount - 1; col >= 0; col--) {
    if (col === dateColumn) continue;
    const numericCount = sample.filter((row) => {
      const val = (row[col] || '').trim();
      return isNumericValue(val, decimalSeparator);
    }).length;
    if (numericCount >= sample.length * 0.8) return col;
  }

  // Last resort: first column that isn't the date
  return dateColumn === 0 ? 1 : 0;
}

function isNumericValue(value: string, decimalSeparator: string): boolean {
  if (!value) return false;
  let v = value;
  if (decimalSeparator === ',') {
    v = v.replace(/\./g, '').replace(',', '.');
  } else {
    v = v.replace(/,/g, '');
  }
  return !isNaN(parseFloat(v)) && isFinite(parseFloat(v));
}

/**
 * Parse a date string according to a detected format, returning an ISO date (YYYY-MM-DD).
 */
export function parseDateString(value: string, format: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    if (pattern.format !== format) continue;
    const m = value.trim().match(pattern.regex);
    if (!m) return null;
    const parsed = pattern.parse(m);
    if (parsed.m < 1 || parsed.m > 12 || parsed.d < 1 || parsed.d > 31) return null;
    const yStr = String(parsed.y);
    const mStr = String(parsed.m).padStart(2, '0');
    const dStr = String(parsed.d).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  }
  return null;
}

/**
 * Parse a numeric value according to the detected decimal separator.
 */
export function parseNumericValue(value: string, decimalSeparator: string): number | null {
  let v = value.trim();
  if (!v) return null;
  if (decimalSeparator === ',') {
    v = v.replace(/\./g, '').replace(',', '.');
  } else {
    v = v.replace(/,/g, '');
  }
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}
