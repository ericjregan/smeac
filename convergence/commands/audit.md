Mode: Reliability Push

Run full reliability audit on the specified feature or flow.

## Before You Touch Anything

1. Read the project's CLAUDE.md / AGENTS.md.
2. Read existing test infrastructure — understand what patterns exist before adding new ones.
3. Check git status and recent commits to understand current state.

## Goals

1. Proactively find failures. Don't wait for me.
2. Add automated tests and harnesses if missing — match existing project patterns. If none exist, establish them.
3. Run high-volume validation and report hard metrics.
4. Fix until stable, then rerun tests.

## Operating Rules

- Use Conductor framework with micro-tasks, sequential only.
- Don't ask me to test unless blocked.
- Show how to verify each fix (URL, curl command, or test command).
- Show pass/fail counts, not opinions.
- If a test fails, patch root cause (not symptoms) and rerun.
- End with: what changed, what passed, residual risk.

## Required Validation (minimum)

- Project-specific checks (tsc --noEmit, boundary scripts, container health — whatever the project uses)
- Unit tests for new or changed logic
- Build and typecheck clean with zero warnings
- API smoke flow with repeated runs
- Full user flow verification — not just endpoint status codes
- Browser E2E for the critical user path if Playwright/browser tooling is available

## Acceptance Bar

- No known blocker failures in latest run set.
- Include exact commands run and final score summary.
- If anything is flaky or uncertain, say so — don't round up to green.

## End Report Format

```
### What Changed
- [file]: [what and why]

### Test Results
- [command]: [pass/fail count]
- [command]: [pass/fail count]

### Residual Risk
- [honest assessment of what could still break]
```
