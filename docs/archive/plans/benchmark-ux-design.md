# Benchmark Configuration UX Design

## Problem Statement

Sweetfolio users need to compare their portfolios against a benchmark (e.g., MSCI World ETF, S&P 500 index, DAX). The current "Use as benchmark" feature is limited to portfolios only and buried behind a button on the portfolio detail page and a checkbox in the create/edit portfolio modal. There is no way to use a single uploaded asset (a common use case) as a benchmark, and the feature is not discoverable from the main listing pages.

### Current State

- `Portfolio.isBenchmark` exists as a boolean field
- `SimulationConfig.benchmarkPortfolioId` exists but is always set to `null`
- `PerformanceChart` already supports `isBenchmark` on series (renders in hot pink, `BENCHMARK_COLOR`)
- `EfficientFrontier` already accepts an optional `benchmark` prop (renders as a highlighted dot)
- The `Asset` type has no benchmark concept
- The assets table (`/assets`) has no benchmark affordance
- The settings page has no benchmark configuration

### Design Principles

1. **One active benchmark across the app** -- retail investors think in terms of "my benchmark" globally, not per-page
2. **Assets and portfolios are both valid benchmarks** -- a single MSCI World ETF CSV is the most common case
3. **Discoverable without being intrusive** -- the feature should be findable within the first session
4. **Reversible and obvious** -- users must always see what the current benchmark is and be able to change it

### Data Model Change (for context)

A new global setting will be stored:

```
benchmarkRef: { type: 'asset', id: string } | { type: 'portfolio', id: string } | null
```

This replaces the per-portfolio `isBenchmark` boolean. It is stored in the settings store (`$settings.benchmarkRef`) and resolved app-wide.

---

## Approach A: Inline Star/Flag Toggle in Tables

### Description

Add a "benchmark" toggle column to both the assets table and the portfolios grid. The toggle uses a flag/target icon that acts as a radio button -- clicking it on any row makes that item the active benchmark and deactivates the previous one. The current benchmark row gets a subtle highlight.

### Where It Appears

| Page | Element |
|---|---|
| `/assets` | New leftmost column in the asset table with a clickable flag icon per row |
| `/portfolios` | Small flag icon in each portfolio card header (next to the name) |
| `/assets/[id]` | "Benchmark" badge in the header + toggle button in header actions |
| `/portfolios/[id]` | Same as current "Set as Benchmark" button, but now it writes to the global setting |
| `/simulation` | Benchmark indicator in the config panel showing the current benchmark name |
| `/settings` | "Benchmark" section showing the active benchmark with a "Clear" action |

### ASCII Mockups

**Assets table (`/assets`):**

```
+----+---------------------+--------------+-----+-------------+--------------------+--------+
|    | Name                | ISIN         | Cur | Data Points | Date Range         |        |
+----+---------------------+--------------+-----+-------------+--------------------+--------+
| ** | MSCI World ETF      | IE00BJ0KDQ92 | EUR | 5,218       | 2004-01-02 - 2024  | [del]  |
|    | DAX Index           | DE0008469008 | EUR | 8,412       | 1990-01-02 - 2024  | [del]  |
|    | US Treasury Bond    | --           | USD | 3,104       | 2012-03-01 - 2024  | [del]  |
+----+---------------------+--------------+-----+-------------+--------------------+--------+

  ** = filled flag icon (accent color), indicates active benchmark
     = empty flag icon (muted), clickable to set as benchmark
```

The flag column header shows a tooltip: "Set as benchmark for comparison".

**Portfolio card on `/portfolios`:**

```
+-------------------------------------------+
|  My Growth Portfolio                       |
|  3 assets                                  |
|                                            |
+-------------------------------------------+

+-------------------------------------------+
|  [**] MSCI World Tracker     [Benchmark]   |
|  1 asset                                   |
|                                            |
+-------------------------------------------+

  [**] = filled flag icon inline with the name
  [Benchmark] = pill badge (already exists in the CSS)
```

**Asset detail page header (`/assets/[id]`):**

```
  < Assets

  MSCI World ETF                [Benchmark]
                                [Edit] [Set as Benchmark] [Delete]
```

When it IS the benchmark, the button reads "Remove Benchmark" and the badge is visible.

### Accessibility Considerations

- The flag icon is rendered as a `<button>` with `role="radio"` inside a group with `role="radiogroup"` and `aria-label="Select benchmark"`.
- Each button has `aria-label="Set MSCI World ETF as benchmark"` or `aria-label="MSCI World ETF is the current benchmark. Click to remove."`.
- `aria-checked="true"` on the active benchmark.
- Keyboard: Tab navigates to the flag column; arrow keys move between rows; Enter/Space toggles.
- The filled icon uses both color AND a shape change (outline star vs. filled star) so it is not color-dependent.
- Focus ring follows the app's existing `:focus-visible` outline style.

### Pros

- Very low friction -- one click from the main listing pages.
- Visible at a glance which item is the benchmark.
- Works identically for assets and portfolios.
- Familiar pattern (Gmail star, Spotify heart).

### Cons

- Adds a column to the already-full assets table (though it is narrow, ~32px).
- On mobile, the flag column compresses the table; may need to be an icon-only column.
- Users might confuse the flag with a "favorite" feature if the icon is not clear enough. Mitigate with a tooltip and the "Benchmark" label in the column header.

---

## Approach B: Global Benchmark Picker in Settings + Contextual "Compare to Benchmark" Overlays

### Description

Instead of per-row toggles, the benchmark is configured in a dedicated section on the Settings page (or a top-level "Benchmark" flyout accessible from the sidebar). Everywhere else, the benchmark is passively displayed: charts automatically overlay the benchmark line when data is available, and a small persistent indicator in the sidebar or page header shows the active benchmark name.

The key insight: users set the benchmark once and rarely change it. So the configuration can live in Settings, while the *consumption* of the benchmark is automatic and pervasive.

### Where It Appears

| Page | Element |
|---|---|
| `/settings` | New "Benchmark" card with a combobox/select that lists all assets and portfolios, grouped by type |
| Sidebar (`Nav.svelte`) | Small benchmark indicator at the bottom: "BM: MSCI World" (truncated), clickable to go to settings |
| `/assets/[id]` | Performance chart automatically includes the benchmark as a dashed overlay line |
| `/portfolios/[id]` | Performance chart includes benchmark overlay; metrics table shows benchmark comparison column |
| `/simulation` | Efficient frontier chart plots the benchmark as a highlighted reference point |

### ASCII Mockups

**Settings page -- new "Benchmark" card:**

```
+----------------------------------------------------------+
|  Benchmark                                               |
|                                                          |
|  Select an asset or portfolio to use as your benchmark   |
|  for performance comparisons across the app.             |
|                                                          |
|  [v  MSCI World ETF (Asset)                         v]   |
|                                                          |
|  Options:                                                |
|    -- None --                                            |
|    Assets                                                |
|      MSCI World ETF                                      |
|      DAX Index                                           |
|    Portfolios                                            |
|      My Growth Portfolio                                 |
|      Conservative Mix                                    |
|                                                          |
+----------------------------------------------------------+
```

**Sidebar benchmark indicator:**

```
  [S] Sweetfolio                Nav expanded:
  ---                           +---------------------------+
  > Dashboard                   |  ...nav links...          |
  > Assets                      |                           |
  > Portfolios                  | BM: MSCI World ETF        |
  > Simulation                  | [Theme] [<<]              |
  > Settings                    +---------------------------+
```

When collapsed, the indicator becomes a small "BM" icon with a tooltip.

**Asset detail -- automatic benchmark overlay on price chart:**

```
  Price History
  +----------------------------------------------------------+
  |               ___----                                     |
  |          __---    benchmark (dashed, pink)                |
  |     __---                                                 |
  |  ---          ____------                                  |
  |          ____-    asset (solid, teal)                     |
  |     ____-                                                 |
  |  ---                                                      |
  +----------------------------------------------------------+
  Legend: ---- MSCI World ETF (Benchmark)   ---- DAX Index
```

### Accessibility Considerations

- The settings combobox is a standard `<select>` element with `<optgroup>` for "Assets" and "Portfolios", fully keyboard-navigable natively.
- The sidebar indicator is a `<a>` link to `/settings#benchmark` with `aria-label="Current benchmark: MSCI World ETF. Click to change."`.
- Chart overlays include the benchmark in the chart legend with a `(Benchmark)` suffix, which screen readers can access via the uPlot legend DOM.
- No custom ARIA roles needed -- this approach relies on native HTML elements.

### Pros

- Zero clutter on the main listing pages.
- "Set once, use everywhere" matches how most retail investors think.
- The automatic overlay on every chart is powerful -- users do not have to opt in per page.
- Settings is the natural home for a global configuration.
- Very accessible by default (native `<select>` element).

### Cons

- **Discoverability is poor** -- a new user would not know to go to Settings to configure a benchmark. They would look for it on the assets or portfolios pages.
- No inline affordance to quickly swap the benchmark when browsing assets.
- The sidebar indicator takes up vertical space in an already compact nav.
- If the user has many assets/portfolios, the select dropdown becomes long. Would benefit from a searchable combobox for larger data sets.

---

## Approach C (Recommended): Hybrid -- Contextual Quick-Set + Global Indicator

### Description

Combine the best of A and B: lightweight contextual toggles where users browse data, plus a persistent global indicator and a settings fallback. The primary interaction is a "Set as benchmark" action available in context menus and action bars. A persistent but unobtrusive banner/chip at the top of comparison-relevant pages shows the current benchmark and allows quick clearing.

### Where It Appears

| Page | Element |
|---|---|
| `/assets` (table) | New icon-button column (leftmost) with a target/flag icon per row |
| `/assets/[id]` (detail) | "Set as Benchmark" / "Remove Benchmark" button in the header actions bar; benchmark badge next to `<h1>` |
| `/portfolios` (list) | Flag icon in each portfolio card (same pattern as assets table) |
| `/portfolios/[id]` (detail) | Existing "Set as Benchmark" button updated to write global setting; badge in title row |
| `/simulation` | Benchmark reference point on the efficient frontier chart; benchmark name shown in config panel |
| All chart pages | **Benchmark context bar**: a thin bar above charts that says "Compared to: MSCI World ETF [x]" when a benchmark is active |
| `/settings` | "Benchmark" card (as in Approach B) as a fallback/override configuration point |

### ASCII Mockups

**Assets table with benchmark column:**

```
  Assets
  Manage your uploaded securities data

  [====== File Dropzone ======]

  +----+---------------------+--------------+-----+-------------+------------------+------+
  | BM | Name                | ISIN         | Cur | Data Points | Date Range       |      |
  +----+---------------------+--------------+-----+-------------+------------------+------+
  | () | MSCI World ETF      | IE00BJ0KDQ92 | EUR | 5,218       | 2004-01 - 2024   | [x]  |
  | () | DAX Index           | DE0008469008 | EUR | 8,412       | 1990-01 - 2024   | [x]  |
  | () | S&P 500             | --           | USD | 3,104       | 2012-03 - 2024   | [x]  |
  +----+---------------------+--------------+-----+-------------+------------------+------+

  () = unfilled circle/target icon (--color-text-muted)
```

**After clicking the target icon on "MSCI World ETF":**

```
  +----+---------------------+--------------+-----+-------------+------------------+------+
  | BM | Name                | ISIN         | Cur | Data Points | Date Range       |      |
  +----+---------------------+--------------+-----+-------------+------------------+------+
  | (x)| MSCI World ETF      | IE00BJ0KDQ92 | EUR | 5,218       | 2004-01 - 2024   | [x]  |
  | () | DAX Index           | DE0008469008 | EUR | 8,412       | 1990-01 - 2024   | [x]  |
  | () | S&P 500             | --           | USD | 3,104       | 2012-03 - 2024   | [x]  |
  +----+---------------------+--------------+-----+-------------+------------------+------+

  (x) = filled circle/target icon (--color-accent, teal) with subtle row highlight
```

**Benchmark context bar (appears on chart-containing pages when benchmark is set):**

```
  +------------------------------------------------------------------+
  |  Benchmark: MSCI World ETF                          [Change] [x] |
  +------------------------------------------------------------------+

  A thin, 36px-tall bar in --color-bg-secondary with a left-aligned label,
  a subtle border-bottom, and right-aligned actions.

  [Change] opens a small dropdown/popover with the grouped list of
  assets and portfolios (same as the settings select).
  [x] clears the benchmark.
```

**Portfolio detail -- performance chart with benchmark overlay:**

```
  +------------------------------------------------------------------+
  |  Benchmark: MSCI World ETF                          [Change] [x] |
  +------------------------------------------------------------------+

  Performance Comparison
  +------------------------------------------------------------------+
  | [1Y] [3Y] [5Y] [10Y] [ALL]                                      |
  |                                                                  |
  |          ___-----  My Portfolio (teal)                            |
  |     ___--                                                        |
  |  ---       . . . .   MSCI World ETF (pink dashed, benchmark)     |
  |        . .                                                       |
  |    . .                                                           |
  |  .                                                               |
  +------------------------------------------------------------------+
  Legend: -- My Portfolio   .... MSCI World ETF (Benchmark)
```

**Simulation page -- efficient frontier with benchmark marker:**

```
  Configuration                  Efficient Frontier
  +-----------------------+      +--------------------------------------+
  | Simulations: 10,000   |      |                                      |
  | Assets:               |      |        . .  .                        |
  |  [x] MSCI World       |      |      .  . .. .  .                    |
  |  [x] DAX Index        |      |     . ..  .  .   .                   |
  |  [x] S&P 500          |      |    .__------- efficient frontier     |
  |                       |      |   . .  .  .                          |
  | Benchmark:            |      |  . .  .                              |
  | MSCI World ETF        |      |  [*] = benchmark (pink dot)          |
  |                       |      +--------------------------------------+
  | [Run Simulation]      |
  +-----------------------+
```

**Settings page -- benchmark section (fallback):**

```
  +----------------------------------------------------------+
  |  Benchmark                                               |
  |                                                          |
  |  The benchmark is used for performance comparisons       |
  |  across all charts and the simulation page.              |
  |                                                          |
  |  Current: MSCI World ETF (Asset)                         |
  |                                                          |
  |  [v  Select a different benchmark...                v]   |
  |      -- None --                                          |
  |      Assets                                              |
  |        MSCI World ETF                                    |
  |        DAX Index                                         |
  |        S&P 500                                           |
  |      Portfolios                                          |
  |        My Growth Portfolio                               |
  |        Conservative Mix                                  |
  |                                                          |
  |  [Clear Benchmark]                                       |
  +----------------------------------------------------------+
```

**Asset detail header when it IS the benchmark:**

```
  < Assets

  MSCI World ETF   [Benchmark]
                                     [Edit] [Remove Benchmark] [Delete]
```

**Asset detail header when it is NOT the benchmark:**

```
  < Assets

  DAX Index
                                     [Edit] [Set as Benchmark] [Delete]
```

### Accessibility Considerations

- **Table column icons**: Each icon is a `<button>` with `aria-label` describing the action ("Set MSCI World ETF as benchmark" / "MSCI World ETF is the current benchmark. Click to remove."). Uses `role="radio"` within a `role="radiogroup"` on the column, with `aria-checked` state.
- **Benchmark context bar**: Uses `role="status"` and `aria-live="polite"` so screen readers announce when the benchmark changes. The bar is a `<div>` landmark, not a `<header>`, to avoid confusion with page headers.
- **Change popover**: The [Change] button opens a popover with `role="listbox"` and `aria-label="Select benchmark"`. Items use `role="option"` with `aria-selected`. `<optgroup>`-equivalent grouping uses `role="group"` with `aria-label="Assets"` / `aria-label="Portfolios"`.
- **Keyboard navigation**: Tab reaches the benchmark column in the table. Arrow keys navigate between rows. Enter/Space toggles. Escape closes any open popover. The context bar's [Change] and [x] are standard focusable buttons.
- **Color independence**: The active benchmark icon uses a filled shape (not just a color change). The benchmark context bar uses a distinct background shade plus text label. Chart benchmark lines use both a different color (pink) AND a dashed stroke style.
- **Touch targets**: All interactive elements are at least 44x44px tap targets (icon buttons padded to 44px, context bar buttons are 36px tall with adequate horizontal padding).
- **Reduced motion**: Badge/bar transitions respect `prefers-reduced-motion`.

### Pros

- **Highly discoverable**: the flag column in the table is visible immediately, and the context bar on chart pages explains the benchmark concept.
- **Fast to set**: one click from the assets or portfolios listing.
- **Clear feedback**: the context bar + badge make the active benchmark obvious everywhere.
- **Flexible**: power users can configure via Settings; casual users use the inline toggle.
- **Works for both assets and portfolios** with a unified data model.
- **Leverages existing UI**: the `PerformanceChart` already supports `isBenchmark` series; `EfficientFrontier` already accepts a `benchmark` prop. The pill badge CSS already exists on the portfolios page.
- **Unobtrusive when no benchmark is set**: the context bar simply does not render, and the flag column shows muted empty icons.

### Cons

- Slightly more implementation work than A or B alone (table column + context bar + settings section + popover).
- The context bar takes up ~36px of vertical space on chart pages (though it collapses when no benchmark is set).
- The popover in the context bar needs careful z-index management to not conflict with chart tooltips.

---

## Recommendation

**Approach C (Hybrid)** is recommended. It provides the best balance of discoverability, speed, and flexibility. The inline table toggle makes the feature findable on first encounter. The context bar makes the active benchmark visible wherever comparisons happen. The settings fallback provides a predictable "source of truth" for power users.

### Implementation Priority

1. **Data model**: Add `benchmarkRef` to settings store; deprecate `Portfolio.isBenchmark`.
2. **Settings page**: Add benchmark picker card.
3. **Assets table**: Add benchmark column with toggle icons.
4. **Portfolios list**: Add benchmark icon to portfolio cards.
5. **Benchmark context bar**: New shared component, rendered on asset detail, portfolio detail, and simulation pages.
6. **Chart integration**: Pass benchmark series to `PerformanceChart` and `EfficientFrontier` based on the global setting.
7. **Detail page buttons**: Update "Set as Benchmark" / "Remove Benchmark" on both asset and portfolio detail pages.
8. **Sidebar indicator** (optional, lower priority): Small "BM:" indicator in the nav footer.

### Migration

- Existing portfolios with `isBenchmark: true` should be automatically migrated to the new `benchmarkRef` setting on first load.
- The `isBenchmark` field on `Portfolio` can be kept as a computed/derived value for backward compatibility but should not be the source of truth.
