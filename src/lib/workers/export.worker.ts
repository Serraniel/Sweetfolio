/**
 * Web Worker for JSON serialization of export data.
 * Runs off the main thread to prevent UI blocking.
 */

/** Convert Float64Array/Float32Array to regular arrays for JSON serialization. */
function typedArrayReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Float64Array || value instanceof Float32Array) {
    return Array.from(value);
  }
  return value;
}

self.onmessage = (event: MessageEvent<{ type: 'serialize'; payload: unknown }>) => {
  const { type, payload } = event.data;
  if (type !== 'serialize') return;

  try {
    const json = JSON.stringify(payload, typedArrayReplacer);
    self.postMessage({ type: 'result', payload: json });
  } catch (err) {
    self.postMessage({
      type: 'error',
      payload: err instanceof Error ? err.message : 'Serialization failed',
    });
  }
};
