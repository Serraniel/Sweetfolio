/** Session-scoped simulation state so results survive navigation (MC-9). */
import type { MonteCarloResult, WeightConstraint } from '#lib/domain/types.ts';
import type { MonteCarloRun } from '#lib/workers/client.ts';

class SimulationState {
	count = $state(10_000);
	assetIds = $state<string[]>([]);
	constraints = $state<Record<string, { min: string; max: string }>>({});
	useConstraints = $state(false);
	result = $state.raw<MonteCarloResult | null>(null);
	riskFreeRate = $state(0);
	progress = $state<{ done: number; total: number } | null>(null);
	run: MonteCarloRun | null = null;
	selected = $state<number | null>(null);

	parsedConstraints(): Array<WeightConstraint | undefined> {
		return this.assetIds.map((id) => {
			if (!this.useConstraints) return undefined;
			const c = this.constraints[id];
			if (!c) return undefined;
			const min = c.min.trim() === '' ? 0 : Number(c.min.replace(',', '.')) / 100;
			const max = c.max.trim() === '' ? 1 : Number(c.max.replace(',', '.')) / 100;
			return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 1 };
		});
	}
}

export const sim = new SimulationState();
