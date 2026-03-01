# Auto Currency Fetch Design

**Date:** 2026-03-01

## Problem

Currency conversion rate files must currently be uploaded manually by users. The app already has an ECB fetcher (`src/lib/fetchers/ecb.ts`) that can fetch exchange rates for 30+ currencies against EUR with no API key and full CORS support. When users have assets denominated in currencies different from their display currency, they should not have to manually source and upload exchange rate CSVs.

## Solution

Automatically detect needed currency pairs and fetch exchange rates from the ECB when:
1. App startup (alongside auto-refresh)
2. User changes their display currency (`mainCurrency` setting)
3. Daily auto-refresh completes (new assets may introduce new currencies)
4. A new asset is imported with a foreign currency

## Architecture

### Core Module: `src/lib/stores/currency-auto-fetch.ts`

- **Detection:** Scans all assets, compares each `asset.currency` to `mainCurrency`. Collects unique foreign currencies needing conversion.
- **Cross-rate derivation:** ECB only provides rates against EUR. For non-EUR main currencies (e.g. USD), fetch both foreign currency and mainCurrency rates against EUR, then derive cross-rates. E.g. GBPUSD = GBPEUR / USDEUR for each date.
- **Merge strategy:** ECB-fetched rates are merged with existing stored rates. Manually uploaded rates are preserved on overlapping dates; ECB fills gaps.
- **Staleness:** Rates are stale after 24 hours (same as asset refresh).
- **Progress:** `currencyFetchProgress` writable store: `{ active, current, total, currentPair, errors }`.

### Cross-Rate Utility

`deriveCrossRate(sourceEURRates, targetEURRates, pair): CurrencyRate` — aligns dates from both EUR-based rate series, divides to get cross-rate.

### Toast: `src/lib/components/shared/CurrencyFetchToast.svelte`

Follows `RefreshProgressToast.svelte` pattern exactly:
- Shows "Fetching exchange rates... (2/4)" with current pair
- Progress bar
- Auto-dismiss on completion
- Error display if pairs fail

### Trigger Integration

- `+layout.svelte`: Call `autoFetchCurrencyRates()` after `autoRefreshAssets()`
- `settings/+page.svelte`: Call on `mainCurrency` save
- `auto-refresh.ts`: Call after asset refresh completes
- Asset import flow: Call after new asset is added

### Files to Create
- `src/lib/stores/currency-auto-fetch.ts` — core logic + progress store
- `src/lib/components/shared/CurrencyFetchToast.svelte` — progress toast

### Files to Modify
- `src/routes/+layout.svelte` — add toast component + startup trigger
- `src/routes/settings/+page.svelte` — trigger on currency change
- `src/lib/stores/auto-refresh.ts` — trigger after asset refresh
- `src/lib/stores/currencies.ts` — add merge helper

### No Changes Needed
- `src/lib/fetchers/ecb.ts` — already complete and returns correct format
- `src/lib/engine/currency.ts` — conversion logic works with any CurrencyRate data
- `src/lib/types/index.ts` — CurrencyRate type is sufficient

## Decisions

- **Manual uploads preserved:** Merge, don't overwrite. ECB fills date gaps only.
- **Cross-rates via EUR:** Supported for all ECB currencies, not just direct EUR pairs.
- **ECB_CURRENCIES list:** Used to validate that a currency can be auto-fetched before attempting.
