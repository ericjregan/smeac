# Phase-Gate Discipline — Plan → Audit → Converge → Approval → Execute

Plan-driven implementation work follows a strict pipeline. A `PreToolUse` hook (`~/.claude/hooks/phase-gate.sh`) enforces it mechanically: implementation-pattern subagent dispatches are denied unless `.phase-gate.yaml` in the working directory shows all gates passed.

## The Pipeline

1. **Drafted** — `docs/superpowers/plans/<file>.md` exists. Plan is internally self-reviewed (smoke check, not real review).
2. **Audited** — A fresh-eyes agent (`feature-dev:code-reviewer` or equivalent) audited the plan. Findings file saved at `docs/superpowers/reviews/<date>-<topic>-audit.md`. All BLOCKER findings resolved.
3. **Converged** — Codex (via MCP or `/convergec`) audited the plan. Findings file saved at `docs/superpowers/reviews/<date>-<topic>-codex.md`. All BLOCKER findings resolved.
4. **Approved** — User has explicitly approved execution. Approval message captured in the gate file as `evidence`.
5. **Executing** — Dispatch implementation subagents. Hook allows these calls because `.phase-gate.yaml` shows all gates passed.
6. **Shipped** — All tasks merged. State recorded for future reference.

## The State File

`.phase-gate.yaml` lives in the project root. Schema:

```yaml
plan: docs/superpowers/plans/2026-05-26-feature-name-phase-1.md
spec: docs/superpowers/specs/2026-05-26-feature-name-design.md
state: drafted | audited | converged | approved | executing | shipped
audit:
  passed: true | false
  agent: feature-dev:code-reviewer
  timestamp: 2026-05-26T18:30:00Z
  findings_file: docs/superpowers/reviews/2026-05-26-phase-1-audit.md
  blockers_open: 0
  warnings_open: 0
convergence:
  passed: true | false
  tool: codex-mcp
  timestamp: 2026-05-26T18:45:00Z
  findings_file: docs/superpowers/reviews/2026-05-26-phase-1-codex.md
  blockers_open: 0
user_approval:
  approved: true | false
  timestamp: 2026-05-26T19:00:00Z
  evidence: "Eric: 'yes, go' (session at 18:55)"
```

## The Hook (What It Gates, What It Doesn't)

**Gated (blocked unless gates passed):** Agent dispatches whose description matches plan-driven patterns:
- `^(Phase \d+ )?Task \d+\b` — e.g., "Phase 1 Task 5: Apply migration"
- `^Step \d+\b` — e.g., "Step 3: Run tests"
- `^Implement(ing|ation)?\b` — e.g., "Implement schema changes"
- `^Build(ing)? Task \d+\b`

**NOT gated (always allowed):**
- Non-Agent tool calls (Bash, Read, Edit, etc.)
- Reviewer/explorer subagent types (`feature-dev:code-reviewer`, `pr-review-toolkit:*`, `Explore`, `Plan`, etc.)
- Descriptions matching review/exploration patterns (`Audit`, `Review`, `Verify`, `Explore`, `Research`, `Analyze`, `Plan`, `Brainstorm`)
- Ad-hoc dispatches whose description doesn't match the implementation pattern (e.g., "Fix the bug in narrative.ts")

## The Rule

**NEVER dispatch an implementation subagent without `.phase-gate.yaml` showing all three gates passed.** The hook will deny the call if you try. If the hook denies a dispatch:

1. If the work IS plan-driven and gates are incomplete — go run the audit / convergence / get approval, then update `.phase-gate.yaml`
2. If the work is NOT plan-driven — rename the dispatch to a non-implementation-pattern description (e.g., "Fix bug in X" instead of "Task 1: Fix X")

## Why this exists

The global system prompt is too large to enforce this via memory. The convergence death spiral on 2026-05-24 (Veritas pipeline) happened because plan iterations weren't independently audited — I trusted my own self-review and shipped broken plans repeatedly. The mechanical gate makes the failure mode "tool call denied" instead of "deployed a defect Codex would have caught."

## How to apply

- Before writing a plan: nothing. Plans are unrestricted.
- Before dispatching the first implementation subagent: write `.phase-gate.yaml` with all three gates passed. The audit/convergence/approval steps must have happened — the YAML records evidence.
- After each phase ships: update `state: shipped` and the next phase starts at `drafted` again. Phases of the same project share one gate file.
