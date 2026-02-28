import type { SweetfolioExport } from './schema';
import ExportWorkerModule from '$lib/workers/export.worker?worker';

/**
 * Serialize export data to JSON in a Web Worker, then trigger browser download.
 * Uses a worker to avoid blocking the main thread on large datasets.
 * Float64Array values are automatically converted to regular arrays.
 */
export function triggerDownload(data: SweetfolioExport): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new ExportWorkerModule();

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Export timed out after 60 seconds'));
    }, 60_000);

    worker.onmessage = (event: MessageEvent<{ type: string; payload: string }>) => {
      clearTimeout(timer);
      const msg = event.data;

      if (msg.type === 'result') {
        const blob = new Blob([msg.payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);

        const a = document.createElement('a');
        a.href = url;
        a.download = `sweetfolio-export-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        resolve();
      } else if (msg.type === 'error') {
        reject(new Error(msg.payload));
      }

      worker.terminate();
    };

    worker.onerror = (err) => {
      clearTimeout(timer);
      reject(err);
      worker.terminate();
    };

    worker.postMessage({ type: 'serialize', payload: data });
  });
}
