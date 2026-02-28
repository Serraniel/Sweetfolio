/**
 * Calculation Web Worker.
 * Handles 'calculate-metrics' and 'calculate-correlation' messages.
 */

import type { CalcWorkerRequest, CalcWorkerResponse } from '$lib/types';
import { computeAllMetrics } from '$lib/engine/metrics';
import { computeCorrelationMatrix } from '$lib/engine/correlation';
import { convertPrices } from '$lib/engine/currency';

self.onmessage = (event: MessageEvent<CalcWorkerRequest>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'calculate-metrics': {
        const { assetId, riskFreeRate, currencyConversion } = msg.payload;
        let { prices } = msg.payload;

        // Apply currency conversion if provided
        if (currencyConversion) {
          const converted = convertPrices(
            prices,
            currencyConversion.currencyRate,
            currencyConversion.sourceCurrency,
            currencyConversion.targetCurrency,
          );
          if (converted) {
            prices = converted;
          }
        }

        const result = computeAllMetrics(assetId, prices, riskFreeRate);
        const response: CalcWorkerResponse = {
          type: 'metrics-result',
          payload: { assetId, result },
        };
        self.postMessage(response);
        break;
      }

      case 'calculate-correlation': {
        const { assets } = msg.payload;
        const matrix = computeCorrelationMatrix(assets);
        const response: CalcWorkerResponse = {
          type: 'correlation-result',
          payload: matrix,
        };
        self.postMessage(response);
        break;
      }
    }
  } catch (error) {
    const response: CalcWorkerResponse = {
      type: 'error',
      payload: { message: error instanceof Error ? error.message : String(error) },
    };
    self.postMessage(response);
  }
};
