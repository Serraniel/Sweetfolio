import { describe, it, expect } from 'vitest';
import { parseCSV } from './normalization';

describe('parseCSV', () => {
  it('parses US-style CSV with header', () => {
    const csv = [
      'Date,Open,High,Low,Close,Volume',
      '01/15/2024,100.00,105.00,98.00,103.50,50000',
      '01/16/2024,103.50,108.00,101.00,106.25,55000',
    ].join('\n');

    const result = parseCSV(csv);
    expect(result.prices).toHaveLength(2);
    expect(result.prices[0].date).toBe('2024-01-15');
    expect(result.prices[0].close).toBeCloseTo(103.5, 2);
    expect(result.prices[1].date).toBe('2024-01-16');
    expect(result.prices[1].close).toBeCloseTo(106.25, 2);
    expect(result.warnings).toHaveLength(0);
    expect(result.rowCount).toBe(2);
  });

  it('parses EU-style CSV (semicolon, comma decimal, DD.MM.YYYY)', () => {
    const csv = [
      'Datum;Schluss',
      '15.01.2024;1.234,56',
      '16.01.2024;1.240,78',
    ].join('\n');

    const result = parseCSV(csv);
    expect(result.prices).toHaveLength(2);
    expect(result.prices[0].date).toBe('2024-01-15');
    expect(result.prices[0].close).toBeCloseTo(1234.56, 2);
    expect(result.prices[1].date).toBe('2024-01-16');
    expect(result.prices[1].close).toBeCloseTo(1240.78, 2);
  });

  it('parses YYYY-MM-DD format', () => {
    const csv = 'Date,Close\n2024-01-15,100.50\n2024-01-16,101.20';
    const result = parseCSV(csv);
    expect(result.prices).toHaveLength(2);
    expect(result.prices[0].date).toBe('2024-01-15');
  });

  it('sorts output by date ascending', () => {
    const csv = 'Date,Close\n2024-01-20,110\n2024-01-10,100\n2024-01-15,105';
    const result = parseCSV(csv);
    expect(result.prices[0].date).toBe('2024-01-10');
    expect(result.prices[1].date).toBe('2024-01-15');
    expect(result.prices[2].date).toBe('2024-01-20');
  });

  it('generates warnings for unparseable rows', () => {
    const csv = 'Date,Close\n2024-01-15,100\ninvalid,abc\n2024-01-16,110';
    const result = parseCSV(csv);
    expect(result.prices).toHaveLength(2);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('handles format override', () => {
    const csv = '15.01.2024;100,50\n16.01.2024;101,20';
    const result = parseCSV(csv, {
      delimiter: ';',
      dateFormat: 'DD.MM.YYYY',
      decimalSeparator: ',',
      dateColumn: 0,
      closeColumn: 1,
      hasHeader: false,
    });
    expect(result.prices).toHaveLength(2);
    expect(result.prices[0].close).toBeCloseTo(100.5, 2);
  });

  it('handles CSV without header', () => {
    const csv = '2024-01-15,100.50\n2024-01-16,101.20';
    const result = parseCSV(csv);
    expect(result.prices).toHaveLength(2);
  });

  it('handles empty CSV', () => {
    const result = parseCSV('');
    expect(result.prices).toHaveLength(0);
  });
});
