import { describe, it, expect } from 'vitest';
import { detectFormat, parseDateString, parseNumericValue } from './format-detection';

describe('detectFormat', () => {
  it('detects comma delimiter for US-style CSV', () => {
    const csv = 'Date,Close\n01/15/2024,1234.56\n01/16/2024,1240.78';
    const fmt = detectFormat(csv);
    expect(fmt.delimiter).toBe(',');
  });

  it('detects semicolon delimiter for EU-style CSV', () => {
    const csv = 'Datum;Schluss\n15.01.2024;1.234,56\n16.01.2024;1.240,78';
    const fmt = detectFormat(csv);
    expect(fmt.delimiter).toBe(';');
  });

  it('detects tab delimiter', () => {
    const csv = 'Date\tClose\n2024-01-15\t1234.56\n2024-01-16\t1240.78';
    const fmt = detectFormat(csv);
    expect(fmt.delimiter).toBe('\t');
  });

  it('detects DD.MM.YYYY date format for German CSV', () => {
    const csv = 'Datum;Schluss\n15.01.2024;100,50\n16.01.2024;101,20';
    const fmt = detectFormat(csv);
    expect(fmt.dateFormat).toBe('DD.MM.YYYY');
  });

  it('detects YYYY-MM-DD date format', () => {
    const csv = 'Date,Close\n2024-01-15,100.50\n2024-01-16,101.20';
    const fmt = detectFormat(csv);
    expect(fmt.dateFormat).toBe('YYYY-MM-DD');
  });

  it('detects comma as decimal separator in EU CSV', () => {
    const csv = 'Datum;Kurs\n15.01.2024;1.234,56\n16.01.2024;1.240,78';
    const fmt = detectFormat(csv);
    expect(fmt.decimalSeparator).toBe(',');
  });

  it('detects dot as decimal separator in US CSV', () => {
    const csv = 'Date,Close\n01/15/2024,1234.56\n01/16/2024,1240.78';
    const fmt = detectFormat(csv);
    expect(fmt.decimalSeparator).toBe('.');
  });

  it('detects header row', () => {
    const csv = 'Date,Close,Volume\n2024-01-15,100.50,1000\n2024-01-16,101.20,1200';
    const fmt = detectFormat(csv);
    expect(fmt.hasHeader).toBe(true);
  });

  it('detects no header when first row is data', () => {
    const csv = '2024-01-15,100.50\n2024-01-16,101.20';
    const fmt = detectFormat(csv);
    expect(fmt.hasHeader).toBe(false);
  });

  it('identifies the date column', () => {
    const csv = 'Close,Date\n100.50,2024-01-15\n101.20,2024-01-16';
    const fmt = detectFormat(csv);
    expect(fmt.dateColumn).toBe(1);
  });

  it('identifies close column by header keyword', () => {
    const csv = 'Date,Open,High,Low,Close,Volume\n2024-01-15,100,105,98,103,50000\n2024-01-16,103,108,101,106,55000';
    const fmt = detectFormat(csv);
    expect(fmt.closeColumn).toBe(4); // "Close" header
  });

  it('identifies Schluss column by header keyword (German)', () => {
    const csv = 'Datum;Eroeffnung;Hoch;Tief;Schluss;Volumen\n15.01.2024;100;105;98;103;50000\n16.01.2024;103;108;101;106;55000';
    const fmt = detectFormat(csv);
    expect(fmt.closeColumn).toBe(4); // "Schluss" header
  });

  it('handles full EU-style CSV correctly', () => {
    const csv = [
      'Datum;Eroeffnung;Schluss',
      '15.01.2024;1.234,56;1.250,00',
      '16.01.2024;1.250,00;1.260,50',
      '17.01.2024;1.260,50;1.245,30',
    ].join('\n');
    const fmt = detectFormat(csv);
    expect(fmt.delimiter).toBe(';');
    expect(fmt.dateFormat).toBe('DD.MM.YYYY');
    expect(fmt.decimalSeparator).toBe(',');
    expect(fmt.hasHeader).toBe(true);
  });
});

describe('parseDateString', () => {
  it('parses DD.MM.YYYY', () => {
    expect(parseDateString('15.01.2024', 'DD.MM.YYYY')).toBe('2024-01-15');
    expect(parseDateString('01.12.2023', 'DD.MM.YYYY')).toBe('2023-12-01');
  });

  it('parses YYYY-MM-DD', () => {
    expect(parseDateString('2024-01-15', 'YYYY-MM-DD')).toBe('2024-01-15');
  });

  it('parses MM/DD/YYYY', () => {
    expect(parseDateString('01/15/2024', 'MM/DD/YYYY')).toBe('2024-01-15');
  });

  it('parses DD-MM-YYYY', () => {
    expect(parseDateString('15-01-2024', 'DD-MM-YYYY')).toBe('2024-01-15');
  });

  it('returns null for invalid date', () => {
    expect(parseDateString('invalid', 'YYYY-MM-DD')).toBeNull();
    expect(parseDateString('32.13.2024', 'DD.MM.YYYY')).toBeNull();
  });

  it('returns null for wrong format', () => {
    expect(parseDateString('2024-01-15', 'DD.MM.YYYY')).toBeNull();
  });
});

describe('parseNumericValue', () => {
  it('parses dot-decimal numbers', () => {
    expect(parseNumericValue('1234.56', '.')).toBe(1234.56);
  });

  it('parses comma-decimal numbers', () => {
    expect(parseNumericValue('1234,56', ',')).toBe(1234.56);
  });

  it('strips thousand separators (dot-decimal)', () => {
    expect(parseNumericValue('1,234.56', '.')).toBe(1234.56);
  });

  it('strips thousand separators (comma-decimal)', () => {
    expect(parseNumericValue('1.234,56', ',')).toBe(1234.56);
  });

  it('returns null for empty string', () => {
    expect(parseNumericValue('', '.')).toBeNull();
    expect(parseNumericValue('  ', '.')).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parseNumericValue('abc', '.')).toBeNull();
  });
});
