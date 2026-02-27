import { describe, it, expect } from 'vitest';
import { parseCSVRows } from './csv';

describe('parseCSVRows', () => {
  it('parses comma-delimited CSV', () => {
    const text = 'a,b,c\n1,2,3\n4,5,6';
    const rows = parseCSVRows(text, ',');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('parses semicolon-delimited CSV', () => {
    const text = 'a;b;c\n1;2;3';
    const rows = parseCSVRows(text, ';');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('parses tab-delimited CSV', () => {
    const text = 'a\tb\tc\n1\t2\t3';
    const rows = parseCSVRows(text, '\t');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with commas', () => {
    const text = '"hello, world",b,c';
    const rows = parseCSVRows(text, ',');
    expect(rows[0][0]).toBe('hello, world');
  });

  it('handles escaped quotes', () => {
    const text = '"say ""hello""",b';
    const rows = parseCSVRows(text, ',');
    expect(rows[0][0]).toBe('say "hello"');
  });

  it('skips empty lines', () => {
    const text = 'a,b\n\nc,d\n';
    const rows = parseCSVRows(text, ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles \\r\\n line endings', () => {
    const text = 'a,b\r\nc,d\r\n';
    const rows = parseCSVRows(text, ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('trims whitespace from fields', () => {
    const text = ' a , b \nc , d ';
    const rows = parseCSVRows(text, ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});
