import { describe, it, expect } from 'vitest';
import { generateRandomWeights } from './weights';

// Fixed seed RNG for deterministic tests
function createSeededRng(seed: number) {
  // Simple LCG for test reproducibility
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('generateRandomWeights', () => {
  it('should produce weights that sum to 1', () => {
    const rng = createSeededRng(42);
    for (let trial = 0; trial < 100; trial++) {
      const weights = generateRandomWeights(5, [], [], rng);
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    }
  });

  it('should produce non-negative weights', () => {
    const rng = createSeededRng(123);
    for (let trial = 0; trial < 100; trial++) {
      const weights = generateRandomWeights(4, [], [], rng);
      for (const w of weights) {
        expect(w).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('should snap weights to 0.5% grid', () => {
    const rng = createSeededRng(99);
    for (let trial = 0; trial < 50; trial++) {
      const weights = generateRandomWeights(3, [], [], rng);
      for (const w of weights) {
        // w should be a multiple of 0.005 (within floating point tolerance)
        const steps = w / 0.005;
        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(0.01);
      }
    }
  });

  it('should respect minimum constraints', () => {
    const rng = createSeededRng(7);
    const mins = [0.20, 0.10, 0.05, 0]; // 20%, 10%, 5%, no min
    for (let trial = 0; trial < 100; trial++) {
      const weights = generateRandomWeights(4, mins, [], rng);
      expect(weights[0]).toBeGreaterThanOrEqual(0.20 - 0.001);
      expect(weights[1]).toBeGreaterThanOrEqual(0.10 - 0.001);
      expect(weights[2]).toBeGreaterThanOrEqual(0.05 - 0.001);
      // weights[3] can be 0 (no min constraint)
      expect(weights[3]).toBeGreaterThanOrEqual(0);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 2);
    }
  });

  it('should respect maximum constraints', () => {
    const rng = createSeededRng(13);
    const maxs = [0.30, 0.30, 0.30, 1.0]; // cap first three at 30%
    for (let trial = 0; trial < 100; trial++) {
      const weights = generateRandomWeights(4, [], maxs, rng);
      expect(weights[0]).toBeLessThanOrEqual(0.30 + 0.006); // allow 1 step tolerance
      expect(weights[1]).toBeLessThanOrEqual(0.30 + 0.006);
      expect(weights[2]).toBeLessThanOrEqual(0.30 + 0.006);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 2);
    }
  });

  it('should respect both min and max constraints together', () => {
    const rng = createSeededRng(55);
    const mins = [0.40, 0.10, 0.10]; // core equity >= 40%
    const maxs = [0.70, 0.30, 0.30]; // max 70% core, 30% others
    for (let trial = 0; trial < 100; trial++) {
      const weights = generateRandomWeights(3, mins, maxs, rng);
      expect(weights[0]).toBeGreaterThanOrEqual(0.40 - 0.001);
      expect(weights[0]).toBeLessThanOrEqual(0.70 + 0.006);
      expect(weights[1]).toBeGreaterThanOrEqual(0.10 - 0.001);
      expect(weights[1]).toBeLessThanOrEqual(0.30 + 0.006);
      expect(weights[2]).toBeGreaterThanOrEqual(0.10 - 0.001);
      expect(weights[2]).toBeLessThanOrEqual(0.30 + 0.006);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 2);
    }
  });

  it('should handle tight constraints (mins sum close to 100%)', () => {
    const rng = createSeededRng(77);
    const mins = [0.40, 0.30, 0.25]; // sum = 95%
    const maxs = [0.50, 0.40, 0.35];
    for (let trial = 0; trial < 50; trial++) {
      const weights = generateRandomWeights(3, mins, maxs, rng);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 2);
      expect(weights[0]).toBeGreaterThanOrEqual(0.40 - 0.001);
      expect(weights[1]).toBeGreaterThanOrEqual(0.30 - 0.001);
      expect(weights[2]).toBeGreaterThanOrEqual(0.25 - 0.001);
    }
  });

  it('should handle mins summing to exactly 100%', () => {
    const rng = createSeededRng(88);
    const mins = [0.50, 0.30, 0.20]; // sum = 100%
    const weights = generateRandomWeights(3, mins, [], rng);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 2);
    expect(weights[0]).toBeCloseTo(0.50, 2);
    expect(weights[1]).toBeCloseTo(0.30, 2);
    expect(weights[2]).toBeCloseTo(0.20, 2);
  });

  it('should handle infeasible constraints gracefully (mins > 100%)', () => {
    const rng = createSeededRng(99);
    const mins = [0.50, 0.40, 0.30]; // sum = 120%
    const weights = generateRandomWeights(3, mins, [], rng);
    // Should normalize to sum to 1
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 1);
    // Should preserve ratios
    expect(weights[0]).toBeGreaterThan(weights[2]);
  });

  it('should work with 2 assets', () => {
    const rng = createSeededRng(42);
    for (let trial = 0; trial < 50; trial++) {
      const weights = generateRandomWeights(2, [], [], rng);
      expect(weights).toHaveLength(2);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 2);
    }
  });

  it('should produce varied results across runs (no constant output)', () => {
    const rng = createSeededRng(42);
    const results = new Set<string>();
    for (let trial = 0; trial < 20; trial++) {
      const weights = generateRandomWeights(3, [], [], rng);
      results.add(weights.map((w) => w.toFixed(3)).join(','));
    }
    // Should have multiple unique allocations
    expect(results.size).toBeGreaterThan(5);
  });
});
