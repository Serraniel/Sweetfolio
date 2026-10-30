/** Session-scoped simulation state so results survive navigation (MC-9). */
import type { MonteCarloResult, WeightConstraint } from '#lib/domain/types.ts';
import type { MonteCarloRun } from '#lib/workers/client.ts';
import type { AssetCountLimits } from '#lib/core/montecarlo.ts';

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

	/** Defaults for all assets and limits on the number of held assets (MC-4). */
	limits = $state({ minWeight: '', maxWeight: '', minAssets: '', maxAssets: '' });

	/** Per-asset entries override the defaults; a per-asset minimum above 0 means always held. */
	parsedConstraints(): { constraints: Array<WeightConstraint | undefined> } & AssetCountLimits {
		if (!this.useConstraints) return { constraints: this.assetIds.map(() => undefined) };
		const pct = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')) / 100);
		const count = (s: string) => (s.trim() === '' ? undefined : Number(s));
		const floor = pct(this.limits.minWeight);
		const cap = pct(this.limits.maxWeight);
		const constraints = this.assetIds.map((id) => {
			const c = this.constraints[id];
			const min = c ? pct(c.min) : null;
			const max = (c ? pct(c.max) : null) ?? cap ?? 1;
			const out: WeightConstraint = { min: min !== null && Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 1 };
			if (min === null && floor !== null && Number.isFinite(floor) && floor > 0) out.floor = floor;
			return out;
		});
		return { constraints, minAssets: count(this.limits.minAssets), maxAssets: count(this.limits.maxAssets) };
	}
}

export const sim = new SimulationState();
