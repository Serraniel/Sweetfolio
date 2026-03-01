# Strategy Feature Design

**Date:** 2026-02-28
**Status:** Design complete, implementation planning

## Overview

Add a hierarchical "Strategy" feature that lets users define multi-level allocation plans (e.g., Core-Satellite), visualize them as sunburst/icicle charts, and generate linked Portfolios (sleeves) from them.

## Terminology

| Concept | Name | Description |
|---|---|---|
| Flat weighted basket of assets | **Portfolio** | Already exists. Backtestable, measurable. The execution-level concept. |
| Hierarchical allocation tree | **Strategy** | New feature. Planning-level concept - *why* you hold what you hold. |
| Sub-portfolios generated from strategy nodes | **Sleeves** | Internal concept bridging strategy to portfolios. |

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Navigation placement | New top-level nav item "Strategies" | Matches industry pattern of separating planning from measuring |
| Tree depth | Unlimited recursive | Real-world strategies (e.g., Satellite → China → General China → ETFs) need arbitrary depth |
| Leaf node types | Assets only | Keeps Strategy as sole hierarchical concept. Simpler data model. |
| Page layout | Tree editor left, visualization right | Two-panel layout with tree for editing and chart for overview |
| Visualization | Sunburst + Icicle (toggle) | Sunburst as default, icicle as alternative for clearer hierarchy reading |
| Sleeve generation | Smart defaults + simple dialog | Auto-detect tree shape, offer 2-3 grouping options, GitHub feedback link |
| Portfolio sync | Linked with manual re-generate | "From Strategy: X" badge, "out of sync" indicator, explicit re-generate action |

## Data Model

```typescript
interface Strategy {
  id: string;                      // UUID
  name: string;                    // e.g., "Core-Satellite 2026"
  root: StrategyNode;              // The tree root (always a group node)
  generatedPortfolioIds: string[]; // IDs of linked portfolios
  createdAt: string;
  updatedAt: string;
}

interface StrategyGroupNode {
  type: 'group';
  id: string;                      // UUID (for tree operations)
  label: string;                   // e.g., "Core", "China", "Crypto"
  weight: number;                  // 0-1, relative to siblings (must sum to 1)
  children: StrategyNode[];        // At least 1 child
}

interface StrategyLeafNode {
  type: 'leaf';
  id: string;                      // UUID
  assetId: string;                 // References an Asset
  weight: number;                  // 0-1, relative to siblings
}

type StrategyNode = StrategyGroupNode | StrategyLeafNode;
```

Key points:
- Tree is recursive via `children` on group nodes
- Weights are **relative to siblings** (always sum to 1.0 within a parent)
- Absolute weight is computed by multiplying down the path (Core 0.8 × World 0.7 = 0.56)
- `generatedPortfolioIds` tracks the link for the "out of sync" badge
- New IndexedDB object store: `strategies`

## Strategy Tree Editor (Left Panel)

**Interactions:**
- Each group node is collapsible (▼/▶) with its label and weight displayed
- Each leaf node shows the asset name and weight
- Hovering a node reveals action buttons: [+] (add child), [x] (remove), [↕] (drag to reorder)
- Adding a child to a group: choose "Add Asset" (becomes leaf) or "Add Group" (becomes sub-group)
- Weight editing: inline slider or number input next to each node, auto-normalizes siblings to sum to 1.0
- Weight normalization matches existing portfolio behavior (proportional redistribution)

**Validation:**
- Every group must have at least 1 child
- Every leaf must reference a valid asset
- Sibling weights must sum to 1.0 (enforced by auto-normalization)
- Same asset can appear in multiple branches (valid for different strategic purposes)
- Empty strategy (root with no children) shows a prompt to add first node

**Tree state:**
- Expansion/collapse state is ephemeral (not persisted)
- Edits save on every change (debounced, same pattern as existing portfolio editing)

## Visualization (Right Panel)

**Sunburst Chart (default):**
- Concentric rings: inner = higher-level groups, outer = leaf assets
- Arc angle proportional to absolute weight (multiplied down the path)
- Color scheme: each top-level group gets a base color, children are shades/tints of that color
- Hover: highlights the hovered segment + its ancestry path, shows tooltip with label, relative weight, and absolute weight
- Click: zooms into that sub-tree (the clicked node becomes the new "center"), breadcrumb trail to navigate back

**Icicle Chart (toggle):**
- Horizontal bars stacked top-down, one row per tree level
- Width proportional to absolute weight
- Same color scheme and hover/click behavior as sunburst
- Better for reading exact hierarchy and comparing weights across siblings

**Toggle:**
- Small toggle button above the chart: `[Sunburst | Icicle]`
- Preference is ephemeral (not persisted)

**Chart implementation:**
- Custom SVG components (no new dependency) - uPlot doesn't support these chart types
- SVG `<path>` arcs for sunburst, `<rect>` elements for icicle

## Sleeve Generation & Portfolio Link

**Generate Portfolios flow:**
1. User clicks "Generate Portfolios" button in the tree editor
2. System analyzes tree shape:
   - **Uniform depth** (all branches same depth): auto-generate one portfolio per node at the deepest grouping level. No dialog needed.
   - **Mixed depth**: show dialog with options:
     - "Top-level buckets" (e.g., Core, Satellite)
     - "One portfolio per branch" (e.g., Core, China, Crypto - each terminal group)
     - "Single flat portfolio" (all leaf assets flattened)
   - Dialog includes GitHub feedback link: "Missing an option? Leave feedback"
3. For each resulting sleeve: create a Portfolio with computed absolute weights, name it `"{Strategy Name} - {Node Label}"`, set `isBenchmark: false`
4. Store the generated portfolio IDs in `strategy.generatedPortfolioIds`

**Portfolio badge & sync:**
- Generated portfolios display a badge: `"From: {Strategy Name}"`
- When the strategy is edited after generation, portfolios show `"Out of sync"` indicator
- "Out of sync" detection: compare the strategy's `updatedAt` vs the portfolio's `updatedAt` - if strategy is newer, it's out of sync
- User clicks "Re-generate" on the strategy page to update all linked portfolios (replaces allocations, preserves portfolio ID so metrics history and benchmark refs stay intact)
- Re-generate shows a confirmation: "This will update N portfolios. Continue?"

**Portfolio independence:**
- Generated portfolios are full Portfolio objects - they appear in the Portfolios page, can be used as benchmarks, included in simulations
- User can manually edit a generated portfolio - this is allowed but the "From Strategy" badge remains (re-generate would overwrite manual changes, the confirmation warns about this)

## Strategy List Page

**Layout:**
- Same grid pattern as the Portfolios list page (auto-fill, 280px min-width cards)
- Each card shows:
  - Strategy name
  - Mini sunburst thumbnail (small, non-interactive, just for visual recognition)
  - Number of assets (leaf count)
  - Tree depth indicator (e.g., "3 levels")
  - Number of generated portfolios (if any)
- Hover reveals delete button (same pattern as portfolios)

**Create flow:**
- "Create Strategy" button opens a modal
- Modal asks for strategy name only
- Creates a strategy with an empty root group node named same as strategy
- Redirects to the strategy detail page for tree editing

**Empty state:**
- Same pattern as portfolios empty state
- Brief explanation of what strategies are and how they differ from portfolios

## Cascading Deletes & Data Integrity

**Deleting a Strategy:**
- Does NOT delete generated portfolios (they're useful independently)
- Removes the "From Strategy: X" badge from linked portfolios (clears the link)
- Confirmation dialog: "Delete strategy '{name}'? Generated portfolios will be kept but unlinked."

**Deleting an Asset:**
- Existing cascade: removes from portfolios (with weight renormalization)
- New cascade: removes leaf nodes referencing that asset from all strategies
- If removing a leaf leaves its parent group with 0 children, remove the parent group too (recursive cleanup up the tree)
- Weight renormalization on remaining siblings (same proportional redistribution)

**Deleting a Portfolio that was generated from a Strategy:**
- Removes its ID from `strategy.generatedPortfolioIds`
- No other effect on the strategy

**Data integrity on load:**
- Validate that all leaf `assetId` references point to existing assets
- If an asset was deleted while the app was closed, prune orphaned leaves on load with the same recursive cleanup
