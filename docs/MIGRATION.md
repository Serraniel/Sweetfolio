# Rewrite notes (v0.5 → rewrite)

The code base was rewritten from scratch. Requirements are consolidated in [REQUIREMENTS.md](REQUIREMENTS.md); the previous plans and docs are kept in [archive/](archive/).

## Compatibility

- **Browser data** — IndexedDB from v0.5.x (schema v2) and from the portfolio-tracking epic branch (schema v4) is upgraded automatically to v5. Settings keep their keys (`mainCurrency`, `riskFreeRate`, `benchmark`, …).
- **Backups** — files of format versions 1–4 can be imported; new exports use version 5.
- **Share links** — old `#share=` links still open. Strategy links now carry ISINs instead of device-local asset ids.
- **URLs** — slugs are unchanged; duplicate names get a short suffix; ids also resolve.
- **Theme** — the stored theme is kept; "System" is new.

## Behaviour changes and fixes

See Appendix A of the requirements for the defects fixed by the rewrite. Notable changes users may see:

- **Exchange rates fetched from the ECB were inverted in v0.5** (USD prices were multiplied instead of divided by the EUR/USD rate). A one-time migration repairs stored rates (it needs network access once).
- Metrics periods longer than the available history now show "–" instead of silently using a shorter window.
- Portfolio Performance import uses the correct share scale (10⁸) and includes dividends, interest, deposits and removals.
- Portfolio Performance export is now a CSV in PP's import format instead of a hand-written XML.
- The Docker image listens on port 8080 (non-root).

## CI/CD

- semantic-release and the custom merge queue were replaced by release-please (release PR) plus `edge` images on every push to `main`.
- Dependabot patch/minor updates are auto-merged after CI passes. Enable _Allow auto-merge_ in the repository settings and require the CI checks on `main` (branch protection) for this to work.
