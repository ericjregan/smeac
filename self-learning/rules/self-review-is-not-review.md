# Self-Review Is Not Review

## The Rule

NEVER treat "I read it again with fresh eyes" as a substitute for external review.

## Why

- **Why:** Self-review is the same eyes that wrote the thing. They will miss what they missed the first time. The Calderon plan's inline self-review caught nothing; the dispatched audit agent found 5 warnings and 2 nits in the same plan five minutes later.
- **The incident:** 2026-05-26. Wrote Phase 1 of run_id provenance plan, used the `writing-plans` skill's inline self-review step, declared "self-review passed" without dispatching an external auditor. Eric caught the miss. The subsequent fresh-eyes audit found the local-DB DSN was wrong, the staging verification used a hardcoded chunk filename that changes every deploy, no row-count check before a table-locking index build, and three other defects.

## How to apply

- The `writing-plans` skill's "Self-Review" section is a SMOKE CHECK before handoff to external review. It catches placeholders and obvious type drift. It does NOT replace external audit.
- After every plan: dispatch a real audit agent. See `plan-audit-convergence-required.md`.
- After every spec: dispatch a fresh-eyes review (can be lighter than plan audit).
- After every PR: external code review by a specialized agent (`pr-review-toolkit:code-reviewer` minimum).
- Phrases that should trigger an alarm in your own thinking:
  - "I'll just check it once more myself"
  - "It looks clean on a re-read"
  - "I caught the issues during writing"
  - "Self-review passed — moving on"
  - "I gave it fresh eyes" (the eyes that wrote it five minutes ago are not fresh)

If any of those phrases appear in your output, STOP and dispatch external review before proceeding.

## What "external" means

- A different agent type than the writer used (you wrote the plan → dispatch `feature-dev:code-reviewer` or similar)
- A different model can help but is not required — the structural separation matters more than the model
- The reviewer must have NO context from the writing session — give it the plan + spec + codebase paths, nothing more
- The reviewer must produce a written findings document, not a "looks good"

## The cost is worth it

Each external review costs a subagent invocation (~$0.10-$1.00) and 2-5 minutes. The wrong execution costs minutes-to-hours of subagent time on a defective plan, plus rework, plus user trust. Always cheaper to audit.
