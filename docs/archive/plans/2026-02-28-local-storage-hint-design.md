# Local Storage Hint Banner — Design

## Summary

Add a dismissable info banner to every page informing users that all data is stored locally in the browser. Placed in the shared layout (`Shell.svelte`) so current and future pages get it automatically.

## Approach

**Layout-level hint component (Approach A):** A single `LocalStorageHint.svelte` component rendered in `Shell.svelte` above the page content slot. Dismiss state persisted in `localStorage`.

## Component: `LocalStorageHint.svelte`

- Renders an info-style banner with icon, message text, and dismiss button
- On mount, checks `localStorage` for `sweetfolio-hint-local-storage-dismissed`
- On dismiss: sets the localStorage flag and hides with a smooth collapse animation
- Message: "All your data is stored locally in your browser. Nothing is sent to a server. If you clear your browser data, your portfolios and settings will be lost."

## Placement

Inside `Shell.svelte`, at the top of the main content area (above `{@render children()}`).

## Styling

- Uses existing design system variables (`--color-accent-light`, `--color-text-primary`, `--radius-md`, `--spacing-*`)
- Subtle info banner, not alarming
- Smooth collapse animation on dismiss via CSS transition

## Persistence

- `localStorage.setItem('sweetfolio-hint-local-storage-dismissed', 'true')`
- Once dismissed, never shown again

## Future pages

Since the hint lives in the shared layout, any new page added under the SvelteKit routes will display it automatically with zero additional work.
