import type { SweetfolioExport } from './schema';
import { isValidExportEnvelope } from './schema';
import { migrateToLatest } from './migrations';

export async function parseImportFile(file: File): Promise<SweetfolioExport> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON: the file could not be parsed.');
  }

  if (!isValidExportEnvelope(parsed)) {
    throw new Error('This is not a valid Sweetfolio export file.');
  }

  return migrateToLatest(parsed);
}
