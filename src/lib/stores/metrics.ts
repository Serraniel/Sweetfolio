import { writable } from 'svelte/store';
import type { MetricsResult, CorrelationMatrix } from '$lib/types';

export const metrics = writable<Map<string, MetricsResult>>(new Map());
export const correlationMatrix = writable<CorrelationMatrix | null>(null);

export function setMetrics(assetId: string, result: MetricsResult): void {
  metrics.update((map) => {
    const updated = new Map(map);
    updated.set(assetId, result);
    return updated;
  });
}

export function clearMetrics(assetId: string): void {
  metrics.update((map) => {
    const updated = new Map(map);
    updated.delete(assetId);
    return updated;
  });
}

export function setCorrelationMatrix(matrix: CorrelationMatrix): void {
  correlationMatrix.set(matrix);
}
