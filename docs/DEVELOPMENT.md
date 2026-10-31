# Development

## Requirements

- Node.js ≥ 22.17, npm
- For E2E tests: `npx playwright install chromium`

## Scripts

| Command                                       | Purpose                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                                 | Dev server with HMR                                                            |
| `npm run build` / `npm run preview`           | Production build in `build/` and local preview                                 |
| `npm run check`                               | Type checking (svelte-check)                                                   |
| `npm test` / `npm run test:watch`             | Unit tests (Vitest, fake IndexedDB, jsdom where needed)                        |
| `npm run test:e2e`                            | Playwright on desktop Chrome and a Pixel 7 profile (builds and serves the app) |
| `npm run format` / `format:check`             | Prettier                                                                       |
| `npm run licenses:check` / `licenses:notices` | Licence allow list / regenerate `THIRD_PARTY_NOTICES.md`                       |

The app version comes from `APP_VERSION`, else the latest git tag, else `package.json`.

## Testing approach

- `src/lib/core`, parsers, fetchers (mocked `fetch`), storage (fake-indexeddb, including upgrades from old schemas), import/export and sharing have unit tests.
- E2E tests block all third-party network requests and cover the main user journeys, legacy-data upgrades and the mobile layout.
- Test names start with the requirement ID from `docs/REQUIREMENTS.md`.

## Manual testing checklist

Things that depend on external services and cannot run in CI:

- Asset lookup by ISIN/WKN/ticker against the live Onvista API (`eod_history`).
- ECB exchange rates for a USD asset with main currency EUR and USD.
- Parqet Connect (needs `parqetClientId` in `static/config.json` and a registered redirect URI `<origin>/callback`).
- Importing a real Portfolio Performance XML file, a real Parqet CSV export and broker CSVs.
- Opening the Portfolio Performance CSV export in Portfolio Performance.
- Opening the app with data from a v0.5.x installation.
