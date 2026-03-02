import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases text', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('my portfolio')).toBe('my-portfolio');
  });

  it('replaces special characters with hyphens', () => {
    expect(slugify('MSCI World (USD)')).toBe('msci-world-usd');
  });

  it('collapses consecutive hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
    expect(slugify('  hello  ')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles pure special characters', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('preserves numbers', () => {
    expect(slugify('S&P 500 Index')).toBe('s-p-500-index');
  });

  it('handles German umlauts and accented characters', () => {
    // Non-ASCII characters are replaced with hyphens
    expect(slugify('Dürr AG')).toBe('d-rr-ag');
  });
});
