import type { Transaction, HoldingLot, RealizedGain } from '$lib/types';

export interface CostBasisMethod {
	name: string;
	computeLots(transactions: Transaction[]): HoldingLot[];
	computeRealizedGains(transactions: Transaction[]): RealizedGain[];
}
