# Build Audit + Convergence Required Before Deploy

## The Rule

Convergence on the PLAN is not convergence on the BUILD. After implementation is done and committed but BEFORE any merge-to-staging / merge-to-main / production deploy, run a second pair of independent reviews — this time against the actual committed code, not the plan.

The pipeline:

1. **Plan**: written → audited → converged → user approval → execute
2. **Build**: implementer subagents produce commits → **build audit** → **build convergence** → user approval to deploy → deploy

The `.phase-gate.yaml` schema now has TWO gate triples — one for execution, one for deploy:

```yaml
plan: docs/superpowers/plans/...
spec: docs/superpowers/specs/...
state: drafted | audited | converged | approved | executing | built | build_audited | build_converged | deploy_approved | shipped

# Pre-execution gates
audit:
  passed: true
  ...
convergence:
  passed: true
  ...
user_approval:
  approved: true
  ...

# Pre-deploy gates (NEW)
build_audit:
  passed: true
  agent: feature-dev:code-reviewer
  timestamp: ...
  findings_file: docs/superpowers/reviews/<date>-<topic>-build-audit.md
  blockers_open: 0
  warnings_open: 0
  scope: "commits A..B"  # the actual diff that was audited
build_convergence:
  passed: true
  tool: mcp__codex__codex
  timestamp: ...
  findings_file: docs/superpowers/reviews/<date>-<topic>-build-codex.md
  blockers_open: 0
  scope: "commits A..B"
deploy_approval:
  approved: true
  timestamp: ...
  evidence: "User: '<quote>'"
```

## Why

- **Why:** On 2026-05-26, the plan got both a Sonnet audit (5 warnings + 2 nits) and a Codex convergence (1 BLOCKER + 6 WARNINGs). All resolved before execution. Implementation proceeded cleanly. Just before deploy, the user (Eric) caught that the BUILD itself had never been independently reviewed — the plan was clean, but the actual diff might still have defects. A build audit found 2 more warnings (test quality). A build convergence found 2 more (one bounded by index naming, one by schema scoping). None blockers, but real — and only visible when you read the actual bytes.
- **The pattern:** plan audit cannot catch defects in code that didn't exist at audit time. Build audit cannot catch architectural defects that the plan should have caught. Both are necessary; neither is sufficient.

## What the build audit looks for that the plan audit can't

- Typos in committed code (SQL column names, table prefixes)
- Test assertions that pass too easily (e.g., set-membership where exact-pair is needed)
- Drizzle journal sequence breaks introduced by hand-edits
- Schema-scoping omissions (catalog queries that match across schemas)
- Diff-level rippling (a column add forces test factory updates — were they all caught?)
- Doc artifacts that won't render correctly (markdown lint errors, stale header dates)
- Debug logs / TODOs / FIXMEs left in the diff

## What the build convergence (Codex) looks for that the build audit can't

- Postgres-version-specific syntax issues (e.g., `int2vector` casts on PG15)
- Library-version idiom gaps (e.g., Drizzle's `sql.raw` composition correctness)
- Cross-schema collisions (catalog joins that need a `pg_namespace` filter)
- Migration replay safety under partial failure

## How to apply

- After committing the implementation work and before the staging deploy step:
  1. Dispatch an audit agent (e.g., `feature-dev:code-reviewer`) on the committed diff.
  2. Save findings to `docs/superpowers/reviews/<date>-<topic>-build-audit.md`.
  3. Resolve all BLOCKERs inline. Track WARNINGs and decide whether to fix or defer with user input.
  4. Dispatch Codex (via `mcp__codex__codex`) on the same diff plus the audit's findings.
  5. Save findings to `docs/superpowers/reviews/<date>-<topic>-build-codex.md`.
  6. Resolve all BLOCKERs inline.
  7. Update `.phase-gate.yaml` with `build_audit` and `build_convergence` sections.
  8. Get explicit user approval to deploy (separate from the plan-execution approval).
  9. Update `.phase-gate.yaml`'s `deploy_approval` block.
  10. THEN proceed with the deploy step.

## What NOT to do

- Don't substitute self-review for the build audit. You wrote the code; your eyes aren't fresh.
- Don't treat the plan-level audit/convergence as sufficient for deploy. The plan and the build are different artifacts.
- Don't run convergence forever — once the cycle finds no new BLOCKERs and only NITs, terminate. The goal is "the build is shipping-safe," not "the build is theoretically perfect."

## Phase-gate hook enforcement

The hook (`~/.claude/hooks/phase-gate.sh`) was updated to gate deploy-pattern dispatches in addition to implementation dispatches:

- **Implementation dispatches** (description matches `^(Phase N )?Task N:` or `^Implement\b` etc.) require `audit.passed && convergence.passed && user_approval.approved`.
- **Deploy dispatches** (description matches `^(Phase N Task N: )?Deploy\b`, `^Push\b`, or `^Merge to (staging|main|production)\b`) require all of the above PLUS `build_audit.passed && build_convergence.passed && deploy_approval.approved`.

The hook fails the deploy dispatch with exit code 2 if any deploy-gate is unsatisfied.

## Honest reality

Plan convergence catches the architectural blunders. Build convergence catches the actual-bytes-shipping blunders. Both rounds are cheap (subagent dispatch + Codex API call, ~$2 + 5 minutes each). The wrong deploy costs hours of rollback, a customer incident, or a missed insight Codex would have caught for $2. Always cheaper to audit twice.
