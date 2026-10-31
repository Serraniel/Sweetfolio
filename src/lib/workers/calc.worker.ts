/// <reference lib="webworker" />
import { computeCorrelationMatrix } from '#lib/core/correlation.ts';
import { computeMetrics } from '#lib/core/metrics.ts';
import type { CalcRequest, CalcResponse } from './protocol.ts';

self.onmessage = (e: MessageEvent<CalcRequest>) => {
	const req = e.data;
	let res: CalcResponse;
	try {
		const result = req.kind === 'metrics' ? computeMetrics(req.prices, req.riskFreeRate) : computeCorrelationMatrix(req.series);
		res = { id: req.id, ok: true, result };
	} catch (err) {
		res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
	}
	(self as unknown as Worker).postMessage(res);
};
