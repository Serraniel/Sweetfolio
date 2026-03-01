#!/usr/bin/env bash
set -euo pipefail

REPO="$GITHUB_REPOSITORY"
MAIN_BRANCH="main"
TEMP_BRANCH="merge-queue/validation"

# Configure git identity for merge commits on the runner
git config user.name "merge-queue[bot]"
git config user.email "merge-queue[bot]@users.noreply.github.com"

# Track the PR currently being processed so the trap can clean it up
CURRENT_PR=""

# ── Crash cleanup ────────────────────────────────────────────────────────────
# If the script dies unexpectedly, remove the merge-queue label from the PR
# that was being processed so it doesn't block the rest of the queue.
on_error() {
  local exit_code=$?
  echo "::error::Merge queue script failed unexpectedly (exit $exit_code)"
  if [ -n "$CURRENT_PR" ]; then
    echo "Cleaning up: removing merge-queue label from PR #$CURRENT_PR"
    gh pr edit "$CURRENT_PR" --remove-label merge-queue --repo "$REPO" 2>/dev/null || true
    gh pr comment "$CURRENT_PR" --body "⚠️ **Merge queue: removed** — unexpected error during processing. Please check the [CI run]($MERGE_QUEUE_RUN_URL) for details and retry with \`/merge\`." --repo "$REPO" 2>/dev/null || true
  fi
}
trap on_error ERR

# ── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "::group::$1"; }
endlog() { echo "::endgroup::"; }

comment_pr() {
  local pr=$1 body=$2
  gh pr comment "$pr" --body "$body" --repo "$REPO"
}

remove_from_queue() {
  local pr=$1
  gh pr edit "$pr" --remove-label merge-queue --repo "$REPO" 2>/dev/null || true
}

get_queued_prs() {
  # Returns PR numbers sorted by creation date (oldest first = first in queue)
  gh pr list \
    --label merge-queue \
    --state open \
    --json number,createdAt \
    --jq 'sort_by(.createdAt) | .[].number' \
    --repo "$REPO"
}

cleanup_temp_branch() {
  git checkout "$MAIN_BRANCH" 2>/dev/null || true
  git branch -D "$TEMP_BRANCH" 2>/dev/null || true
  git push origin --delete "$TEMP_BRANCH" 2>/dev/null || true
}

run_ci() {
  log "Installing dependencies"
  npm ci
  endlog

  log "Checking licenses"
  npm run check:licenses
  endlog

  log "Building"
  npm run build
  endlog

  log "Testing"
  npm test
  endlog
}

# ── Main loop ────────────────────────────────────────────────────────────────
# Restarts from scratch whenever a PR fails, because removing a failed PR
# changes the merge base for all subsequent PRs.

MAX_ITERATIONS=10  # Safety valve to prevent infinite loops
iteration=0

while true; do
  iteration=$((iteration + 1))
  if [ "$iteration" -gt "$MAX_ITERATIONS" ]; then
    echo "::error::Merge queue exceeded $MAX_ITERATIONS iterations. Aborting."
    exit 1
  fi

  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  Merge Queue - Iteration $iteration"
  echo "═══════════════════════════════════════════════════════════"

  # Fetch latest state
  git fetch origin "$MAIN_BRANCH"

  # Get current queue
  mapfile -t QUEUE < <(get_queued_prs)

  if [ ${#QUEUE[@]} -eq 0 ]; then
    echo "Queue is empty. Nothing to process."
    cleanup_temp_branch
    exit 0
  fi

  echo "Queue: ${QUEUE[*]}"

  # Reset temp branch from main
  cleanup_temp_branch
  git checkout -b "$TEMP_BRANCH" "origin/$MAIN_BRANCH"

  FAILED=false
  FAILED_PR=""
  VALIDATED=()

  for pr in "${QUEUE[@]}"; do
    CURRENT_PR="$pr"
    log "Processing PR #$pr"

    # Verify PR has an approving review before processing
    REVIEW_DECISION=$(gh pr view "$pr" --json reviewDecision --jq '.reviewDecision' --repo "$REPO")
    if [ "$REVIEW_DECISION" != "APPROVED" ]; then
      echo "::warning::PR #$pr has no approving review (status: $REVIEW_DECISION) — skipping"
      remove_from_queue "$pr"
      comment_pr "$pr" "⏸️ **Merge queue: removed** — this PR requires an approving review before it can be merged. Please get a review and re-add with \`/merge\`."
      FAILED=true
      FAILED_PR=$pr
      break
    fi

    # Get PR branch info
    PR_BRANCH=$(gh pr view "$pr" --json headRefName --jq '.headRefName' --repo "$REPO")
    echo "PR #$pr branch: $PR_BRANCH"

    # Fetch the PR branch
    git fetch origin "$PR_BRANCH"

    # Try to merge into temp branch
    if ! git merge --no-ff "origin/$PR_BRANCH" -m "merge-queue: validate PR #$pr ($PR_BRANCH)"; then
      echo "::error::Merge conflict for PR #$pr"
      git merge --abort 2>/dev/null || true

      remove_from_queue "$pr"
      comment_pr "$pr" "$(cat <<EOF
❌ **Merge queue: removed** — merge conflict

This PR could not be cleanly merged on top of the current queue base.
Please rebase your branch on \`$MAIN_BRANCH\` and re-add with \`/merge\`.

<details>
<summary>Queue state at time of failure</summary>

Position: $((${#VALIDATED[@]} + 1)) of ${#QUEUE[@]}
PRs ahead: ${VALIDATED[*]:-none}
[View CI run]($MERGE_QUEUE_RUN_URL)
</details>
EOF
)"
      FAILED=true
      FAILED_PR=$pr
      break
    fi

    endlog

    # Run CI on the cumulative merge
    log "Running CI after merging PR #$pr"

    if ! run_ci; then
      echo "::error::CI failed for PR #$pr"

      remove_from_queue "$pr"
      comment_pr "$pr" "$(cat <<EOF
❌ **Merge queue: removed** — CI failed

Build or tests failed when this PR was merged on top of the queue base.
Please fix the issue and re-add with \`/merge\`.

<details>
<summary>Queue state at time of failure</summary>

Position: $((${#VALIDATED[@]} + 1)) of ${#QUEUE[@]}
PRs ahead: ${VALIDATED[*]:-none}
[View CI run]($MERGE_QUEUE_RUN_URL)
</details>
EOF
)"
      FAILED=true
      FAILED_PR=$pr
      break
    fi

    endlog

    echo "✅ PR #$pr passed validation"
    VALIDATED+=("$pr")
    CURRENT_PR=""
  done

  if [ "$FAILED" = true ]; then
    echo ""
    echo "PR #$FAILED_PR failed. Restarting queue without it..."

    # Notify remaining queued PRs that they're being re-validated
    for pr in "${QUEUE[@]}"; do
      if [ "$pr" != "$FAILED_PR" ] && [[ ! " ${VALIDATED[*]:-} " =~ " $pr " ]] || [[ " ${VALIDATED[*]:-} " =~ " $pr " ]]; then
        # Only notify PRs that were already validated (they need re-testing)
        for validated_pr in "${VALIDATED[@]:-}"; do
          if [ "$pr" = "$validated_pr" ]; then
            comment_pr "$pr" "🔄 **Merge queue: re-validating** — PR #$FAILED_PR was removed from the queue ahead of yours. Re-running CI on the new base."
          fi
        done
      fi
    done

    continue  # Restart the while loop
  fi

  # ── All PRs passed — merge them ──────────────────────────────────────────

  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  All ${#VALIDATED[@]} PR(s) passed — merging into $MAIN_BRANCH"
  echo "═══════════════════════════════════════════════════════════"

  MERGE_FAILED=false

  for pr in "${VALIDATED[@]}"; do
    log "Merging PR #$pr"

    if gh pr merge "$pr" --merge --repo "$REPO"; then
      echo "✅ PR #$pr merged successfully"
      comment_pr "$pr" "✅ **Merge queue: merged** — All checks passed. PR has been merged into \`$MAIN_BRANCH\`. [View CI run]($MERGE_QUEUE_RUN_URL)"
      remove_from_queue "$pr"
    else
      echo "::error::Failed to merge PR #$pr via GitHub API"
      comment_pr "$pr" "⚠️ **Merge queue: merge failed** — The PR passed validation but the GitHub merge API call failed. This might be due to branch protection rules or a race condition. Please merge manually or retry with \`/merge\`."
      MERGE_FAILED=true
      break
    fi

    endlog

    # Small delay to let GitHub update refs
    sleep 2
  done

  if [ "$MERGE_FAILED" = true ]; then
    echo "::warning::Some merges failed. Remaining queued PRs were not processed."
  fi

  # Clean up temp branch
  cleanup_temp_branch

  echo ""
  echo "Merge queue processing complete."
  break

done
