# Strategy Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a hierarchical Strategy feature that lets users define multi-level allocation plans (e.g., Core-Satellite), visualize them as sunburst/icicle charts, and generate linked Portfolios from them.

**Architecture:** New `Strategy` type with recursive tree nodes stored in IndexedDB. New top-level nav item, list page, and detail page with tree editor + SVG charts. Strategies generate Portfolios via a sleeve-detection algorithm, with a linked "out of sync" badge system.

**Tech Stack:** SvelteKit, Svelte 5 ($state/$derived runes), TypeScript, IndexedDB, custom SVG charts, Vitest

---

### Task 1: Strategy Types

**Files:**
- Modify: `src/lib/types/index.ts`
- Test: `src/lib/engine/strategy.test.ts` (will be created in Task 2)

**Step 1: Add Strategy types to the types file**

Add the following after the `Portfolio` interface (around line 30):

```typescript
// --- Strategy ---

export interface StrategyGroupNode {
  type: 'group';
  id: string;
  label: string;
  weight: number;
  children: StrategyNode[];
}

export interface StrategyLeafNode {
  type: 'leaf';
  id: string;
  assetId: string;
  weight: number;
}

export type StrategyNode = StrategyGroupNode | StrategyLeafNode;

export interface Strategy {
  id: string;
  name: string;
  root: StrategyGroupNode;
  generatedPortfolioIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Add `sourceStrategyId` to Portfolio type**

Modify the existing `Portfolio` interface to add a link back to the strategy:

```typescript
export interface Portfolio {
  id: string;
  name: string;
  allocations: Array<{ assetId: string; weight: number }>;
  isBenchmark: boolean;
  sourceStrategyId: string | null;  // NEW: link to generating strategy
  createdAt: string;
  updatedAt: string;
}
```

**Step 3: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat(strategy): add Strategy and StrategyNode types"
```

---

### Task 2: Strategy Tree Utilities

**Files:**
- Create: `src/lib/engine/strategy.ts`
- Create: `src/lib/engine/strategy.test.ts`

**Step 1: Write failing tests for tree utilities**

```typescript
// src/lib/engine/strategy.test.ts
import { describe, it, expect } from 'vitest';
import {
  flattenStrategy,
  computeAbsoluteWeights,
  getLeafCount,
  getMaxDepth,
  removeNodeById,
  normalizeChildren,
  detectTreeShape,
} from './strategy';
import type { Strategy, StrategyGroupNode, StrategyLeafNode, StrategyNode } from '$lib/types';

function makeLeaf(id: string, assetId: string, weight: number): StrategyLeafNode {
  return { type: 'leaf', id, assetId, weight };
}

function makeGroup(id: string, label: string, weight: number, children: StrategyNode[]): StrategyGroupNode {
  return { type: 'group', id, label, weight, children };
}

// Core-Satellite test tree:
// Root
// ├── Core (0.8)
// │   ├── World (leaf, 0.7)
// │   └── EM (leaf, 0.3)
// └── Satellite (0.2)
//     ├── China (0.5)
//     │   ├── General (leaf, 0.6)
//     │   └── Tech (leaf, 0.4)
//     └── Crypto (0.5)
//         ├── BTC (leaf, 0.5)
//         └── ETH (leaf, 0.5)
const testRoot: StrategyGroupNode = makeGroup('root', 'Strategy', 1, [
  makeGroup('core', 'Core', 0.8, [
    makeLeaf('world', 'asset-world', 0.7),
    makeLeaf('em', 'asset-em', 0.3),
  ]),
  makeGroup('satellite', 'Satellite', 0.2, [
    makeGroup('china', 'China', 0.5, [
      makeLeaf('cn-gen', 'asset-cn-gen', 0.6),
      makeLeaf('cn-tech', 'asset-cn-tech', 0.4),
    ]),
    makeGroup('crypto', 'Crypto', 0.5, [
      makeLeaf('btc', 'asset-btc', 0.5),
      makeLeaf('eth', 'asset-eth', 0.5),
    ]),
  ]),
]);

describe('flattenStrategy', () => {
  it('flattens tree into weighted allocations', () => {
    const result = flattenStrategy(testRoot);
    expect(result).toHaveLength(6);
    const worldAlloc = result.find((a) => a.assetId === 'asset-world');
    expect(worldAlloc?.weight).toBeCloseTo(0.56, 5); // 0.8 * 0.7
    const btcAlloc = result.find((a) => a.assetId === 'asset-btc');
    expect(btcAlloc?.weight).toBeCloseTo(0.05, 5); // 0.2 * 0.5 * 0.5
  });

  it('returns empty for group with no leaf descendants', () => {
    const emptyRoot = makeGroup('root', 'Empty', 1, []);
    expect(flattenStrategy(emptyRoot)).toEqual([]);
  });
});

describe('computeAbsoluteWeights', () => {
  it('annotates each node with its absolute weight', () => {
    const result = computeAbsoluteWeights(testRoot);
    expect(result.get('core')).toBeCloseTo(0.8, 5);
    expect(result.get('world')).toBeCloseTo(0.56, 5);
    expect(result.get('cn-gen')).toBeCloseTo(0.06, 5); // 0.2 * 0.5 * 0.6
  });
});

describe('getLeafCount', () => {
  it('counts leaf nodes', () => {
    expect(getLeafCount(testRoot)).toBe(6);
  });
});

describe('getMaxDepth', () => {
  it('returns maximum depth of tree', () => {
    // Root(0) -> Core(1) -> World(2) = 2
    // Root(0) -> Satellite(1) -> China(2) -> General(3) = 3
    expect(getMaxDepth(testRoot)).toBe(3);
  });
});

describe('normalizeChildren', () => {
  it('normalizes children weights to sum to 1', () => {
    const children: StrategyNode[] = [
      makeLeaf('a', 'x', 0.3),
      makeLeaf('b', 'y', 0.3),
    ];
    const result = normalizeChildren(children);
    expect(result[0].weight).toBeCloseTo(0.5, 5);
    expect(result[1].weight).toBeCloseTo(0.5, 5);
  });
});

describe('removeNodeById', () => {
  it('removes a leaf and renormalizes siblings', () => {
    const root = makeGroup('root', 'R', 1, [
      makeLeaf('a', 'x', 0.6),
      makeLeaf('b', 'y', 0.4),
    ]);
    const result = removeNodeById(root, 'a');
    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(1);
    expect(result!.children[0].weight).toBeCloseTo(1.0, 5);
  });

  it('returns null if removing last child empties the root', () => {
    const root = makeGroup('root', 'R', 1, [
      makeLeaf('a', 'x', 1),
    ]);
    expect(removeNodeById(root, 'a')).toBeNull();
  });

  it('removes nested group when its last child is removed', () => {
    const root = makeGroup('root', 'R', 1, [
      makeLeaf('a', 'x', 0.5),
      makeGroup('g', 'G', 0.5, [
        makeLeaf('b', 'y', 1),
      ]),
    ]);
    const result = removeNodeById(root, 'b');
    expect(result!.children).toHaveLength(1);
    expect(result!.children[0].id).toBe('a');
    expect(result!.children[0].weight).toBeCloseTo(1.0, 5);
  });
});

describe('detectTreeShape', () => {
  it('detects uniform depth', () => {
    const uniform = makeGroup('root', 'R', 1, [
      makeGroup('a', 'A', 0.5, [
        makeLeaf('l1', 'x', 0.5),
        makeLeaf('l2', 'y', 0.5),
      ]),
      makeGroup('b', 'B', 0.5, [
        makeLeaf('l3', 'z', 1),
      ]),
    ]);
    expect(detectTreeShape(uniform)).toBe('uniform');
  });

  it('detects mixed depth', () => {
    expect(detectTreeShape(testRoot)).toBe('mixed');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/strategy.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement strategy tree utilities**

```typescript
// src/lib/engine/strategy.ts
import type { StrategyGroupNode, StrategyNode } from '$lib/types';

/** Flatten a strategy tree into a list of { assetId, weight } with absolute weights. */
export function flattenStrategy(
  node: StrategyNode,
  parentWeight = 1,
): Array<{ assetId: string; weight: number }> {
  const absWeight = parentWeight * node.weight;
  if (node.type === 'leaf') {
    return [{ assetId: node.assetId, weight: absWeight }];
  }
  return node.children.flatMap((child) => flattenStrategy(child, absWeight));
}

/** Compute absolute weight for every node in the tree. Returns Map<nodeId, absoluteWeight>. */
export function computeAbsoluteWeights(
  node: StrategyNode,
  parentWeight = 1,
): Map<string, number> {
  const result = new Map<string, number>();
  const absWeight = parentWeight * node.weight;
  result.set(node.id, absWeight);
  if (node.type === 'group') {
    for (const child of node.children) {
      for (const [id, w] of computeAbsoluteWeights(child, absWeight)) {
        result.set(id, w);
      }
    }
  }
  return result;
}

/** Count leaf nodes in a tree. */
export function getLeafCount(node: StrategyNode): number {
  if (node.type === 'leaf') return 1;
  return node.children.reduce((sum, child) => sum + getLeafCount(child), 0);
}

/** Get maximum depth of a tree (root = 0). */
export function getMaxDepth(node: StrategyNode, depth = 0): number {
  if (node.type === 'leaf') return depth;
  if (node.children.length === 0) return depth;
  return Math.max(...node.children.map((child) => getMaxDepth(child, depth + 1)));
}

/** Normalize children weights to sum to 1. Returns new array. */
export function normalizeChildren(children: StrategyNode[]): StrategyNode[] {
  const total = children.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return children.map((c) => ({ ...c, weight: 1 / children.length }));
  return children.map((c) => ({ ...c, weight: c.weight / total }));
}

/**
 * Remove a node by ID and renormalize siblings.
 * Returns updated root, or null if the root becomes empty.
 */
export function removeNodeById(
  root: StrategyGroupNode,
  targetId: string,
): StrategyGroupNode | null {
  function processChildren(children: StrategyNode[]): StrategyNode[] | null {
    // Direct child removal
    const filtered = children.filter((c) => c.id !== targetId);
    if (filtered.length < children.length) {
      return filtered.length > 0 ? normalizeChildren(filtered) : null;
    }

    // Recurse into group children
    const result: StrategyNode[] = [];
    for (const child of filtered) {
      if (child.type === 'group') {
        const newChildren = processChildren(child.children);
        if (newChildren === null) {
          // This group became empty — remove it too
          continue;
        }
        result.push({ ...child, children: newChildren });
      } else {
        result.push(child);
      }
    }
    return result.length > 0 ? normalizeChildren(result) : null;
  }

  const newChildren = processChildren(root.children);
  if (newChildren === null) return null;
  return { ...root, children: newChildren };
}

/** Detect if all branches have the same leaf depth. */
export function detectTreeShape(root: StrategyGroupNode): 'uniform' | 'mixed' {
  const depths: number[] = [];
  function collectLeafDepths(node: StrategyNode, depth: number): void {
    if (node.type === 'leaf') {
      depths.push(depth);
      return;
    }
    for (const child of node.children) {
      collectLeafDepths(child, depth + 1);
    }
  }
  collectLeafDepths(root, 0);
  if (depths.length === 0) return 'uniform';
  return depths.every((d) => d === depths[0]) ? 'uniform' : 'mixed';
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/strategy.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/engine/strategy.ts src/lib/engine/strategy.test.ts
git commit -m "feat(strategy): add strategy tree utilities with tests"
```

---

### Task 3: Strategy Storage (IndexedDB)

**Files:**
- Modify: `src/lib/storage/db.ts`
- Create: `src/lib/storage/strategies.ts`

**Step 1: Add strategies object store to IndexedDB**

In `src/lib/storage/db.ts`, bump `DB_VERSION` to 2 and add the strategies store inside `onupgradeneeded`:

```typescript
const DB_VERSION = 2;
```

And inside the `onupgradeneeded` handler, add:

```typescript
// strategies store
if (!db.objectStoreNames.contains('strategies')) {
  const strategyStore = db.createObjectStore('strategies', { keyPath: 'id' });
  strategyStore.createIndex('by-name', 'name', { unique: false });
}
```

**Step 2: Create strategies storage module**

```typescript
// src/lib/storage/strategies.ts
import type { Strategy } from '$lib/types';
import { getDB } from './db';

const STORE = 'strategies';

export async function getAll(): Promise<Strategy[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getById(id: string): Promise<Strategy | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function put(strategy: Strategy): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.put(strategy);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function remove(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
```

**Step 3: Commit**

```bash
git add src/lib/storage/db.ts src/lib/storage/strategies.ts
git commit -m "feat(strategy): add IndexedDB strategies store"
```

---

### Task 4: Strategy Svelte Store

**Files:**
- Create: `src/lib/stores/strategies.ts`
- Modify: `src/lib/stores/init.ts`
- Modify: `src/lib/stores/assets.ts`

**Step 1: Create the strategies store**

```typescript
// src/lib/stores/strategies.ts
import { writable, get } from 'svelte/store';
import type { Strategy } from '$lib/types';
import * as db from '$lib/storage/strategies';
import { removeNodeById } from '$lib/engine/strategy';

export const strategies = writable<Strategy[]>([]);

export async function loadStrategies(): Promise<void> {
  strategies.set(await db.getAll());
}

export async function addStrategy(strategy: Strategy): Promise<void> {
  await db.put(strategy);
  strategies.update((list) => [...list, strategy]);
}

export async function updateStrategy(strategy: Strategy): Promise<void> {
  await db.put(strategy);
  strategies.update((list) => list.map((s) => (s.id === strategy.id ? strategy : s)));
}

export async function removeStrategy(id: string): Promise<void> {
  await db.remove(id);
  strategies.update((list) => list.filter((s) => s.id !== id));
}

/**
 * Remove an asset from all strategies that reference it as a leaf.
 * If removing the leaf empties the root, delete the entire strategy.
 */
export async function removeAssetFromStrategies(assetId: string): Promise<void> {
  const current = get(strategies);
  for (const strategy of current) {
    const leafIds = findLeafIdsByAssetId(strategy.root, assetId);
    if (leafIds.length === 0) continue;

    let newRoot = strategy.root;
    let deleted = false;
    for (const leafId of leafIds) {
      const result = removeNodeById(newRoot, leafId);
      if (result === null) {
        // Strategy became empty — delete it
        await db.remove(strategy.id);
        strategies.update((list) => list.filter((s) => s.id !== strategy.id));
        deleted = true;
        break;
      }
      newRoot = result;
    }
    if (!deleted) {
      const updated: Strategy = {
        ...strategy,
        root: newRoot,
        updatedAt: new Date().toISOString(),
      };
      await db.put(updated);
      strategies.update((list) => list.map((s) => (s.id === strategy.id ? updated : s)));
    }
  }
}

function findLeafIdsByAssetId(node: import('$lib/types').StrategyNode, assetId: string): string[] {
  if (node.type === 'leaf') {
    return node.assetId === assetId ? [node.id] : [];
  }
  return node.children.flatMap((c) => findLeafIdsByAssetId(c, assetId));
}
```

**Step 2: Wire into init store**

In `src/lib/stores/init.ts`, add the import and load call:

```typescript
import { loadStrategies } from './strategies';
```

And add `loadStrategies()` to the `Promise.all`:

```typescript
await Promise.all([loadAssets(), loadPortfolios(), loadStrategies(), loadSettings(), loadCurrencies()]);
```

**Step 3: Wire cascade into assets store**

In `src/lib/stores/assets.ts`, add the import:

```typescript
import { removeAssetFromStrategies } from '$lib/stores/strategies';
```

And add the cascade call at the end of `removeAsset`:

```typescript
export async function removeAsset(id: string): Promise<void> {
  await db.remove(id);
  assets.update((list) => list.filter((a) => a.id !== id));
  await removeAssetFromPortfolios(id);
  await removeAssetFromStrategies(id);
}
```

**Step 4: Commit**

```bash
git add src/lib/stores/strategies.ts src/lib/stores/init.ts src/lib/stores/assets.ts
git commit -m "feat(strategy): add strategies store with asset cascade"
```

---

### Task 5: Sleeve Generation Utilities

**Files:**
- Create: `src/lib/engine/sleeves.ts`
- Create: `src/lib/engine/sleeves.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/engine/sleeves.test.ts
import { describe, it, expect } from 'vitest';
import { generateSleeves } from './sleeves';
import type { StrategyGroupNode, StrategyNode } from '$lib/types';

function makeLeaf(id: string, assetId: string, weight: number) {
  return { type: 'leaf' as const, id, assetId, weight };
}

function makeGroup(id: string, label: string, weight: number, children: StrategyNode[]): StrategyGroupNode {
  return { type: 'group', id, label, weight, children };
}

const testRoot: StrategyGroupNode = makeGroup('root', 'Strategy', 1, [
  makeGroup('core', 'Core', 0.8, [
    makeLeaf('world', 'asset-world', 0.7),
    makeLeaf('em', 'asset-em', 0.3),
  ]),
  makeGroup('satellite', 'Satellite', 0.2, [
    makeGroup('china', 'China', 0.5, [
      makeLeaf('cn-gen', 'asset-cn-gen', 0.6),
      makeLeaf('cn-tech', 'asset-cn-tech', 0.4),
    ]),
    makeGroup('crypto', 'Crypto', 0.5, [
      makeLeaf('btc', 'asset-btc', 0.5),
      makeLeaf('eth', 'asset-eth', 0.5),
    ]),
  ]),
]);

describe('generateSleeves', () => {
  it('generates top-level sleeves', () => {
    const result = generateSleeves(testRoot, 'top-level');
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Core');
    expect(result[0].allocations).toHaveLength(2);
    // Core sleeve: World = 0.7, EM = 0.3 (relative within sleeve)
    expect(result[0].allocations.find((a) => a.assetId === 'asset-world')?.weight).toBeCloseTo(0.7, 5);
    expect(result[1].label).toBe('Satellite');
    expect(result[1].allocations).toHaveLength(4);
  });

  it('generates per-branch sleeves', () => {
    const result = generateSleeves(testRoot, 'per-branch');
    expect(result).toHaveLength(3); // Core, China, Crypto
    expect(result.map((s) => s.label)).toEqual(['Core', 'China', 'Crypto']);
  });

  it('generates single flat sleeve', () => {
    const result = generateSleeves(testRoot, 'flat');
    expect(result).toHaveLength(1);
    expect(result[0].allocations).toHaveLength(6);
    // World absolute: 0.8 * 0.7 = 0.56
    expect(result[0].allocations.find((a) => a.assetId === 'asset-world')?.weight).toBeCloseTo(0.56, 5);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/engine/sleeves.test.ts`
Expected: FAIL

**Step 3: Implement sleeve generation**

```typescript
// src/lib/engine/sleeves.ts
import type { StrategyGroupNode, StrategyNode } from '$lib/types';
import { flattenStrategy } from './strategy';

export type SleeveMode = 'top-level' | 'per-branch' | 'flat';

export interface Sleeve {
  label: string;
  nodeId: string;
  allocations: Array<{ assetId: string; weight: number }>;
}

/** Generate sleeves from a strategy tree based on the selected mode. */
export function generateSleeves(root: StrategyGroupNode, mode: SleeveMode): Sleeve[] {
  if (mode === 'flat') {
    const allocations = flattenStrategy(root);
    return [{ label: root.label, nodeId: root.id, allocations }];
  }

  if (mode === 'top-level') {
    return root.children
      .filter((c): c is StrategyGroupNode => c.type === 'group')
      .map((child) => ({
        label: child.label,
        nodeId: child.id,
        allocations: flattenStrategy(child, 1), // relative within this sub-tree
      }))
      .concat(
        // Top-level leaves become their own sleeve
        root.children
          .filter((c) => c.type === 'leaf')
          .map((c) => ({
            label: c.type === 'leaf' ? c.id : '',
            nodeId: c.id,
            allocations: [{ assetId: (c as { assetId: string }).assetId, weight: 1 }],
          })),
      );
  }

  // per-branch: find the deepest group nodes that contain only leaves
  if (mode === 'per-branch') {
    const sleeves: Sleeve[] = [];
    function collectTerminalGroups(node: StrategyNode): void {
      if (node.type === 'leaf') return;
      const hasGroupChild = node.children.some((c) => c.type === 'group');
      if (!hasGroupChild) {
        // This is a terminal group — all children are leaves
        sleeves.push({
          label: node.label,
          nodeId: node.id,
          allocations: node.children.map((c) => ({
            assetId: (c as { assetId: string }).assetId,
            weight: c.weight,
          })),
        });
      } else {
        // Recurse into group children; collect leaf children as solo sleeves
        for (const child of node.children) {
          if (child.type === 'group') {
            collectTerminalGroups(child);
          }
        }
      }
    }
    collectTerminalGroups(root);
    return sleeves;
  }

  return [];
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/engine/sleeves.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/engine/sleeves.ts src/lib/engine/sleeves.test.ts
git commit -m "feat(strategy): add sleeve generation utilities with tests"
```

---

### Task 6: Navigation Update

**Files:**
- Modify: `src/lib/components/layout/Nav.svelte`

**Step 1: Add Strategies nav item**

In `Nav.svelte`, add a new entry to the `navItems` array after the Portfolios entry (line 15). Use a "layers" or "sitemap" style icon:

```typescript
{ href: '/strategies', label: 'Strategies', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm2 6a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 01-1 1H7a1 1 0 01-1-1v-2zm3 6a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z' },
```

Insert it between the Portfolios and Simulation entries so the order is: Dashboard, Assets, Portfolios, Strategies, Simulation, Settings.

**Step 2: Commit**

```bash
git add src/lib/components/layout/Nav.svelte
git commit -m "feat(strategy): add Strategies nav item"
```

---

### Task 7: Strategy List Page

**Files:**
- Create: `src/routes/strategies/+page.svelte`

**Step 1: Create the strategies list page**

Follow the exact same pattern as `src/routes/portfolios/+page.svelte` but adapted for strategies:
- Page title: "Strategies"
- Card grid: same `repeat(auto-fill, minmax(280px, 1fr))` layout
- Each card shows: strategy name, leaf count, max depth, generated portfolio count
- Mini sunburst thumbnail placeholder (just a colored circle for now, full SVG in Task 10)
- Delete button on hover
- Create modal: name input only, creates empty strategy root, navigates to detail page
- Empty state: explain what strategies are

Use `strategies` store for data. Use `crypto.randomUUID()` for IDs. Navigate to `/strategies/{slug}` on card click (slugify name same as portfolios).

**Step 2: Commit**

```bash
git add src/routes/strategies/+page.svelte
git commit -m "feat(strategy): add strategies list page"
```

---

### Task 8: Strategy Detail Page — Tree Editor

**Files:**
- Create: `src/routes/strategies/[slug]/+page.svelte`
- Create: `src/lib/components/strategy/StrategyTreeEditor.svelte`
- Create: `src/lib/components/strategy/StrategyTreeNode.svelte`

**Step 1: Create the recursive tree node component**

`StrategyTreeNode.svelte` renders a single node (group or leaf) and recurses for children:
- Group nodes: collapsible, show label + weight%, [+] and [x] buttons on hover
- Leaf nodes: show asset name (looked up from assets store) + weight%, [x] button on hover
- Weight editing: number input (0-100) that triggers normalization on siblings
- [+] button on groups: dropdown with "Add Group" / "Add Asset" options
- "Add Asset" shows a select dropdown of available assets
- Indentation via CSS margin-left per depth level

**Step 2: Create the tree editor wrapper**

`StrategyTreeEditor.svelte` wraps the root node, handles:
- Debounced save to store (300ms debounce after each edit)
- "Generate Portfolios" button at the bottom
- Empty state prompt when root has no children

**Step 3: Create the detail page**

`src/routes/strategies/[slug]/+page.svelte` with two-column layout:
- Left: `StrategyTreeEditor` component
- Right: placeholder for chart (will be added in Task 10)
- Header: strategy name, back link, edit name button, delete button
- Below chart area: generated sleeves section showing linked portfolios with sync badges

**Step 4: Commit**

```bash
git add src/routes/strategies/[slug]/+page.svelte src/lib/components/strategy/StrategyTreeEditor.svelte src/lib/components/strategy/StrategyTreeNode.svelte
git commit -m "feat(strategy): add strategy detail page with tree editor"
```

---

### Task 9: Sleeve Generation Dialog & Portfolio Creation

**Files:**
- Create: `src/lib/components/strategy/GenerateSleevesDialog.svelte`
- Modify: `src/routes/strategies/[slug]/+page.svelte`

**Step 1: Create the generation dialog component**

`GenerateSleevesDialog.svelte`:
- Props: `strategy: Strategy`, `onclose`, `ongenerate`
- Uses `detectTreeShape()` to determine if uniform or mixed
- For uniform: auto-selects "top-level" mode, shows preview of what will be generated
- For mixed: radio buttons with 3 options (top-level, per-branch, flat), each with preview
- Preview shows list of sleeve names + asset count per sleeve
- "Generate" and "Cancel" buttons
- GitHub feedback link at bottom: "Missing an option? [Leave feedback on GitHub](https://github.com/...)"

**Step 2: Wire dialog into detail page**

- "Generate Portfolios" button opens the dialog
- On generate: call `generateSleeves()`, create Portfolio objects for each sleeve, save via portfolios store
- Set `sourceStrategyId` on each new portfolio
- Update strategy's `generatedPortfolioIds`
- Show generated portfolios in the sleeves section with "From: {strategy}" badge

**Step 3: Add sync badge logic**

- In the sleeves section, for each generated portfolio, compare `strategy.updatedAt > portfolio.updatedAt`
- If out of sync, show amber "Out of sync" badge next to the portfolio name
- "Re-generate" button that opens confirmation dialog, then updates existing portfolios

**Step 4: Commit**

```bash
git add src/lib/components/strategy/GenerateSleevesDialog.svelte src/routes/strategies/[slug]/+page.svelte
git commit -m "feat(strategy): add sleeve generation dialog and portfolio sync"
```

---

### Task 10: Sunburst Chart

**Files:**
- Create: `src/lib/charts/SunburstChart.svelte`
- Create: `src/lib/charts/sunburst.ts` (math utilities)
- Create: `src/lib/charts/sunburst.test.ts`

**Step 1: Write failing tests for sunburst math**

```typescript
// src/lib/charts/sunburst.test.ts
import { describe, it, expect } from 'vitest';
import { computeSunburstArcs } from './sunburst';
import type { StrategyGroupNode, StrategyNode } from '$lib/types';

function makeLeaf(id: string, assetId: string, weight: number) {
  return { type: 'leaf' as const, id, assetId, weight };
}

function makeGroup(id: string, label: string, weight: number, children: StrategyNode[]): StrategyGroupNode {
  return { type: 'group', id, label, weight, children };
}

describe('computeSunburstArcs', () => {
  it('computes arcs for a simple two-child root', () => {
    const root = makeGroup('root', 'R', 1, [
      makeLeaf('a', 'x', 0.6),
      makeLeaf('b', 'y', 0.4),
    ]);
    const arcs = computeSunburstArcs(root);
    // Root children at depth 1
    const depth1 = arcs.filter((a) => a.depth === 1);
    expect(depth1).toHaveLength(2);
    // First arc starts at 0, spans 0.6 * 2π
    expect(depth1[0].startAngle).toBeCloseTo(0, 3);
    expect(depth1[0].endAngle).toBeCloseTo(0.6 * 2 * Math.PI, 3);
    // Second arc
    expect(depth1[1].startAngle).toBeCloseTo(0.6 * 2 * Math.PI, 3);
    expect(depth1[1].endAngle).toBeCloseTo(2 * Math.PI, 3);
  });

  it('computes nested arcs with correct angular spans', () => {
    const root = makeGroup('root', 'R', 1, [
      makeGroup('g', 'G', 0.5, [
        makeLeaf('a', 'x', 0.5),
        makeLeaf('b', 'y', 0.5),
      ]),
      makeLeaf('c', 'z', 0.5),
    ]);
    const arcs = computeSunburstArcs(root);
    const depth2 = arcs.filter((a) => a.depth === 2);
    expect(depth2).toHaveLength(2);
    // Each should span 0.25 * 2π (half of the group's half)
    const span = depth2[0].endAngle - depth2[0].startAngle;
    expect(span).toBeCloseTo(0.25 * 2 * Math.PI, 3);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/charts/sunburst.test.ts`
Expected: FAIL

**Step 3: Implement sunburst math**

```typescript
// src/lib/charts/sunburst.ts
import type { StrategyNode } from '$lib/types';

export interface SunburstArc {
  id: string;
  label: string;
  depth: number;
  startAngle: number;
  endAngle: number;
  absoluteWeight: number;
  node: StrategyNode;
}

/** Compute arc positions for all nodes in a strategy tree. */
export function computeSunburstArcs(root: StrategyNode): SunburstArc[] {
  const arcs: SunburstArc[] = [];
  const TWO_PI = 2 * Math.PI;

  function walk(node: StrategyNode, depth: number, startAngle: number, angularSpan: number): void {
    if (depth > 0) {
      arcs.push({
        id: node.id,
        label: node.type === 'group' ? node.label : node.id,
        depth,
        startAngle,
        endAngle: startAngle + angularSpan,
        absoluteWeight: angularSpan / TWO_PI,
        node,
      });
    }

    if (node.type === 'group') {
      let offset = startAngle;
      for (const child of node.children) {
        const childSpan = angularSpan * child.weight;
        walk(child, depth + 1, offset, childSpan);
        offset += childSpan;
      }
    }
  }

  walk(root, 0, 0, TWO_PI);
  return arcs;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/charts/sunburst.test.ts`
Expected: ALL PASS

**Step 5: Implement the Svelte SVG component**

`SunburstChart.svelte`:
- Props: `root: StrategyGroupNode`, `size: number` (default 400)
- Uses `computeSunburstArcs()` to get arc data
- Renders SVG with `<path>` elements for each arc using SVG arc commands
- Ring radii: innerRadius = depth * ringWidth, outerRadius = (depth + 1) * ringWidth
- Color scheme: HSL-based, each top-level child gets a base hue, descendants shift lightness
- Hover: highlight arc + ancestors, show tooltip with label + weight
- Click: zoom into sub-tree (update root reference to clicked group node)
- Breadcrumb trail for zoomed state

**Step 6: Commit**

```bash
git add src/lib/charts/sunburst.ts src/lib/charts/sunburst.test.ts src/lib/charts/SunburstChart.svelte
git commit -m "feat(strategy): add sunburst chart with SVG rendering"
```

---

### Task 11: Icicle Chart

**Files:**
- Create: `src/lib/charts/IcicleChart.svelte`
- Create: `src/lib/charts/icicle.ts`
- Create: `src/lib/charts/icicle.test.ts`

**Step 1: Write failing tests for icicle layout math**

```typescript
// src/lib/charts/icicle.test.ts
import { describe, it, expect } from 'vitest';
import { computeIcicleLayout } from './icicle';
import type { StrategyGroupNode, StrategyNode } from '$lib/types';

function makeLeaf(id: string, assetId: string, weight: number) {
  return { type: 'leaf' as const, id, assetId, weight };
}

function makeGroup(id: string, label: string, weight: number, children: StrategyNode[]): StrategyGroupNode {
  return { type: 'group', id, label, weight, children };
}

describe('computeIcicleLayout', () => {
  it('computes rect positions for a simple tree', () => {
    const root = makeGroup('root', 'R', 1, [
      makeLeaf('a', 'x', 0.6),
      makeLeaf('b', 'y', 0.4),
    ]);
    const rects = computeIcicleLayout(root, 600);
    const depth1 = rects.filter((r) => r.depth === 1);
    expect(depth1).toHaveLength(2);
    expect(depth1[0].x).toBeCloseTo(0, 1);
    expect(depth1[0].width).toBeCloseTo(360, 1); // 0.6 * 600
    expect(depth1[1].x).toBeCloseTo(360, 1);
    expect(depth1[1].width).toBeCloseTo(240, 1); // 0.4 * 600
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/charts/icicle.test.ts`
Expected: FAIL

**Step 3: Implement icicle layout math**

```typescript
// src/lib/charts/icicle.ts
import type { StrategyNode } from '$lib/types';

export interface IcicleRect {
  id: string;
  label: string;
  depth: number;
  x: number;
  width: number;
  absoluteWeight: number;
  node: StrategyNode;
}

/** Compute rectangle positions for an icicle chart layout. */
export function computeIcicleLayout(root: StrategyNode, totalWidth: number): IcicleRect[] {
  const rects: IcicleRect[] = [];

  function walk(node: StrategyNode, depth: number, x: number, width: number): void {
    if (depth > 0) {
      rects.push({
        id: node.id,
        label: node.type === 'group' ? node.label : node.id,
        depth,
        x,
        width,
        absoluteWeight: width / totalWidth,
        node,
      });
    }

    if (node.type === 'group') {
      let offset = x;
      for (const child of node.children) {
        const childWidth = width * child.weight;
        walk(child, depth + 1, offset, childWidth);
        offset += childWidth;
      }
    }
  }

  walk(root, 0, 0, totalWidth);
  return rects;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/charts/icicle.test.ts`
Expected: ALL PASS

**Step 5: Implement the Svelte SVG component**

`IcicleChart.svelte`:
- Props: `root: StrategyGroupNode`, `width: number` (default 600), `rowHeight: number` (default 40)
- Uses `computeIcicleLayout()` for rect positions
- Renders SVG with `<rect>` elements, y = depth * rowHeight
- Same color scheme as sunburst
- Hover: highlight rect + ancestors, tooltip
- Click: zoom into sub-tree

**Step 6: Commit**

```bash
git add src/lib/charts/icicle.ts src/lib/charts/icicle.test.ts src/lib/charts/IcicleChart.svelte
git commit -m "feat(strategy): add icicle chart with SVG rendering"
```

---

### Task 12: Wire Charts into Strategy Detail Page

**Files:**
- Modify: `src/routes/strategies/[slug]/+page.svelte`

**Step 1: Add chart toggle and components**

- Import `SunburstChart` and `IcicleChart`
- Add toggle state: `let chartMode: 'sunburst' | 'icicle' = $state('sunburst')`
- Render toggle buttons above the chart area in the right panel
- Conditionally render the selected chart component, passing `strategy.root`
- Both charts should reactively update when the tree is edited

**Step 2: Commit**

```bash
git add src/routes/strategies/[slug]/+page.svelte
git commit -m "feat(strategy): wire sunburst and icicle charts into detail page"
```

---

### Task 13: Portfolio Badge ("From Strategy")

**Files:**
- Modify: `src/routes/portfolios/+page.svelte`
- Modify: `src/routes/portfolios/[slug]/+page.svelte`

**Step 1: Handle `sourceStrategyId` in portfolio views**

- In the portfolio list page cards: if `portfolio.sourceStrategyId` is set, show a small badge "From: {strategy name}" (look up from strategies store)
- In the portfolio detail page header: show the same badge, linked to the strategy detail page
- If `strategy.updatedAt > portfolio.updatedAt`, show the badge in amber with "Out of sync" text

**Step 2: Handle missing `sourceStrategyId` on existing portfolios**

- Existing portfolios won't have `sourceStrategyId`. Treat `undefined` or `null` as "not from a strategy" (no badge).

**Step 3: Commit**

```bash
git add src/routes/portfolios/+page.svelte src/routes/portfolios/[slug]/+page.svelte
git commit -m "feat(strategy): add 'From Strategy' badge to portfolio views"
```

---

### Task 14: Strategy Deletion Cascade

**Files:**
- Modify: `src/lib/stores/strategies.ts`
- Modify: `src/lib/stores/portfolios.ts`

**Step 1: Clear sourceStrategyId on strategy deletion**

In `strategies.ts`, update `removeStrategy` to also clear the link from generated portfolios:

```typescript
export async function removeStrategy(id: string): Promise<void> {
  const current = get(strategies);
  const strategy = current.find((s) => s.id === id);
  if (strategy) {
    // Unlink generated portfolios
    await unlinkPortfoliosFromStrategy(strategy.generatedPortfolioIds);
  }
  await db.remove(id);
  strategies.update((list) => list.filter((s) => s.id !== id));
}
```

In `portfolios.ts`, add:

```typescript
export async function unlinkPortfoliosFromStrategy(portfolioIds: string[]): Promise<void> {
  const current = get(portfolios);
  for (const pid of portfolioIds) {
    const portfolio = current.find((p) => p.id === pid);
    if (portfolio && portfolio.sourceStrategyId) {
      const updated = { ...portfolio, sourceStrategyId: null, updatedAt: new Date().toISOString() };
      await db.put(updated);
      portfolios.update((list) => list.map((p) => (p.id === pid ? updated : p)));
    }
  }
}
```

**Step 2: Handle portfolio deletion unlinking from strategy**

In `removePortfolio`, add logic to remove the portfolio ID from any strategy's `generatedPortfolioIds`:

```typescript
export async function removePortfolio(id: string): Promise<void> {
  await db.remove(id);
  portfolios.update((list) => list.filter((p) => p.id !== id));
  // Unlink from any strategy
  await removePortfolioFromStrategies(id);
}
```

In `strategies.ts`, add:

```typescript
export async function removePortfolioFromStrategies(portfolioId: string): Promise<void> {
  const current = get(strategies);
  for (const strategy of current) {
    if (strategy.generatedPortfolioIds.includes(portfolioId)) {
      const updated = {
        ...strategy,
        generatedPortfolioIds: strategy.generatedPortfolioIds.filter((id) => id !== portfolioId),
      };
      await db.put(updated);
      strategies.update((list) => list.map((s) => (s.id === strategy.id ? updated : s)));
    }
  }
}
```

**Step 3: Commit**

```bash
git add src/lib/stores/strategies.ts src/lib/stores/portfolios.ts
git commit -m "feat(strategy): add deletion cascades for strategy-portfolio links"
```

---

### Task 15: Final Integration & Manual Testing

**Files:**
- All strategy-related files

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Manual testing checklist**

1. Create a strategy from the list page
2. Add groups and leaf assets in the tree editor
3. Verify sunburst chart updates live
4. Toggle to icicle chart
5. Generate portfolios (test both uniform and mixed depth trees)
6. Verify generated portfolios appear in Portfolios page with badge
7. Edit the strategy → verify "Out of sync" badge appears
8. Re-generate → verify portfolios updated
9. Delete an asset → verify it cascades to strategies
10. Delete a strategy → verify portfolios are unlinked but kept
11. Delete a generated portfolio → verify strategy's generatedPortfolioIds updated

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "feat(strategy): integration fixes and polish"
```
