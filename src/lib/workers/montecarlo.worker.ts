/// <reference lib="webworker" />
import { runSimulation } from '#lib/core/montecarlo.ts';
import type { MonteCarloMessage, MonteCarloRequest } from './protocol.ts';

const post = (m: MonteCarloMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<MonteCarloRequest>) => {
	try {
		const result = runSimulation(e.data, Math.random, (done, total) => post({ kind: 'progress', done, total }));
		post({ kind: 'result', result }, [result.volatilities.buffer, result.returns.buffer, result.sharpes.buffer, result.weights.buffer]);
	} catch (err) {
		post({ kind: 'error', error: err instanceof Error ? err.message : String(err) });
	}
};
