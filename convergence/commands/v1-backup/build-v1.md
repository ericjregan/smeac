Execute the plan from this conversation using Conductor protocol with continuous reconciliation.

$ARGUMENTS

## Before You Start

1. Read the project's CLAUDE.md and/or AGENTS.md.
2. Identify the plan. It will be one of:
   - A `PLAN-*.md` file referenced or created in this conversation.
   - A detailed plan discussed in this conversation.
3. Read the plan in full. Internalize every micro-task, dependency, and success criteria.
4. Read the project's roadmap file if one exists.
5. Run git status to confirm clean starting state.

Do not write a single line of code until you have the full plan loaded and understood.

## Phase 1: Build (Conductor Protocol)

Execute the plan micro-task by micro-task using the full Conductor loop:

1. **Conductor** defines the next micro-task (must match the plan)
2. **Anti-Drift** restates scope, confirms prior task closed, reconciles against plan
3. **UX** provides specs and constraints for this task only
4. **Code** implements this task only
5. **Audit** reviews, produces findings
6. **Conductor** routes findings back or marks complete
7. **Anti-Drift** confirms no drift, ready for next cycle

### Mid-Build Reconciliation (after EVERY micro-task)

After completing each micro-task, check:
- Did I complete exactly what the plan specified for this task?
- Did I add anything the plan didn't call for?
- Am I still on track to cover everything remaining in the plan?
- Are there any emerging issues that will affect upcoming tasks?

### Flags (don't stop, just pin)

If during execution you encounter any of the following, **flag it clearly and continue**:
- A plan task that can't be completed as written (wrong assumption, missing context)
- Something the user needs to provide (API keys, credentials, env vars, design decisions)
- A deviation from the plan that was necessary (explain why)
- A task that revealed hidden complexity not captured in the plan
- An external dependency or blocker

Format flags as they occur:
```
FLAG [task #X]: [what happened] — [impact on remaining plan]
```

Continue building. Do not stop for flags unless the entire build is blocked.

### Rules During Build

- One micro-task per cycle, full Conductor loop every time.
- No skipping the loop for "small" changes.
- No agent acts out of turn or assumes another's role.
- UX consistency is non-negotiable.
- Do NOT commit unless told to.

## Phase 2: End-of-Build Reconciliation

After all micro-tasks are complete, produce a full reconciliation report.

Go through every single micro-task in the plan and report:

```
### Build Reconciliation

| # | Plan Task | Status | Notes |
|---|-----------|--------|-------|
| 1 | [task from plan] | DONE / MISSED / DEVIATED / FLAGGED | [details if not DONE] |
| 2 | ... | ... | ... |

### Flags Summary
- FLAG [task #X]: [recap]

### User Action Needed
- [anything the user needs to provide or decide]
```

Do not round up to green. If something was missed, say so.

## Phase 3: Audit (Reliability Push)

Run a full /audit on the completed work.

### Before You Touch Anything

1. Re-read the project's CLAUDE.md / AGENTS.md.
2. Re-read existing test infrastructure — understand what patterns exist.
3. Check git status to see everything that changed.

### Goals

1. Proactively find failures in what was just built. Don't wait to be told where to look.
2. Add automated tests and harnesses if missing — match existing project patterns.
3. Run high-volume validation and report hard metrics.
4. Fix until stable, then rerun tests.

### Operating Rules

- Use Conductor framework with micro-tasks, sequential only.
- Don't ask the user to test unless blocked.
- Show how to verify each fix (URL, curl command, or test command).
- Show pass/fail counts, not opinions.
- If a test fails, patch root cause (not symptoms) and rerun.

### Required Validation (minimum)

- Project-specific checks (tsc --noEmit, boundary scripts, container health — whatever the project uses)
- Unit tests for new or changed logic
- Build and typecheck clean with zero warnings
- API smoke flow with repeated runs
- Full user flow verification — not just endpoint status codes
- Browser E2E for the critical user path if Playwright/browser tooling is available

### Acceptance Bar

- No known blocker failures in latest run set.
- Include exact commands run and final score summary.
- If anything is flaky or uncertain, say so — don't round up to green.

## Phase 4: Fix Audit Findings (Conductor Protocol)

Take every finding from Phase 3 and fix it using the Conductor loop:

1. **Conductor** defines the fix as a micro-task
2. **Anti-Drift** restates scope
3. **Code** implements the fix
4. **Audit** verifies the fix resolved the finding
5. **Conductor** marks complete or routes back

Rerun validation after all fixes. Report updated pass/fail counts.

### End Report

```
### What Changed
- [file]: [what and why]

### Test Results
- [command]: [pass/fail count]

### Residual Risk
- [honest assessment of what could still break]
```

## Phase 5: Codex Handoff

Generate a copy-pasteable Codex audit prompt that includes:

1. **What was built** — summarize the work completed.
2. **Project root path** — full path.
3. **Key file paths** — every file created or modified. Full absolute paths.
4. **CLAUDE.md / AGENTS.md path** — so Codex can read project conventions.
5. **Roadmap path** — if one exists.
6. **Tech stack** — brief summary.
7. **Build reconciliation summary** — any flags, deviations, or misses.
8. **Audit results summary** — what passed, what was fixed, residual risk.
9. **What to audit** — tell Codex to read the listed files and perform a reliability audit. It should:
   - Check for correctness, missed edge cases, and bugs.
   - Verify consistency with the project's CLAUDE.md and established patterns.
   - Flag missing tests or validation.
   - Produce a structured findings report with severity (blocker / warning / nit) and specific recommendations.

Format the entire Codex prompt inside a single fenced code block so it's easy to copy.

## Global Rules

- Do NOT skip any phase.
- Do NOT commit unless told to.
- Flags don't stop the build — only a full blocker (cannot proceed at all) stops the build.
- Every phase must complete before the next begins.
- If the plan doesn't exist or can't be identified, stop and ask. Do not guess.
