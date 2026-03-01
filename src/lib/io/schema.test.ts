import { describe, it, expect } from 'vitest';
import {
  CURRENT_VERSION,
  ALL_SCOPES,
  type SweetfolioExport,
  type SweetfolioScope,
  isValidExportEnvelope,
} from './schema';

describe('schema', () => {
  it('CURRENT_VERSION is a positive integer', () => {
    expect(CURRENT_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(CURRENT_VERSION)).toBe(true);
  });

  it('ALL_SCOPES contains all five categories', () => {
    expect(ALL_SCOPES).toEqual(['assets', 'portfolios', 'settings', 'currencies', 'simulations']);
  });

  it('isValidExportEnvelope accepts valid envelope', () => {
    const valid: SweetfolioExport = {
      format: 'sweetfolio',
      version: 1,
      exportedAt: '2026-02-28T12:00:00Z',
      scopes: ['assets'],
      data: { assets: [] },
    };
    expect(isValidExportEnvelope(valid)).toBe(true);
  });

  it('isValidExportEnvelope rejects missing format', () => {
    expect(isValidExportEnvelope({ version: 1 })).toBe(false);
  });

  it('isValidExportEnvelope rejects wrong format string', () => {
    expect(isValidExportEnvelope({ format: 'other', version: 1, exportedAt: '', scopes: [], data: {} })).toBe(false);
  });

  it('isValidExportEnvelope rejects non-integer version', () => {
    expect(isValidExportEnvelope({ format: 'sweetfolio', version: 1.5, exportedAt: '', scopes: [], data: {} })).toBe(false);
  });

  it('isValidExportEnvelope rejects version below 1', () => {
    expect(isValidExportEnvelope({ format: 'sweetfolio', version: 0, exportedAt: '', scopes: [], data: {} })).toBe(false);
  });
});
