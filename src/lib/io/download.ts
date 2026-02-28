import type { SweetfolioExport } from './schema';

/**
 * Convert Float64Array/Float32Array to regular arrays for JSON.
 */
function typedArrayReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Float64Array || value instanceof Float32Array) {
    return Array.from(value);
  }
  return value;
}

/**
 * Serialize each scope independently and assemble as Blob parts.
 * This avoids building one giant JSON string for the entire export,
 * allowing each scope's string to be GC'd after it becomes a Blob part.
 */
function buildBlobParts(data: SweetfolioExport): string[] {
  const parts: string[] = [];

  // Envelope open
  const envelope = {
    format: data.format,
    version: data.version,
    exportedAt: data.exportedAt,
    scopes: data.scopes,
  };
  // Write envelope fields then open "data" object
  const envelopeJson = JSON.stringify(envelope, null);
  // Remove trailing } and append ,"data":{
  parts.push(envelopeJson.slice(0, -1) + ',"data":{');

  // Serialize each scope separately so we never hold more than one scope as a string
  const scopeKeys = Object.keys(data.data) as Array<keyof typeof data.data>;
  for (let i = 0; i < scopeKeys.length; i++) {
    const key = scopeKeys[i];
    const value = data.data[key];
    if (i > 0) parts.push(',');
    parts.push(JSON.stringify(key) + ':');
    parts.push(JSON.stringify(value, typedArrayReplacer));
  }

  // Close data object and envelope
  parts.push('}}');

  return parts;
}

/**
 * Trigger browser download of the export data.
 * Serializes scope-by-scope to keep memory usage proportional to
 * the largest single scope rather than the entire dataset.
 */
export function triggerDownload(data: SweetfolioExport): void {
  const parts = buildBlobParts(data);
  const blob = new Blob(parts, { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `sweetfolio-export-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
