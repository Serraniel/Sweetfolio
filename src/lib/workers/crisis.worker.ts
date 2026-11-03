/// <reference lib="webworker" />
import { evaluateCrisisBatch } from '#lib/core/crisis.ts';
import type { CrisisTestMessage, CrisisTestRequest } from './protocol.ts';

const post = (m: CrisisTestMessage, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<CrisisTestRequest>) => {
	try {
		const outcomes = evaluateCrisisBatch(e.data.matrices, e.data.weights, e.data.count, (done, total) =>
			post({ kind: 'progress', done, total })
		);
		post({ kind: 'result', outcomes }, [outcomes.buffer]);
	} catch (err) {
		post({ kind: 'error', error: err instanceof Error ? err.message : String(err) });
	}
};
