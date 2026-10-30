/**
 * Worker clients (FM-6, MC-9). The calc worker is long-lived and shared;
 * results are cached by input fingerprint. Monte Carlo runs get a fresh worker
 * that is terminated on completion or cancel.
 */
import type { CorrelationMatrix, MetricsResult, MonteCarloResult, PricePoint } from '#lib/domain/types.ts';
import { computeCorrelationMatrix } from '#lib/core/correlation.ts';
import { computeMetrics } from '#lib/core/metrics.ts';
import type { CalcRequest, CalcResponse, MonteCarloMessage, MonteCarloRequest } from './protocol.ts';

let calcWorker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const cache = new Map<string, Promise<unknown>>();
const CACHE_LIMIT = 200;

function worker(): Worker | null {
	if (typeof Worker === 'undefined') return null;
	if (!calcWorker) {
		calcWorker = new Worker(new URL('./calc.worker.ts', import.meta.url), { type: 'module' });
		calcWorker.onmessage = (e: MessageEvent<CalcResponse>) => {
			const p = pending.get(e.data.id);
			if (!p) return;
			pending.delete(e.data.id);
			if (e.data.ok) p.resolve(e.data.result);
			else p.reject(new Error(e.data.error));
		};
		calcWorker.onerror = (e) => {
			for (const p of pending.values()) p.reject(new Error(e.message || 'Worker error'));
			pending.clear();
			calcWorker?.terminate();
			calcWorker = null;
		};
	}
	return calcWorker;
}

function fingerprint(prices: readonly PricePoint[]): string {
	const first = prices[0];
	const last = prices[prices.length - 1];
	let h = 0;
	for (let i = 0; i < prices.length; i += Math.max(1, Math.floor(prices.length / 64)))
		h = (h * 31 + Math.round(prices[i]!.close * 1e6)) | 0;
	return `${prices.length}:${first?.date}:${first?.close}:${last?.date}:${last?.close}:${h}`;
}

function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
	const hit = cache.get(key);
	if (hit) {
		cache.delete(key);
		cache.set(key, hit);
		return hit as Promise<T>;
	}
	const p = run().catch((err) => {
		cache.delete(key);
		throw err;
	});
	cache.set(key, p);
	if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
	return p;
}

type CalcBody = CalcRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never;

function call<T>(req: CalcBody, fallback: () => T): Promise<T> {
	const w = worker();
	if (!w) return Promise.resolve().then(fallback);
	const id = nextId++;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
		w.postMessage({ ...req, id });
	});
}

export function metrics(prices: readonly PricePoint[], riskFreeRate: number): Promise<MetricsResult> {
	const plain = prices.map((p) => ({ date: p.date, close: p.close }));
	return cached(`m|${riskFreeRate}|${fingerprint(prices)}`, () =>
		call({ kind: 'metrics', prices: plain, riskFreeRate }, () => computeMetrics(plain, riskFreeRate))
	);
}

export function correlation(series: ReadonlyArray<{ id: string; prices: readonly PricePoint[] }>): Promise<CorrelationMatrix> {
	const plain = series.map((s) => ({ id: s.id, prices: s.prices.map((p) => ({ date: p.date, close: p.close })) }));
	return cached(`c|${series.map((s) => `${s.id}:${fingerprint(s.prices)}`).join('|')}`, () =>
		call({ kind: 'correlation', series: plain }, () => computeCorrelationMatrix(plain))
	);
}

export interface MonteCarloRun {
	promise: Promise<MonteCarloResult>;
	cancel: () => void;
}

export function runMonteCarlo(req: MonteCarloRequest, onProgress: (done: number, total: number) => void): MonteCarloRun {
	const w = new Worker(new URL('./montecarlo.worker.ts', import.meta.url), { type: 'module' });
	let reject!: (e: Error) => void;
	const promise = new Promise<MonteCarloResult>((resolve, rej) => {
		reject = rej;
		w.onmessage = (e: MessageEvent<MonteCarloMessage>) => {
			const m = e.data;
			if (m.kind === 'progress') onProgress(m.done, m.total);
			else {
				w.terminate();
				if (m.kind === 'result') resolve(m.result);
				else rej(new Error(m.error));
			}
		};
		w.onerror = (e) => {
			w.terminate();
			rej(new Error(e.message || 'Simulation failed'));
		};
	});
	w.postMessage(req);
	return {
		promise,
		cancel: () => {
			w.terminate();
			reject(new DOMException('Cancelled', 'AbortError'));
		}
	};
}
