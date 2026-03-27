Execute the plan using Conductor2 protocol with specialized agents, adversarial review, QA phase, and Codex convergence.

$ARGUMENTS

This is /build2 — the v2 build skill. Uses specialized agents (see /conductor2 dispatch table), adversarial review, and QA testing. If you want the original, use /build.

---

## Rigor Prompt (Ask First — Before Any Work)

Before reading the plan, before dispatching any agents, ask Eric:

> **Convergence rigor?**
> - `high` — Six Sigma. Deep inference, catches subtle design flaws. Use for production auth, billing, or critical data paths.
> - `medium` — Default. Proven baseline. Finds real bugs without excessive inference time.
> - `low` — Fast pass. Surface-level scan. Use for formatting fixes, copy changes, config tweaks.
>
> Press Enter for `medium`.

Wait for Eric's response (or Enter). Store the answer as the rigor level for this session. If Eric enters anything other than `high`, `medium`, or `low`, default to `medium`.

Do not proceed to "Before You Start" until rigor is confirmed.

---

## Before You Start

1. Read the project's CLAUDE.md and/or AGENTS.md.
2. Identify the plan — a `PLAN-*.md` file referenced or created in this conversation.
3. Read the plan in full. Internalize every micro-task, dependency, success criteria, and acceptance tests.
4. Read the project's roadmap file if one exists.
5. Run git status to confirm clean starting state.

Do not write a single line of code until you have the full plan loaded and understood.

---

## Phase 1: Build (Conductor2 Protocol)

Execute the plan micro-task by micro-task using the Conductor2 loop (see /conductor2):

1. **Conductor** defines the next micro-task (must match the plan)
2. **Anti-Drift** restates scope, confirms prior task closed
3. **UX Agent** (`feature-dev:code-explorer`) provides specs and constraints — dispatched as subagent
4. **Code Agent** (`feature-dev:code-architect`) implements this task only — dispatched as subagent
5. **Audit Agent** (`feature-dev:code-reviewer`) reviews, produces findings — dispatched as subagent
6. **Conductor** routes findings back to Code Agent or marks complete
7. **Anti-Drift** confirms no drift, ready for next cycle

<IRON-LAW>
The conductor dispatches agents. The conductor does NOT implement, review, or provide UX specs itself. If a subagent returns thin results, re-dispatch with a better prompt. If it fails twice, flag to the user. NEVER absorb the work into your context.

If you are about to use Edit, Write, or Bash to implement something yourself, STOP. You are the general contractor. Call the specialist.
</IRON-LAW>

### Mid-Build Reconciliation (after EVERY micro-task)

After completing each micro-task, check:
- Did I complete exactly what the plan specified?
- Did I add anything the plan didn't call for?
- Am I still on track for everything remaining?
- Are there emerging issues that will affect upcoming tasks?

### Flags (don't stop, just pin)

```
FLAG [task #X]: [what happened] — [impact on remaining plan]
```

Continue building. Only a full blocker stops the build.

---

## Phase 2: Adversarial Review

After ALL micro-tasks are complete, dispatch a fresh `superpowers:code-reviewer` subagent.

**Independence constraints — this is non-negotiable:**
- The reviewer receives ONLY: `git diff`, the plan file, and the project's CLAUDE.md
- The reviewer does NOT receive: your conversation context, your reasoning, your implementation notes
- The reviewer did not build this. That's the point.

The reviewer reports findings. It does not fix anything. Findings feed into Phase 5 (Fix Findings).

---

## Phase 2b: Silent Failure Hunt

Dispatch `pr-review-toolkit:silent-failure-hunter` as a subagent. It checks for:
- Swallowed errors and empty catch blocks
- Bad fallback values that mask failures
- Missing error propagation

It reports findings. It does not fix anything. Findings feed into Phase 5 (Fix Findings).

---

## Phase 3: QA

Dispatch the QA Agent (defined below). The QA agent runs acceptance tests from the plan against a live instance.

### Starting the instance

Before QA begins, ensure the dev server or API is running:
- Check if the project has a dev command (pnpm dev, npm start, etc.)
- Start it if not already running
- Wait for it to be ready (health check or port listen)

### QA execution

The QA agent runs in this order:
1. **API tests** (load-bearing) — all tests under the `### API Tests` subsection of the plan's Acceptance Tests section
2. **Browser tests** (additive) — all tests under `### Browser Tests`, attempted in an isolated browser instance
3. **Adversarial edge cases** — QA generates its own tests beyond the plan
4. **Unit tests** — all tests under `### Unit Tests` from the plan

QA produces a pass/fail report with evidence. It does not fix anything. Findings feed into Phase 5.

---

## Phase 4: Reconciliation Report

Go through every single micro-task in the plan and report:

```
### Build Reconciliation

| # | Plan Task | Status | Notes |
|---|-----------|--------|-------|
| 1 | [task] | DONE / MISSED / DEVIATED / FLAGGED | [details] |
```

Include QA results and adversarial review findings.

---

## Phase 5: Fix Findings (Reduced Conductor2 Loop)

Take every finding from Phases 2, 2b, and 3 and fix using a reduced Conductor2 loop. UX Agent is omitted — fixes address specific findings, not new UX requirements. The closing Anti-Drift step is folded into the Conductor's completion check.

1. **Conductor** defines the fix as a micro-task
2. **Anti-Drift** restates scope, confirms prior fix closed
3. **Code Agent** (`feature-dev:code-architect`) implements the fix — dispatched as subagent
4. **Audit Agent** (`feature-dev:code-reviewer`) verifies the fix — dispatched as subagent
5. **Conductor** marks complete or routes back, confirms no drift

After all fixes, **re-dispatch the QA Agent** to re-run affected tests. Fixes aren't done until QA confirms they work.

---

## Phase 6: Codex Convergence Loop

Write the handoff file to `~/.claude/tmp/convergence-handoff-<topic>.md` with ALL required sections:

```
## Audit Target
- Type: build
- Objective: [one-sentence objective]
- Plan file: [full path to PLAN-<topic>.md]
- Project root: [project root path]

## Project Context
- Project instructions: [path to CLAUDE.md and/or AGENTS.md]
- Roadmap: [path or "none"]
- Tech stack: [one-liner summary]
- Key decisions: [bulleted list from the plan]
- Rigor: [the rigor level Eric selected — high | medium | low]

## Files to Audit
- [full path to project instructions]
- [full paths of every file created or modified during the build]

## Validation Context
- Commands run: [every validation command and results]
- Pass/fail: [final counts]
- Diff type: full | summary
- Residual risk from self-audit: [from Phases 2-3 findings]

## Change Context
- Git diff or file summary: [capped 500 lines or file list]
- Self-audit findings: [what Phases 2-3 found and how Phase 5 fixed it]
- Build reconciliation: [flags, deviations, misses from Phase 4]
```

Spawn the subagent:
> "Run /converge with the handoff file at ~/.claude/tmp/convergence-handoff-<topic>.md"

Handle results:
- **CONVERGED** → proceed to Phase 7
- **PAUSE** → present findings to user, get decision, re-spawn
- **CODEX_FAILED** → present raw audit prompt for manual execution
- **HANDOFF_INVALID** → rewrite handoff, retry once

---

## Phase 7: Final Report

Present combined report:

```
### What Changed
- [file]: [what and why]

### QA Results
- [test]: [pass/fail with evidence]

### Adversarial Review Findings
- [finding]: [resolved/unresolved]

### Convergence Results
- [iteration count, findings, residual risk]

### Residual Risk
- [honest assessment]
```

Clean up temp files from `~/.claude/tmp/`.

---

## QA Agent Definition

The QA agent is dispatched as a subagent with these constraints:

### Identity
"You did not build this. Your job is to break it."

### Tool Access
- Bash (curl, test runners) — **YES**
- Playwright MCP (isolated instance) — **YES**
- Read, Grep, Glob — **YES**
- Edit, Write — **NO**

### Inputs
The QA agent receives:
1. The `## Acceptance Tests` section from the plan
2. The running instance URL/port
3. The feature description from the plan
4. The git diff of what changed

### Process

**Step 1: API Tests (load-bearing)**
Run every test under `### API Tests` from the plan's Acceptance Tests section. For each test:
- Execute the exact curl command
- Compare actual status code and response to expected
- Report PASS or FAIL with the actual request/response pair

**Step 2: Browser Tests (additive)**
Attempt every test under `### Browser Tests` from the plan's Acceptance Tests section in an isolated browser instance.
- Launch a NEW browser window with a fresh temp user-data-dir
- NEVER touch existing Chrome sessions
- NEVER call browser_close on a session you didn't start
- If Playwright fails to launch: log what was skipped, produce a manual checklist for the user. Do NOT fail the build.

**Step 3: Adversarial Edge Cases**
Generate and run tests the plan didn't anticipate:
- Empty/null inputs
- Malformed data (invalid JSON, wrong types)
- Boundary values (very long content, special characters, Unicode)
- Rapid sequential requests
- Missing auth/headers
- Edge cases specific to the feature domain

**Step 4: Evidence Report**
Report everything with evidence. No opinions — pass/fail with proof.
```
### QA Results
- API: [X/Y passed] — [details of failures]
- Browser: [X/Y passed, Z skipped] — [details]
- Adversarial: [X/Y passed] — [details of failures]
- Unit: [X/Y passed] — [details]
```

### Cannot Do
The QA agent cannot edit files, write files, or fix anything. All findings route back through the Conductor to the Code Agent (`feature-dev:code-architect`).

---

## Layered Defense Model

Each layer catches what the previous can't:

```
Per micro-task:
  Audit Agent (feature-dev:code-reviewer) — code-level: types, logic, patterns

End of phase:
  Adversarial Review (superpowers:code-reviewer) — integration-level: design flaws, missed connections
  Silent Failure Hunt (pr-review-toolkit:silent-failure-hunter) — error handling: swallowed errors, bad fallbacks
  QA Agent (custom) — feature-level: broken flows, edge cases, real requests
  Codex — architectural-level: requirements gaps, things everyone is too close to see
```

---

## Rationalization Prevention

If you're thinking any of these, STOP:

| Thought | Reality |
|---------|---------|
| "The subagent returned thin results, I'll fill in the gaps myself" | Re-dispatch with a better prompt. Do not absorb the work. |
| "I'll skip the adversarial review, the audit agent already caught issues" | The adversarial review has fresh context. It catches what you rationalize away. |
| "QA isn't needed for this change, it's just backend" | API tests via curl ARE QA. Run the acceptance tests. |
| "I'll implement this fix myself instead of dispatching the Code Agent" | You are the conductor, not the carpenter. Dispatch. |
| "The QA agent is overkill for this small feature" | Small features have the sneakiest bugs. Run QA. |
| "Playwright isn't working, I'll skip browser tests entirely" | Skip browser tests, but produce the manual checklist. Don't silently drop them. |

## Global Rules

- Do NOT skip any phase.
- Do NOT commit unless told to.
- Every phase must complete before the next begins.
- Flags don't stop the build — only a full blocker stops.
- Every role dispatches to the specialized agent from the /conductor2 dispatch table. No exceptions.
- The conductor never implements. Dispatch or flag.
