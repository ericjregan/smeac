Run the Codex convergence loop from a handoff file. Reads context, invokes Codex via MCP, classifies findings, applies fixes or pauses for human input, iterates until convergence.

$ARGUMENTS

## Before You Start

1. Locate the handoff file. It will be one of:
   - A path provided in $ARGUMENTS
   - A `~/.claude/tmp/convergence-handoff-*.md` file referenced in this conversation
2. Read the handoff file in full. If it doesn't exist or is missing required sections (Audit Target, Project Context, Files to Audit), return: **HANDOFF_INVALID — [what's missing]**. For build audits, also require Validation Context and Change Context sections — if missing, return HANDOFF_INVALID.
3. Read the project's CLAUDE.md and/or AGENTS.md (path is in the handoff — field is "Project instructions").
4. If an iteration log exists at `~/.claude/tmp/convergence-log-<topic>.md`, read it — you're continuing after a PAUSE.
5. Check the handoff's Resume State section. If present, note the iteration number and the user's decision.

## The Loop

Initialize: `iteration = 0` (or Resume State iteration if continuing — note: Resume State uses the NEXT iteration number, i.e., paused-at + 1)

### Step A: Build the Codex audit prompt

Rebuild from current state each iteration. The prompt must be self-contained. Pull ALL context from the handoff file:

1. The objective (from Audit Target → Objective)
2. What type of audit: plan or build (from Audit Target → Type)
3. Project root path
4. Key file paths to read (from Files to Audit)
5. Tech stack (from Project Context)
6. Key decisions (from Project Context)
7. If build: git diff or file summary (from Change Context), self-audit findings, build reconciliation
8. If build: validation commands run and results (from Validation Context)
9. If iteration > 1: summary of what was fixed since last iteration (from iteration log)
10. Tell Codex to:
    - Read the listed files and perform a reliability audit
    - Check for correctness, missed edge cases, bugs
    - Verify consistency with the project's CLAUDE.md / AGENTS.md and patterns
    - If build: evaluate whether self-audit fixes actually resolved the issues
    - Produce findings with severity (BLOCKER / WARNING / NIT) and specific recommendations
    - Report ONLY real issues — no style preferences or subjective opinions
    - **If this is a PLAN audit:** "You are auditing the PLAN DOCUMENT for design flaws. Do NOT report that features are missing from the codebase — they haven't been built yet."

### Step B: Invoke Codex

**Primary:** Call the `codex` MCP tool with the prompt. Set `cwd` to the project root from the handoff.

**Fallback (CLI):** If the MCP call fails (tool error, timeout, server unavailable), fall back to `codex exec` via Bash:
```
codex exec -c 'approval_policy=never' -c 'sandbox_mode=danger-full-access' "YOUR_PROMPT_HERE" 2>&1
```
Run from the project root directory. The prompt must be the full audit prompt from Step A — pass it as a single quoted argument. If the prompt is too long for a single argument, write it to a temp file and use: `codex exec -c 'approval_policy=never' -c 'sandbox_mode=danger-full-access' "$(cat ~/.claude/tmp/codex-prompt.txt)"`.

**If BOTH MCP and CLI fail:** Return **CODEX_FAILED** to the parent session. Include: what failed on each path, and the raw audit prompt so the user can run Codex manually.

- **If Codex asks to make edits or write fixes: ALWAYS DECLINE.** Codex is the auditor — it reads, runs tests, and reports. You apply fixes after classifying findings.
- **If the response is empty or malformed from either path:** Retry once via the other path. If both return empty, return CODEX_FAILED.

### Step C: Classify every finding

For each finding Codex returns:
- **AGREE** — Confirmed real issue. Will fix.
- **PAUSE** — Requires human input. Use when: you disagree with Codex (with specific reasoning); you're uncertain; the fix would expand scope; it requires a product decision; there are multiple valid approaches.
- **NIT** — Cosmetic or trivial. Log it, don't fix.

You MUST state specific reasoning for every classification, referencing the code or plan. "I don't think this is an issue" is not sufficient.

### Step D: Check for PAUSE

If ANY findings are classified as PAUSE:
- Write current state to the iteration log (findings, classifications, what's paused)
- Return **PAUSE** to the parent session with:
  - What Codex found
  - Your assessment and specific reasoning
  - What you need the user to decide

The parent session will present this to the user, get a decision, and re-spawn you with the decision in the handoff's Resume State.

### Step E: Check oscillation

Read the iteration log. If the same substantive finding (same file + same issue category) appeared in the previous iteration after a claimed fix, classify it as PAUSE and escalate. Do not fix the same thing twice without human input.

### Step F: Apply fixes

For all AGREE findings:
- **Plan audits:** Update the plan file directly — revise tasks, add missing tasks, fix sequencing.
- **Build audits:** Apply code fixes using Conductor protocol (define fix as micro-task, implement, verify). Rerun relevant validation commands from the handoff's Validation Context.

Never fix NITs before all AGREE findings are resolved.

### Step G: Log the iteration

Append to `~/.claude/tmp/convergence-log-<topic>.md`:

```
## Iteration [N]
### Codex Findings
- [Finding] → [AGREE / PAUSE / NIT] — [Reasoning]
### Fixes Applied
- [What changed and why]
### Tests Rerun (build only)
- [command]: [pass/fail count]
### Paused Items
- [What was escalated, if any]
```

**Compaction rule:** When writing iteration N, compact iterations 1 through N-2 into one-line summaries. Keep iteration N-1 in full detail (needed for oscillation detection).

If log file I/O fails, continue with in-memory tracking and warn that oscillation detection is degraded.

### Step H: Check convergence

- **Zero AGREE findings this iteration** → Return **CONVERGED** with the convergence report (format below).
- **Checkpoint reached** (every 3 iterations for plans, every 5 for builds): Return **PAUSE** with a checkpoint status — iterations so far, findings trend, what's been fixed, what's still open. Ask the user to continue or stop.
- **Otherwise:** `iteration += 1` → return to Step A.

## Convergence Report Format

When returning CONVERGED, include:

```
### Convergence Report

**Audit type:** [plan / build]
**Iterations:** [N]
**Converged:** YES

### Iteration Summary
| # | Findings | Fixed | Paused | NITs |
|---|----------|-------|--------|------|
| 1 | ... | ... | ... | ... |

### Paused Items Log
[Every finding that required human input, what was decided. Present even if empty.]

### Fixes Applied (cumulative)
- [file/section]: [what changed and why]

### Validation Results (build only)
- [command]: [pass/fail count]

### Remaining NITs
[Cosmetic items the user may optionally address]

### Residual Risk
[Honest assessment of what could still go wrong]
```

## Rules

- Do NOT commit anything.
- Do NOT skip any step in the loop.
- Always decline Codex file writes.
- Always present the paused items log, even if empty.
- If the handoff file is missing or invalid, return HANDOFF_INVALID immediately.
- If Codex MCP fails, fall back to `codex exec` CLI. Only return CODEX_FAILED if both paths fail.
- The handoff file and iteration log are ephemeral — the parent session handles cleanup.
