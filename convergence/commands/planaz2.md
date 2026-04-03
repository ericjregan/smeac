Plan A-to-Z v2: Full planning pipeline with specialized agents, required acceptance tests, and Codex convergence.

Objective: $ARGUMENTS

This is /planaz2 — the v2 planning skill. Uses specialized agents (see /conductor2 dispatch table) and requires machine-verifiable acceptance tests in every plan. If you want the original, use /planaz.

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

Do not proceed to Step 1 until rigor is confirmed.

## Step 1: Gather Context

**Agent: `feature-dev:code-explorer`** — dispatch this agent to explore the project.

The explorer agent must:
1. Read the project's CLAUDE.md and/or AGENTS.md
2. Read the project's roadmap file (check docs/ for master-roadmap.md, PRODUCT-ROADMAP.md, or similar)
3. Run git status and git log to understand current state
4. Identify all files, modules, and boundaries relevant to the objective
5. Return a structured context summary

Do not proceed until the explorer agent returns. Read its output before continuing.

## Step 2: Plan Using Conductor2 Protocol

**Agent: `feature-dev:code-architect`** — dispatch this agent to write the plan.

Provide the architect agent with:
- The context summary from Step 1
- The objective ($ARGUMENTS)
- The spec file path (if one exists from /designplanbuild Phase 1)

The architect agent must produce a plan following this template:

```
Objective: [One sentence]
Scope / Out of Scope:
Micro-Tasks: [Numbered, atomic, sequential — if a task has "and" in it, split it]
Success Criteria: [Machine-verifiable only — see Testability Gate below]
Dependencies: [What each task depends on]
Files Affected: [Full paths for every file that will be created or modified]
Risk Areas: [Where things are most likely to go wrong]
```

### Required: Acceptance Tests Section

<HARD-GATE>
Every plan MUST include an `## Acceptance Tests` section. If the plan does not have this section, REJECT the plan and re-dispatch the architect agent with explicit instructions to add it. Do NOT advance to Step 3 without acceptance tests.

Not even for "simple" changes. Not even for refactors. Not even for config changes. Not even for documentation. Every plan has acceptance tests or the plan is rejected.
</HARD-GATE>

The section must contain three typed subsections:

```markdown
## Acceptance Tests

### API Tests (load-bearing — always run)
- [curl command] -> [expected status and response content]
- [curl command with follow-up/dependent request] -> [expected result]

### Browser Tests (additive — attempted in isolated instance)
- [Navigate to URL] -> [expected UI state]
- [Interact with element] -> [expected result]
(Mark N/A if no UI changes)

### Unit Tests
- Run: [test command] -> [expected result]
- Run: [typecheck command] -> zero errors
```

All three headers must be present. Types that don't apply may be marked N/A, but the headers must exist.

### Testability Gate

Every success criterion must be verifiable by curl, a test runner, or Playwright. The following are NOT acceptable:
- "Chat works correctly"
- "The feature functions as expected"
- "UI looks good"
- "Performance is acceptable"

These ARE acceptable:
- "POST /api/chat returns 200 with content.length > 0"
- "vitest run returns 0 failures"
- "Navigate to /dashboard -> element with text 'Welcome' visible"
- "Response time < 2000ms for 10 sequential requests"

## Step 3: Audit the Plan

**Agent: `feature-dev:code-reviewer`** — dispatch this agent to audit the plan.

Provide the reviewer agent with:
- The plan from Step 2
- The project's CLAUDE.md
- The spec file (if exists)

The reviewer agent must check:
1. Is every micro-task truly atomic? Can it be split further?
2. Is the sequence correct? Are dependencies satisfied?
3. Are there missing tasks (migrations, tests, config, env vars, deployments)?
4. Does it account for error cases and edge cases?
5. Is anything out of scope creeping in?
6. Are success criteria measurable and machine-verifiable?
7. Are file paths accurate and complete?
8. Does it contradict the project's CLAUDE.md or established patterns?

**Testability audit (mandatory):** The reviewer must explicitly check every success criterion against the Testability Gate above. Any criterion that cannot be verified by curl, a test runner, or Playwright must be rewritten or rejected. "Works correctly" style criteria are not accepted.

The reviewer produces findings in this format:
```
### Plan Audit Findings
- [BLOCKER/WARNING/NIT] Task #X: [Problem] -> [Fix]
```

## Step 4: Re-Plan

Incorporate all audit findings into a revised plan. Re-dispatch `feature-dev:code-architect` with the audit findings and the original plan. The architect produces the revised plan — the conductor does not edit the plan directly, not even for minor fixes.

The revised plan is the working plan. It must be tighter, more complete, and more precise than the first draft.

## Step 5: Save the Plan

Save the final plan to the project root as `PLAN-<slugified-topic>.md`.

The file must include:
- The full Conductor2 plan
- The Acceptance Tests section
- The audit findings that shaped it
- A summary of context gathered in Step 1

## Step 6: Codex Convergence Loop (via Subagent)

Spawn a subagent to run /converge. Write the handoff file to `~/.claude/tmp/convergence-handoff-<topic>.md` with ALL required sections:

```
## Audit Target
- Type: plan
- Objective: [one-sentence objective]
- Plan file: [full path to PLAN-<topic>.md]
- Project root: [project root path]

## Project Context
- Project instructions: [path to CLAUDE.md and/or AGENTS.md]
- Roadmap: [path or "none"]
- Tech stack: [one-liner summary]
- Key decisions: [bulleted list of decisions made during planning]
- Rigor: [the rigor level Eric selected — high | medium | low]

## Files to Audit
- [full path to PLAN-<topic>.md]
- [full path to project instructions file]
- [full path to roadmap, if any]
- [full paths to key source files referenced in the plan]

## Validation Context
- Commands run: [any checks run during self-audit]
- Pass/fail: [results]
- Diff type: N/A (plan audit)
- Residual risk from self-audit: [from Step 3 findings]
```

Spawn the subagent:
> "Run /converge with the handoff file at ~/.claude/tmp/convergence-handoff-<topic>.md"

Handle results:
- **CONVERGED** → present convergence report, clean up temp files
- **PAUSE** → present findings to user, get decision, re-spawn
- **CODEX_FAILED** → present raw audit prompt for manual execution
- **HANDOFF_INVALID** → rewrite handoff, retry once

## Step 7: Convergence Report + Cleanup

Present the convergence report. Delete temp files from `~/.claude/tmp/`.

---

## Rationalization Prevention

If you're thinking any of these, STOP:

| Thought | Reality |
|---------|---------|
| "This plan is too simple for acceptance tests" | Every plan gets acceptance tests. No exceptions. |
| "I'll just write the plan myself, it's faster than dispatching the architect agent" | Dispatch. The conductor doesn't write plans. |
| "This criterion is obvious, it doesn't need to be machine-verifiable" | If it's obvious, the curl command takes 10 seconds to write. |
| "The plan looks good, I'll skip the audit step" | The audit step exists because self-evaluation is biased. Run it. |
| "I'll do the context gathering myself instead of dispatching the explorer" | Dispatch the explorer. You are the conductor, not the explorer. |

## Rules

- Do NOT skip any step.
- Do NOT execute the plan. This command is planning only.
- Do NOT commit anything.
- Ask clarifying questions BEFORE Step 2 if the objective is ambiguous.
- Every step dispatches the specialized agent from the /conductor2 dispatch table. The conductor does not do the work itself.
- If a dispatched agent returns thin or inadequate results, re-dispatch with a better prompt. Do not absorb the work.
