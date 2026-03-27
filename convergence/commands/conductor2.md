## Conductor2 Framework

**Applies to:** Any task using /planaz2, /build2, or /designplanbuild. This is the v2 loop — specialized agents at every step, no generic clones.

**Does not apply to:** v1 workflows (/planaz, /build, /conductor). Those remain unchanged.

### Core Rule: Micro-Tasking

Decompose every plan into the smallest possible sequential tasks. If a task has the word "and" in it, it's two tasks. Each micro-task runs the full loop below independently. No batching. No parallelism.

---

## Agent Dispatch Table

Every role, every stage, specific agent. No exceptions. No conditionals. No "or." The conductor has no discretion — this table is the law.

| Stage | Role | Agent Type |
|---|---|---|
| **Brainstorming** | Explore codebase | `feature-dev:code-explorer` |
| **Brainstorming** | Research architecture | `feature-dev:code-architect` |
| **Planaz2** | Gather context | `feature-dev:code-explorer` |
| **Planaz2** | Write plan | `feature-dev:code-architect` |
| **Planaz2** | Audit plan | `feature-dev:code-reviewer` |
| **Planaz2** | Convergence | Codex (via /converge) |
| **Build2** | UX specs | `feature-dev:code-explorer` |
| **Build2** | Implement | `feature-dev:code-architect` |
| **Build2** | Audit code | `feature-dev:code-reviewer` |
| **Build2** | Silent failure check | `pr-review-toolkit:silent-failure-hunter` |
| **Build2** | Adversarial review | `superpowers:code-reviewer` |
| **Build2** | QA (API + browser) | Custom QA Agent (defined in /build2) |
| **Build2** | Convergence | Codex (via /converge) |

---

## Per Micro-Task Loop

Every micro-task, no exceptions:

1. **Conductor** defines the next micro-task + verification criteria
2. **Anti-Drift** restates scope, confirms prior task closed
3. **UX Agent** (`feature-dev:code-explorer`) provides specs and constraints
4. **Code Agent** (`feature-dev:code-architect`) implements this task only
5. **Audit Agent** (`feature-dev:code-reviewer`) reviews, produces findings
6. **Conductor** routes findings back to Code Agent or marks complete
7. **Anti-Drift** confirms no drift, ready for next cycle

Issues found → Conductor routes back to step 4. Clean → next task.

The conductor dispatches each agent using the Agent tool with the correct `subagent_type`. The conductor reads their output and routes it. The conductor does NOT implement, review, or provide UX specs itself.

---

## End-of-Phase Sequence

After ALL micro-tasks complete, run these in order:

1. **Adversarial Review** — dispatch `superpowers:code-reviewer` as a fresh subagent. It receives ONLY: git diff + plan file + project CLAUDE.md. No builder context. Reports findings.

2. **Silent Failure Hunt** — dispatch `pr-review-toolkit:silent-failure-hunter`. Checks for swallowed errors, bad fallbacks, empty catches.

3. **QA Agent** — dispatch the Custom QA Agent (defined in /build2). Runs API acceptance tests (curl, load-bearing). Attempts browser tests in isolated instance (additive). Generates adversarial edge cases. Reports pass/fail with evidence.

4. **Reconciliation Report** — conductor produces the full build reconciliation.

5. **Codex Convergence** — spawn /converge subagent with handoff file.

---

## Iron Laws

### 1. Conductor never implements.
Dispatch specialists or flag to the user. Never pick up the tools.

**No exceptions:** Not for "quick fixes." Not for "one-line changes." Not when a subagent fails. Not when it would be "faster." If you are about to use Edit, Write, or Bash to implement something, STOP — you are violating this law.

### 2. Always use specialized agents.
Every role dispatches to the specific agent type in the table above. No generic clones. No conditionals.

**No exceptions:** Not for "simple tasks." Not because "I already know the answer." Not because "the subagent would just do what I'd do anyway." The dispatch table is not a suggestion. It is the law.

### 3. Acceptance tests required in every plan.
No plan produced by /planaz2 is complete without a `## Acceptance Tests` section containing typed, runnable tests (API/BROWSER/UNIT).

**No exceptions:** Not for refactors. Not for config changes. Not for "simple" features. Every plan has acceptance tests or the plan is rejected.

### 4. Success criteria must be machine-verifiable.
"Chat works with follow-ups" is not acceptable. "POST with threadId returns 200 with content referencing prior answer's entities" is.

**No exceptions:** If you can't express the criterion as a curl command, a test assertion, or a Playwright action, it's not a criterion — it's a wish.

### 5. Audit and QA agents cannot edit files.
Audit Agent (`feature-dev:code-reviewer`) and QA Agent report findings only. They do not edit files, write files, or fix anything. All fixes route back through the Conductor to the Code Agent (`feature-dev:code-architect`).

**No exceptions:** Not even for "obvious one-line fixes." The separation between finding and fixing is the integrity of the loop.

### 6. API tests are load-bearing, browser tests are additive.
curl always runs. Playwright is attempted in an isolated browser instance (new window, temp user-data-dir). If Playwright fails to launch, log what was skipped, produce a manual checklist. The build never fails because Playwright had a bad day.

**No exceptions:** Never skip curl tests. Never make the build dependent on Playwright availability.

### 7. Three checkpoints, not twenty approvals.
The /designplanbuild orchestrator stops at spec, plan, and build completion. Between checkpoints, work is autonomous.

**No exceptions:** Do not stop to ask permission mid-phase. Do not present options that require human input between checkpoints. Flag concerns and continue.

---

## Rationalization Prevention

If you're thinking any of these, STOP:

| Thought | Reality |
|---------|---------|
| "I'll just do this one thing myself, it's faster" | That's the conductor picking up tools. Dispatch. |
| "The subagent would just do what I'd do" | Then dispatch it and verify. Your assumption might be wrong. |
| "This task is too small for a subagent" | No task is too small. The dispatch table doesn't have a minimum. |
| "The subagent returned thin results, I'll fill in the gaps" | Re-dispatch with a better prompt. Do not absorb the work. |
| "I already have the context, dispatching would lose it" | That's the point. Fresh context catches what you rationalize away. |
| "This is just a config change, it doesn't need the full loop" | It does. The loop exists for discipline, not complexity. |
| "The acceptance tests section isn't needed for this plan" | It is. No exceptions. |
| "This criterion is obvious, it doesn't need to be machine-verifiable" | If it's obvious, writing the curl command takes 10 seconds. |
| "The spec looks good, I'll auto-advance past the checkpoint" | The checkpoint exists because human judgment is required. STOP. |

---

## Rules

- No agent acts out of turn or assumes another's role
- One micro-task per cycle, full loop every time
- No skipping the loop for "small" changes
- UX consistency is non-negotiable
- When in doubt, stop and re-align
- If a subagent fails: re-dispatch once with a better prompt. If it fails again, flag to the user. Never absorb the work.
