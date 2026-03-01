import { describe, it, expect } from 'vitest';
import { parseImportFile } from './import';
import { CURRENT_VERSION } from './schema';

function makeBlob(obj: unknown): File {
  const json = JSON.stringify(obj);
  return new File([json], 'test.json', { type: 'application/json' });
}

describe('parseImportFile', () => {
  it('parses a valid export file', async () => {
    const file = makeBlob({
      format: 'sweetfolio',
      version: CURRENT_VERSION,
      exportedAt: '2026-01-01T00:00:00Z',
      scopes: ['assets'],
      data: { assets: [] },
    });
    const result = await parseImportFile(file);
    expect(result.format).toBe('sweetfolio');
    expect(result.scopes).toEqual(['assets']);
  });

  it('rejects non-JSON file', async () => {
    const file = new File(['not json'], 'test.json', { type: 'application/json' });
    await expect(parseImportFile(file)).rejects.toThrow('Invalid JSON');
  });

  it('rejects file with wrong format', async () => {
    const file = makeBlob({ format: 'other', version: 1 });
    await expect(parseImportFile(file)).rejects.toThrow('not a valid Sweetfolio export');
  });

  it('rejects file with future version', async () => {
    const file = makeBlob({
      format: 'sweetfolio',
      version: 9999,
      exportedAt: '',
      scopes: [],
      data: {},
    });
    await expect(parseImportFile(file)).rejects.toThrow('newer than supported');
  });
});
