# Sweetfolio — Agent Team Launch Prompt

Copy and paste the following prompt into Claude Code to launch the full development team.

---

## Launch Prompt

```
Set up the Sweetfolio development team. Read the design doc at docs/plans/2026-02-27-sweetfolio-design.md for full context.

Create a team called "sweetfolio-dev" with the following agents and tasks:

### Phase 1 — Foundation (parallel)

1. **product-manager** (general-purpose agent)
   - Write comprehensive requirements document at docs/REQUIREMENTS.md
   - Cover all features: CSV upload with format detection, financial metrics (performance, volatility, Sharpe, max drawdown per 1/3/5/10/15/ALL years), asset correlation via Pearson on log returns, portfolio building, Monte Carlo simulation with efficient frontier, currency conversion, benchmark comparison, ISIN/WKN scraping (best-effort), IndexedDB persistence, light/dark theme
   - Target audience: German/European retail investors
   - Include acceptance criteria for every feature
   - Create user stories grouped by epic

2. **architect** (general-purpose agent)
   - Write architecture document at docs/ARCHITECTURE.md
   - Define SvelteKit project structure, component hierarchy, data flow
   - Design Web Worker communication protocol for calculations
   - Design IndexedDB schema and Svelte store architecture
   - Define module boundaries: CSV parser, financial engine, portfolio builder, Monte Carlo, chart components, currency engine
   - Specify interfaces between modules

3. **devops** (general-purpose agent, worktree)
   - Initialize SvelteKit project with TypeScript and static adapter
   - Add EUPL-1.2 LICENSE file
   - Configure dependabot.yml for npm
   - Create GitHub Actions workflows:
     - CI: build + test on PRs
     - Release: semantic-release after PR merge, with 5-min rolling delay (concurrency group with cancel-in-progress: false + sleep 300)
     - Docker: multi-stage build (Node → nginx), push to GHCR on release
   - Create Dockerfile and nginx.conf
   - Create .env.example
   - Commit frequently

### Phase 2 — Implementation (after Phase 1)

4. **dev-frontend** (general-purpose agent, worktree)
   - Implement layout, navigation, theming (Hatsune Miku palette)
   - Light/dark mode with system preference detection, dark fallback
   - Liquid glass inspired modern UI (frosted glass, blur, subtle gradients)
   - Responsive: desktop-optimized, mobile-friendly
   - Pages: dashboard, assets, asset detail, portfolios, portfolio detail, simulation, settings
   - CSV upload UI with format detection preview and correction
   - Commit frequently

5. **dev-core** (general-purpose agent, worktree)
   - CSV parser with locale-aware format detection (dates, numbers, currencies)
   - IndexedDB storage layer with Svelte stores
   - Financial calculation engine in Web Workers:
     - Performance (cumulative + annualized) for 1/3/5/10/15/ALL years
     - Volatility (annualized)
     - Sharpe Ratio
     - Max Drawdown
     - Pearson Correlation on log returns with forward-fill
   - Currency conversion engine
   - Portfolio builder with weighted allocations
   - ISIN/WKN scraper (client-side, best-effort)
   - Commit frequently

6. **dev-charts** (general-purpose agent, worktree)
   - uPlot chart components for:
     - Price history (single + multi-asset overlay)
     - Performance comparison with benchmark highlight
     - Correlation matrix heatmap
     - Efficient frontier scatter (volatility vs return)
     - Portfolio allocation pie/bar charts
     - Drawdown chart
   - Interactive: click points to inspect data
   - Responsive chart sizing
   - Commit frequently

### Phase 3 — Quality (ongoing after Phase 2 starts)

7. **tester** (general-purpose agent, worktree)
   - Write unit tests for financial calculations (known inputs → expected outputs)
   - Test CSV parser with various formats (EU, US, mixed)
   - Test IndexedDB operations
   - Integration tests for key user flows
   - Validate Monte Carlo simulation statistics
   - Use Vitest
   - Commit frequently

8. **code-reviewer** (general-purpose agent)
   - Review all PRs from dev agents
   - Check for: correctness, security, performance, code style consistency
   - Give actionable feedback to developers
   - Verify financial calculations are mathematically correct
   - Ensure no unnecessary dependencies

9. **docs** (general-purpose agent, worktree)
   - Write README.md with project overview, features, screenshots placeholder
   - Document self-hosting guide (Docker)
   - Document development setup
   - Write inline JSDoc for public APIs
   - Create CONTRIBUTING.md
   - Commit frequently

### Coordination Rules

- Product manager validates completed features against requirements
- Code reviewer must approve before any merge
- Developers commit frequently with descriptive messages
- Do NOT add "Co-Authored-By: Claude" to commits
- All agents read the design doc and requirements before starting work
- Use the Hatsune Miku color palette from docs/plans/2026-02-27-sweetfolio-design.md
```

---

## Quick Reference

| Agent | Primary Output | Phase |
|-------|---------------|-------|
| product-manager | docs/REQUIREMENTS.md | 1, 3 |
| architect | docs/ARCHITECTURE.md | 1 |
| devops | CI/CD, Dockerfile, scaffolding | 1 |
| dev-frontend | UI components, theming, layouts | 2 |
| dev-core | CSV parser, calculations, storage | 2 |
| dev-charts | Chart components | 2 |
| tester | Test suite | 3 |
| code-reviewer | PR reviews | 3 |
| docs | README, guides | 3 |
