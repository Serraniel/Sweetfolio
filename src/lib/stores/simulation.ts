import { writable } from 'svelte/store';
import type { MonteCarloConfig, MonteCarloResult, StoredSimulation } from '$lib/types';
import * as db from '$lib/storage/simulations';

export interface SimulationState {
  config: MonteCarloConfig;
  result: MonteCarloResult | null;
  progress: { completed: number; total: number } | null;
  running: boolean;
}

const defaultConfig: MonteCarloConfig = {
  simulationCount: 10000,
  assetIds: [],
  riskFreeRate: 0,
  benchmarkPortfolioId: null,
};

export const simulation = writable<SimulationState>({
  config: defaultConfig,
  result: null,
  progress: null,
  running: false,
});

export function updateConfig(config: Partial<MonteCarloConfig>): void {
  simulation.update((s) => ({
    ...s,
    config: { ...s.config, ...config },
  }));
}

export function setProgress(completed: number, total: number): void {
  simulation.update((s) => ({ ...s, progress: { completed, total } }));
}

export function setResult(result: MonteCarloResult): void {
  simulation.update((s) => ({ ...s, result, running: false, progress: null }));
}

export function setRunning(running: boolean): void {
  simulation.update((s) => ({ ...s, running }));
}

export async function saveSimulation(sim: StoredSimulation): Promise<void> {
  await db.put(sim);
}

export async function loadSimulations(): Promise<StoredSimulation[]> {
  return db.getAll();
}
