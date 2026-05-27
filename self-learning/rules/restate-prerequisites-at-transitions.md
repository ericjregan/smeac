# Restate Prerequisites at Every Transition

## The Rule

At every workflow transition (spec → plan → audit → convergence → approval → execute → verify → deploy → ship), before taking the next action, STOP and write a one-paragraph restatement:

> "I am about to do **X**. The prerequisites for X are **Y** and **Z**. Y is satisfied because [evidence — file path, commit SHA, user quote]. Z is satisfied because [evidence]. Proceeding."

If any prerequisite lacks citable evidence, DO NOT proceed. Surface the gap to the user.

## Why

- **Why:** "User said yes" can mean three different things at three different transition points. On 2026-05-26 the user said "yes" to the Phase 1 plan content; I interpreted that as the green light to execute, but the audit and convergence prerequisites for execution were never satisfied. The result: dispatched implementation work on an un-audited plan. Eric caught it; I owe him a guardrail that catches it next time.
- **The pattern:** confused approval. Approval at transition N does not authorize transition N+2.

## How to apply

For each transition, the restate template:

| Transition | What I'm doing | Prerequisites I must cite |
|---|---|---|
| Idea → Spec | Writing a design spec | Brainstorming complete with user signoff on the approach |
| Spec → Plan | Writing implementation plan | Spec exists, user signed off on spec, scope confirmed |
| Plan → Audit | Dispatching audit agent | Plan file written and committed |
| Audit → Convergence | Dispatching Codex | Audit findings reviewed, all BLOCKERs resolved |
| Convergence → Approval | Asking user to execute | Convergence findings reviewed, all BLOCKERs resolved, audit file path + convergence file path quotable |
| Approval → Execute | Dispatching first implementation subagent | User said "execute" or equivalent in conversation, `.phase-gate.yaml` written with all 3 gates passed |
| Execute → Verify | Running tests on built code | Code committed, tests written |
| Verify → Deploy | Pushing to staging | All tests pass, user approved deploy |
| Deploy → Ship | Marking complete in roadmap | Staging verified healthy, user confirmed acceptance |

## Failure modes this catches

- "Yes" to plan content treated as "yes" to execution
- Audit run but findings not actually reviewed before moving on
- Convergence run but BLOCKERs left open
- Tests passing locally treated as production-ready
- Staging deploy treated as production deploy

## What to write at each transition

Not boilerplate — actual evidence. Examples of GOOD restatements:

- "I am about to dispatch the first implementation subagent for Task 2. Prerequisites: audit pass (`docs/superpowers/reviews/2026-05-26-phase-1-audit.md`, 0 blockers), convergence pass (`docs/superpowers/reviews/2026-05-26-phase-1-codex.md`, 0 blockers), user approval ('go ahead with phase 1' at 18:55). All cited. `.phase-gate.yaml` reflects all three gates passed. Proceeding."

Examples of BAD restatements (don't do these):

- "Looking good, proceeding." (no evidence)
- "User approved the plan, executing." (which approval — plan content or execute-now?)
- "Audit passed." (where is the audit document? which agent ran it?)

## When to skip this

You may skip the restatement when:
- The transition is trivial (e.g., running a typecheck after editing a file)
- The transition is part of a tight feedback loop (TDD red-green-refactor cycles within a task)

You may NOT skip the restatement when:
- Dispatching a subagent
- Committing code
- Pushing to a remote
- Deploying to any environment
- Declaring work "done"
- Asking the user for approval to proceed
