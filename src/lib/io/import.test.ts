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

  it('parses a file with strategies scope', async () => {
    const file = makeBlob({
      format: 'sweetfolio',
      version: CURRENT_VERSION,
      exportedAt: '2026-01-01T00:00:00Z',
      scopes: ['strategies'],
      data: {
        strategies: [
          {
            id: 's1',
            name: 'Test',
            root: { type: 'group', id: 'r', label: 'Root', weight: 1, children: [] },
            generatedPortfolioIds: [],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });
    const result = await parseImportFile(file);
    expect(result.data.strategies).toHaveLength(1);
    expect(result.data.strategies![0].name).toBe('Test');
  });

  it('migrates v2 file to current version', async () => {
    const file = makeBlob({
      format: 'sweetfolio',
      version: 2,
      exportedAt: '2026-01-01T00:00:00Z',
      scopes: ['assets'],
      data: { assets: [] },
    });
    const result = await parseImportFile(file);
    expect(result.version).toBe(CURRENT_VERSION);
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
