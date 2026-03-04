/**
 * Constrained random weight generation for Monte Carlo portfolio simulation.
 *
 * Generates random portfolio weight vectors that:
 * - Sum to 1.0
 * - Snap to discrete allocation steps (0.5%)
 * - Respect per-asset min/max constraints
 */

const DEFAULT_STEP = 0.005; // 0.5%

/**
 * Generate a random weight vector with discrete allocation steps and
 * per-asset min/max constraints.
 *
 * @param n - Number of assets
 * @param mins - Per-asset minimum weight (0..1), defaults to 0
 * @param maxs - Per-asset maximum weight (0..1), defaults to 1
 * @param rng - Random number generator (0..1), defaults to Math.random
 * @param step - Allocation step size (0..1), defaults to 0.005 (0.5%)
 */
export function generateRandomWeights(
  n: number,
  mins: number[] = [],
  maxs: number[] = [],
  rng: () => number = Math.random,
  step: number = DEFAULT_STEP,
): number[] {
  const STEP = step;
  const minW = new Array(n);
  const maxW = new Array(n);
  for (let i = 0; i < n; i++) {
    minW[i] = mins[i] ?? 0;
    maxW[i] = maxs[i] ?? 1;
  }

  // Start with minimum allocations
  const weights = new Array(n);
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    weights[i] = minW[i];
    allocated += minW[i];
  }

  // Remaining budget to distribute
  let remaining = 1.0 - allocated;
  if (remaining < -0.001) {
    // Constraints are infeasible (mins sum > 1), normalize proportionally
    // and relax min constraints to make it work
    const total = allocated;
    const relaxedMin = new Array(n);
    for (let i = 0; i < n; i++) {
      weights[i] = minW[i] / total;
      relaxedMin[i] = 0; // relax mins since they're infeasible
    }
    return snapToGrid(weights, relaxedMin, maxW, STEP);
  }
  if (remaining < STEP) {
    return snapToGrid(weights, minW, maxW, STEP);
  }

  // Generate Dirichlet random shares for the remaining budget
  const raw = new Array(n);
  let rawSum = 0;
  for (let i = 0; i < n; i++) {
    const headroom = maxW[i] - minW[i];
    if (headroom <= 0) {
      raw[i] = 0;
    } else {
      raw[i] = -Math.log(rng() || 1e-10);
      rawSum += raw[i];
    }
  }

  // Distribute remaining budget proportionally, clamping to max
  if (rawSum > 0) {
    let budget = remaining;
    const shares = new Array(n).fill(0);
    const clamped = new Array(n).fill(false);

    for (let pass = 0; pass < 3 && budget > STEP; pass++) {
      let activeSum = 0;
      for (let i = 0; i < n; i++) {
        if (!clamped[i]) activeSum += raw[i];
      }
      if (activeSum <= 0) break;

      let excess = 0;
      for (let i = 0; i < n; i++) {
        if (clamped[i]) continue;
        shares[i] = (raw[i] / activeSum) * budget;
        const headroom = maxW[i] - weights[i];
        if (shares[i] > headroom) {
          excess += shares[i] - headroom;
          shares[i] = headroom;
          clamped[i] = true;
        }
      }

      for (let i = 0; i < n; i++) {
        if (!clamped[i] || pass === 0) {
          weights[i] += shares[i];
        }
      }
      budget = excess;
    }
  }

  return snapToGrid(weights, minW, maxW, STEP);
}

/** Snap weights to step grid, enforce min/max, and fix rounding residual. */
function snapToGrid(weights: number[], mins: number[], maxs: number[], step: number = DEFAULT_STEP): number[] {
  const STEP = step;
  const n = weights.length;
  const snapped = new Array(n);

  for (let i = 0; i < n; i++) {
    let w = Math.round(weights[i] / STEP) * STEP;
    w = Math.max(mins[i], Math.min(maxs[i], w));
    if (w < mins[i] && mins[i] === 0) w = 0;
    snapped[i] = w;
  }

  // Fix rounding residual
  let finalSum = 0;
  for (let i = 0; i < n; i++) finalSum += snapped[i];

  const residual = Math.round((1.0 - finalSum) / STEP) * STEP;
  if (Math.abs(residual) >= STEP) {
    let bestIdx = 0;
    let bestRoom = -Infinity;
    for (let i = 0; i < n; i++) {
      const room = residual > 0
        ? maxs[i] - snapped[i]
        : snapped[i] - mins[i];
      if (room > bestRoom) {
        bestRoom = room;
        bestIdx = i;
      }
    }
    snapped[bestIdx] = Math.max(mins[bestIdx], Math.min(maxs[bestIdx], snapped[bestIdx] + residual));
  }

  return snapped;
}
