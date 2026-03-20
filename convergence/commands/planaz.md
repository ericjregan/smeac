Plan A-to-Z: Full planning pipeline with Conductor protocol, self-audit, and Codex convergence loop.

Objective: $ARGUMENTS

## Step 1: Gather Context

Before planning anything:
1. Read the project's CLAUDE.md and/or AGENTS.md.
2. Read the project's roadmap file (check docs/ for master-roadmap.md, PRODUCT-ROADMAP.md, or similar).
3. Run git status and git log to understand current state.
4. Identify all files, modules, and boundaries relevant to the objective.

Do not proceed until you understand the project's architecture, conventions, and current state.

## Step 2: Plan Using Conductor Protocol

Create a full Conductor plan following this template:

```
Objective: [One sentence]
Scope / Out of Scope:
Micro-Tasks: [Numbered, atomic, sequential — if a task has "and" in it, split it]
Success Criteria:
Dependencies: [What each task depends on]
Files Affected: [Full paths for every file that will be created or modified]
Risk Areas: [Where things are most likely to go wrong]
```

Rules:
- Decompose into the smallest possible sequential tasks.
- Each micro-task must be independently completable and verifiable.
- Identify the agents involved per task (UX, Code, Audit, Anti-Drift).
- No hand-waving. Every task must be specific enough that someone unfamiliar with the codebase could understand what to do.

## Step 3: Audit the Plan

Run a full /audit (Reliability Push) against the plan itself. Treat the plan as the artifact under test.

### Before You Touch Anything

1. Re-read the project's CLAUDE.md / AGENTS.md.
2. Re-read existing test infrastructure — understand what patterns exist.
3. Check git status and recent commits to confirm current state.

### Goals

1. Proactively find failures in the plan. Don't wait to be told where to look.
2. Validate that every micro-task has a verifiable completion criteria.
3. Report hard findings, not opinions.

### Operating Rules

- Use Conductor framework with micro-tasks, sequential only.
- Show pass/fail assessments, not vibes.
- For each finding, state: task number, problem, expected vs actual, fix.
- End with: what's wrong, what's missing, residual risk.

### Audit Checklist

For each micro-task:
- Is it truly atomic? Can it be split further?
- Is the sequence correct? Are dependencies satisfied?
- Are there missing tasks (migrations, tests, config, env vars, deployments)?
- Does it account for error cases and edge cases?
- Is anything out of scope creeping in?
- Are success criteria measurable and verifiable?
- Are file paths accurate and complete?
- Does it contradict the project's CLAUDE.md or established patterns?

### Acceptance Bar

- No blocker-level findings in the plan.
- Every micro-task has a clear, verifiable success criteria.
- All file paths confirmed accurate.
- No missing dependencies or sequencing errors.

### Findings Report

```
### Plan Audit Findings
- [BLOCKER/WARNING/NIT] Task #X: [Problem] -> [Fix]
- [BLOCKER/WARNING/NIT] Task #X: [Problem] -> [Fix]
...

### Residual Risk
- [Honest assessment of what could still go wrong]
```

## Step 4: Re-Plan

Incorporate all audit findings into a revised plan. This is the working plan. It must be tighter, more complete, and more precise than the first draft.

Use the same Conductor template from Step 2 but improved.

## Step 5: Save the Plan

Save the final plan to the project root as `PLAN-<slugified-topic>.md`.
- Slugify the topic: lowercase, hyphens, no special characters.
- Example: objective "rebuild onboarding flow" saves as `PLAN-rebuild-onboarding-flow.md`
- The file must include the full Conductor plan, the audit findings that shaped it, and a summary of context gathered in Step 1.

State the full file path after saving.

<!-- Convergence v4 — uses /converge via subagent -->

## Step 6: Codex Convergence Loop (via Subagent)

Spawn a subagent with fresh context to run the convergence loop. This ensures the loop always fires, even after large planning sessions.

### 6a. Write the handoff file

Write `~/.claude/tmp/convergence-handoff-<topic>.md` with:

```
## Audit Target
- Type: plan
- Objective: [one-sentence objective from the plan]
- Plan file: [full path to PLAN-<topic>.md]
- Project root: [project root path]

## Project Context
- Project instructions: [path to CLAUDE.md and/or AGENTS.md, whichever exists]
- Roadmap: [path or "none"]
- Tech stack: [one-liner summary]
- Key decisions: [bulleted list of decisions made during planning]

## Files to Audit
- [full path to PLAN-<topic>.md]
- [full path to project instructions file (CLAUDE.md and/or AGENTS.md)]
- [full path to roadmap, if any]
- [full paths to key source files referenced in the plan]

## Validation Context
- Commands run: [any checks run during self-audit]
- Pass/fail: [results]
- Diff type: N/A (plan audit)
- Residual risk from self-audit: [from Step 3 findings]
```

### 6b. Spawn the convergence subagent

Use the Agent tool (foreground) to spawn a subagent with this prompt:

> "Run /converge with the handoff file at ~/.claude/tmp/convergence-handoff-<topic>.md"

### 6c. Handle the subagent result

- **CONVERGED** → proceed to Step 7 with the convergence report
- **PAUSE** → present the findings to the user. Show what Codex found, Claude's assessment, why human input is needed. Get the user's decision. Update the handoff file's Resume State section with the decision and the NEXT iteration number (paused-at + 1). Re-spawn the subagent.
- **CODEX_FAILED** → Codex is completely unreachable (both MCP and CLI failed). Present the raw audit prompt so the user can run Codex manually as a last resort.
- **HANDOFF_INVALID** → rewrite the handoff file fixing what's missing, retry once.

Handle Agent tool failures (parent-session):
- Spawn failed → present error, suggest running `/converge` manually in a fresh session
- Timeout → retry once, then present error

## Step 7: Convergence Report + Cleanup

Present the convergence report returned by the subagent.

**Cleanup:** Delete the handoff file and iteration log from `~/.claude/tmp/`. If deletion fails, warn and continue.

## Rules

- Do NOT skip any step.
- Do NOT execute the plan. This command is planning only.
- Do NOT commit anything.
- Ask clarifying questions BEFORE Step 2 if the objective is ambiguous. Do not guess.
- If the project has no CLAUDE.md or roadmap, say so and proceed with what's available.
- The plan file (`PLAN-<topic>.md`) is the living document.
- If Codex MCP fails, the subagent will automatically fall back to `codex exec` CLI. Only if both MCP and CLI fail does it return CODEX_FAILED with a manual prompt.
