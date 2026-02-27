# Contributing to Sweetfolio

Thanks for your interest in contributing to Sweetfolio. This document covers the process and conventions.

## Development Setup

```bash
git clone https://github.com/serraniel/sweetfolio.git
cd sweetfolio
npm install
npm run dev
```

Requirements: Node.js 22+, npm. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for full details.

## Code Style

- **TypeScript** throughout -- no plain JavaScript files
- **Svelte 5** with runes syntax
- **CSS custom properties** for all colors and theming -- no CSS framework
- Keep dependencies minimal; propose new ones in the PR description with justification

## Commit Conventions

This project uses [conventional commits](https://www.conventionalcommits.org/) for automated semantic versioning via semantic-release.

Format: `<type>(<scope>): <description>`

Common types:
- `feat` -- new feature (triggers minor version bump)
- `fix` -- bug fix (triggers patch version bump)
- `docs` -- documentation changes
- `refactor` -- code restructuring without behavior change
- `test` -- adding or updating tests
- `chore` -- build, CI, tooling changes

Breaking changes: add `BREAKING CHANGE:` in the commit body or use `!` after the type (e.g., `feat!: ...`). This triggers a major version bump.

## Pull Request Process

1. Fork the repository and create a branch from `main`
2. Make your changes with conventional commit messages
3. Ensure all tests pass: `npm test`
4. Run type checking: `npm run check`
5. Open a PR against `main` with a clear description of the changes

PRs are automatically built and tested via GitHub Actions. A maintainer will review your changes.

## Architecture

The app is fully client-side. All computation runs in Web Workers, data is stored in IndexedDB, and the build output is a static SPA served by nginx.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture overview including project structure, data flow, worker protocol, and module interfaces.

## Key Conventions

- Financial calculations go in `src/lib/engine/`
- Heavy computation must run in Web Workers (`src/lib/workers/`)
- All chart components use uPlot and live in `src/lib/charts/`
- UI components are organized by feature domain under `src/lib/components/`
- Svelte stores sync with IndexedDB and live in `src/lib/stores/`
- Theming uses CSS custom properties on `:root` with a `data-theme` attribute for light/dark switching
