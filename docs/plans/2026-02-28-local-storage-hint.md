# Local Storage Hint Banner — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dismissable info banner to every page telling users their data is stored locally in the browser.

**Architecture:** A single `LocalStorageHint.svelte` component placed in `Shell.svelte` (the shared layout). Dismiss state persisted via `localStorage`. No new stores or dependencies needed.

**Tech Stack:** Svelte 5 (runes), CSS with existing design system variables, localStorage API.

---

### Task 1: Create `LocalStorageHint.svelte` component

**Files:**
- Create: `src/lib/components/shared/LocalStorageHint.svelte`

**Step 1: Create the component**

```svelte
<script lang="ts">
	import { browser } from '$app/environment';

	const STORAGE_KEY = 'sweetfolio-hint-local-storage-dismissed';

	let dismissed = $state(browser && localStorage.getItem(STORAGE_KEY) === 'true');

	function dismiss() {
		dismissed = true;
		localStorage.setItem(STORAGE_KEY, 'true');
	}
</script>

{#if !dismissed}
	<div class="hint" role="status">
		<svg class="hint-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="10"/>
			<line x1="12" y1="16" x2="12" y2="12"/>
			<line x1="12" y1="8" x2="12.01" y2="8"/>
		</svg>
		<p class="hint-text">
			All your data is stored locally in your browser. Nothing is sent to a server. If you clear your browser data, your portfolios and settings will be lost.
		</p>
		<button class="hint-dismiss" onclick={dismiss} aria-label="Dismiss">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"/>
				<line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	</div>
{/if}

<style>
	.hint {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		margin-bottom: var(--spacing-lg);
		background: var(--glass-bg);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		border: 1px solid var(--color-accent-light, rgba(141, 208, 196, 0.3));
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}

	.hint-icon {
		flex-shrink: 0;
		color: var(--color-accent);
		margin-top: 1px;
	}

	.hint-text {
		flex: 1;
		margin: 0;
		line-height: 1.5;
	}

	.hint-dismiss {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-xs);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color var(--transition-fast), background-color var(--transition-fast);
	}

	.hint-dismiss:hover {
		color: var(--color-text-primary);
		background: var(--color-bg-tertiary);
	}
</style>
```

**Step 2: Verify it builds**

Run: `npm run build` (or `npx vite build`)
Expected: No errors.

**Step 3: Commit**

```bash
git add src/lib/components/shared/LocalStorageHint.svelte
git commit -m "feat: add LocalStorageHint dismissable banner component"
```

---

### Task 2: Integrate into Shell layout

**Files:**
- Modify: `src/lib/components/layout/Shell.svelte:1-14`

**Step 1: Add the import and render in Shell.svelte**

Add import at line 2:
```
import LocalStorageHint from '../shared/LocalStorageHint.svelte';
```

Add the component above `{@render children()}` (between lines 13 and 14):
```svelte
		<LocalStorageHint />
		{@render children()}
```

**Step 2: Verify it builds and renders**

Run: `npm run build`
Expected: No errors.

Run: `npm run dev` and open the app in a browser. Verify the hint banner appears at the top of every page. Click dismiss and verify it disappears and does not return on page reload.

**Step 3: Commit**

```bash
git add src/lib/components/layout/Shell.svelte
git commit -m "feat: integrate local storage hint into shell layout"
```
