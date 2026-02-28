# Auto-Refresh Scraped Assets on Startup

## Problem

Users who import assets via ISIN/WKN lookup have stale price data when they return to Sweetfolio after a few days. They must manually re-fetch each asset.

## Solution

Automatically refresh assets that have an ISIN or WKN on app startup when the data is stale (>24 hours old). Show a progress notification during refresh and prompt the user if price conflicts are detected.

## Design

### Data Model

Add `lastRefreshedAt: string | null` to the `Asset` type. Null means never auto-refreshed. Existing assets default to null/undefined (no migration needed).

When an asset is created via the identifier lookup flow, `lastRefreshedAt` is set to the creation timestamp. After each successful auto-refresh, it is updated to the current timestamp.

### Refresh Logic

New module: `src/lib/stores/auto-refresh.ts`

1. After `initStores()` completes, call `autoRefreshAssets()`
2. Find assets where `(isin || wkn)` is set AND `lastRefreshedAt` is null or older than 24 hours
3. For each stale asset, call `fetchByISIN(asset.isin)` or `fetchByWKN(asset.wkn)`
4. Merge strategy:
   - Append price points with dates not present in existing data
   - For overlapping dates: keep existing data unless price deviates >1%, in which case flag as conflict
5. Update asset with merged prices and set `lastRefreshedAt` to now
6. Fetch sequentially (one at a time) to avoid rate limiting

### Conflict Handling

If any conflicts are detected (>1% price deviation on an overlapping date):
- Queue conflicts per asset
- After all refreshes complete, show a modal listing conflicts
- User can "Keep existing" or "Use new data" per conflict (or per asset)

### UI: Progress Notification

During auto-refresh, show a toast-style notification at the bottom-right:
- Text: "Refreshing assets... (2/5)"
- CSS progress bar fills as assets complete
- Disappears after all assets are done (or after a short delay on completion)
- If an asset fetch fails, show a brief error toast but continue with remaining assets

### Settings

- Key: `autoRefreshAssets` (boolean, default: `true` — opt-out)
- Add toggle to Settings page: "Auto-refresh assets on startup"
- Description: "Automatically fetch latest price data for assets with ISIN/WKN when you open Sweetfolio"

### Trigger Point

The refresh runs in `+layout.svelte`'s `onMount` after `initStores()` resolves. It is fire-and-forget — does not block page rendering.

## Scope

- Only assets with `isin` or `wkn` set are candidates
- Staleness threshold: 24 hours
- Replace entirely is NOT used — append/merge only
- Conflict threshold: >1% price deviation on same date
