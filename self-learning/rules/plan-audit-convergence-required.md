# Plan Audit + Convergence Required Before Execution

After writing any implementation plan (e.g., `docs/superpowers/plans/<file>.md`), the next step is NEVER execution. The next step is ALWAYS:

1. **Dispatch a fresh-eyes audit agent** against the plan
   - Default: `feature-dev:code-reviewer` (general code-aware reviewer)
   - For SQL/DDL-heavy plans: also confirm against `pr-review-toolkit:silent-failure-hunter`
   - For type-heavy plans: also `pr-review-toolkit:type-design-analyzer`
   - The agent must verify the plan against the spec AND against the actual codebase state — not just read the plan in isolation
   - Resolve all BLOCKER findings inline. Track WARNINGs and decide whether to fix or defer with user input.

2. **Dispatch Codex convergence** against the plan
   - Use `mcp__codex__codex` directly or `/convergec`
   - Codex receives the plan + spec + key file paths + tech stack + project root
   - Codex returns BLOCKER/WARNING/NIT findings with stable IDs
   - Resolve all BLOCKER findings inline. Reconcile any contradictions between the audit agent and Codex by surfacing to the user.

3. **Get explicit user approval to execute**
   - Restate what's being executed and the prerequisites that were satisfied (audit report file, convergence report file)
   - The user's "yes" must be in the conversation and quotable
   - Do not infer approval from prior messages. Approval is for *executing the plan now*, not for the plan's content.

4. **Write `.phase-gate.yaml`** recording all three gates as passed
   - The phase-gate hook (`~/.claude/hooks/phase-gate.sh`) will deny implementation dispatches without it
   - See `phase-gate-discipline.md` for the schema

5. **THEN dispatch the first implementation subagent**

## Why

The `writing-plans` superpowers skill ends with "execute via subagent-driven-development." That ending is incomplete for non-trivial plans. The global rule overlays the skill: audit + convergence + approval must happen between plan completion and execution start.

Self-review during plan writing is a smoke check — it is not audit. See `self-review-is-not-review.md`.

## How to apply

- After saving a plan file: announce "Plan saved. Dispatching audit agent now." Do not offer "execution choice" until audit + convergence both pass.
- If the user pushes to skip audit/convergence ("just run it"): surface the trade-off. The Calderon convergence death spiral happened because of this exact shortcut. Document the user's override decision in the gate file's `notes` field.
- For trivially small plans (single-file, single-task, low-risk): user can explicitly waive ("skip audit and convergence, just run it") — record the waiver in the gate file with `audit.passed: true, audit.agent: user_waiver, audit.evidence: "<quote>"`. The hook accepts user-waived gates.
