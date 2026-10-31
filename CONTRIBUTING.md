# Contributing to Sweetfolio

## Setup

Node.js ≥ 22.17 and npm.

```bash
npm ci
npm run dev
```

## Before opening a PR

```bash
npm run format       # Prettier
npm run check        # svelte-check / TypeScript
npm test             # unit tests
npm run test:e2e     # Playwright (installs need: npx playwright install chromium)
```

CI runs all of these plus a licence check and a Docker build.

## Conventions

- **Conventional commits / PR titles** (`feat(scope): …`, `fix: …`, `perf: …`, `deps: …`, `refactor: …`, …). PRs are squash-merged, so the PR title becomes the commit and drives the changelog. `!` marks breaking changes.
- **Releases** are automated with [release-please](https://github.com/googleapis/release-please): it maintains a release PR with the next version and changelog; merging it publishes the release and Docker images. Every push to `main` publishes an `edge` image.
- **Requirements** live in `docs/REQUIREMENTS.md` with IDs (e.g. `PT-4`). Reference the ID in tests (`describe('PT-4 …')`) and keep the document up to date when behaviour changes.
- **Pure logic first**: calculations go into `src/lib/core` (no DOM, no Svelte) with unit tests; UI only composes them.
- **Dependencies**: keep them minimal. Runtime dependencies must use a licence from the allow list in `scripts/licenses.mjs`.
- Imports use the `#lib/…` alias with explicit `.ts` extensions.
