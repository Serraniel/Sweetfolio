import { describe, it, expect } from 'vitest';
import { migrateToLatest } from './migrations';
import { CURRENT_VERSION } from './schema';

describe('migrateToLatest', () => {
  it('returns data unchanged when version matches current', () => {
    const data = {
      format: 'sweetfolio' as const,
      version: CURRENT_VERSION,
      exportedAt: '2026-01-01T00:00:00Z',
      scopes: ['assets' as const],
      data: { assets: [] },
    };
    const result = migrateToLatest(data);
    expect(result).toEqual(data);
  });

  it('throws for unknown future version', () => {
    const data = {
      format: 'sweetfolio' as const,
      version: 9999,
      exportedAt: '',
      scopes: [],
      data: {},
    };
    expect(() => migrateToLatest(data)).toThrow();
  });
});
