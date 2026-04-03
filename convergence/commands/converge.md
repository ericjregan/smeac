Run the Codex convergence loop from a handoff file. Reads context, invokes Codex via MCP, classifies findings, applies fixes or pauses for human input, iterates until convergence.

$ARGUMENTS

## Before You Start

1. Locate the handoff file. It will be one of:
   - A path provided in $ARGUMENTS
   - A `~/.claude/tmp/convergence-handoff-*.md` file referenced in this conversation
2. Read the handoff file in full. If it doesn't exist or is missing required sections (Audit Target, Project Context, Files to Audit), return: **HANDOFF_INVALID — [what's missing]**. For build audits, also require Validation Context and Change Context sections — if missing, return HANDOFF_INVALID.
3. Read the project's CLAUDE.md and/or AGENTS.md (path is in the handoff — field is "Project instructions").
4. If an iteration log exists at `~/.claude/tmp/convergence-log-<topic>.md`, read it — you're continuing after a PAUSE.
5. Check the handoff's Resume State section. If present, note the iteration number and Eric's decision.
6. Read the `Rigor` field from the handoff file's Project Context section. Map it to `RIGOR_CONFIG`:
   - `low` → `RIGOR_CONFIG = { "model_reasoning_effort": "low" }`
   - `medium` → `RIGOR_CONFIG = { "model_reasoning_effort": "medium" }`
   - `high` → `RIGOR_CONFIG = { "model_reasoning_effort": "high" }`
   - If the field is absent (v1 handoffs) or unrecognized → default to `RIGOR_CONFIG = { "model_reasoning_effort": "medium" }`. Log: "Rigor field not found in handoff — defaulting to medium."

   Store `RIGOR_CONFIG` in working memory. It will be passed as the `config` parameter in Step B Phase 1. It is NOT passed in `codex-reply` calls — Codex session config is set once at session start.

7. Determine the status file path: `~/.claude/tmp/convergence-status-<topic>.txt`. The `<topic>` slug MUST be derived from the handoff filename (e.g., `convergence-handoff-convergence-v2.md` → `convergence-v2`), NOT from the raw Audit Target Objective. This ensures the path is always shell-safe without additional sanitization. Initialize the file:
   ```json
   {"step": "init", "phase": null, "totalPhases": null, "detail": "Convergence starting — loading handoff", "startedAt": "<ISO timestamp>"}
   ```
   If the file cannot be written, log a warning and continue. Status file failure is non-blocking.

## The Loop

Initialize: `iteration = 0` (or Resume State iteration if continuing — note: Resume State uses the NEXT iteration number, i.e., paused-at + 1)

### Step A: Build the Codex audit prompt

Write to status file: `{"step": "A", "phase": null, "totalPhases": null, "detail": "Building audit prompt from handoff", "startedAt": "<ISO timestamp>"}`
If the status file write fails, log a warning and continue. Status file failure is non-blocking.

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

### Step B: Invoke Codex (Phased Auditing)

Step B runs a multi-phase Codex audit using session persistence. Each phase builds on the previous — Codex reads all files once in Phase 1 and audits in batches from Phase 2 onward.

**Connection timeout definition:** If a Codex MCP call has not returned ANY data within 90 seconds of invocation, the connection is considered hung. This is NOT a response timeout — once data begins flowing, the call runs as long as needed. Codex legitimately takes 5-10 minutes for thorough audits.

**Timeout enforcement:** On every `mcp__codex__codex` and `mcp__codex__codex-reply` call, track elapsed time from invocation to first data received. If 90 seconds elapse with zero data, the call is considered timed out and proceed to the phase-specific timeout handler. If the tool framework does not support mid-call abort, note the hang and proceed directly to fallback.

**Overload vs. timeout:** A connection timeout means zero bytes in 90 seconds (server unreachable or hung connection). An overload is an explicit error response: HTTP 429, 503, or an error message containing "overloaded", "too many requests", or "service unavailable". These are different failure modes with different handling. Overload backoff applies at Phase 1, Phase 2-N, and Final Phase.

**Overload backoff (applies at ALL phases):**
1. Wait 10 seconds → retry the same MCP call
2. Wait 30 seconds → retry the same MCP call
3. Try CLI equivalent (temp-file transport — see below)
4. CLI also fails → behavior depends on phase (see below)

**All status file writes and deletes in Step B are non-blocking.** If any write or delete fails, log a warning and continue.

Write to status file at the start of each phase transition.

---

#### Phase 1: Context Load + Audit Plan

Write to status file: `{"step": "B", "phase": 1, "totalPhases": null, "detail": "Codex reading files and building audit plan", "startedAt": "<ISO timestamp>"}`

**Tool:** `mcp__codex__codex` (new session, passes RIGOR_CONFIG)

Call:
```
mcp__codex__codex(
  prompt: <full audit prompt from Step A — ending with "Read all listed files. Return a numbered checklist of specific items you will audit, grouped by concern area (correctness, edge cases, consistency, security, test coverage). Do NOT audit yet — just return the plan.">,
  cwd: <project root from handoff>,
  config: RIGOR_CONFIG,
  approval-policy: "never",
  sandbox: "danger-full-access"
)
```

Note: `config` contains `{ "model_reasoning_effort": "<low|medium|high>" }` as set in Before You Start step 6. This is the ONLY call where `config` is passed — `mcp__codex__codex-reply` does not accept `config`. Rigor is set once at session start.

**On success:** Extract `threadId` from the response. Store it as `THREAD_ID`. If `threadId` is not found in the response (unexpected format), log "threadId unavailable — phased auditing not possible" and fall back to CLI for the full audit using the full-audit prompt (same prompt as Step A but ending with "Perform the full reliability audit now and report all findings with severity (BLOCKER/WARNING/NIT)" instead of "Do NOT audit yet"). Use temp-file transport for the CLI call. CLI succeeds: treat output as full audit result (findings, not a checklist). Skip Phases 2-N and Final Phase. Proceed to Step C.

**On connection timeout (90s no data) — go directly to CLI, do NOT run overload backoff:**
1. CLI fallback for full audit. Build a DIFFERENT prompt than the Phase 1 checklist prompt: use the full audit prompt from Step A but end with "Perform the full reliability audit now and report all findings with severity (BLOCKER/WARNING/NIT)." This is the legacy single-call behavior — CLI does not support phased auditing. Always use temp-file transport: write the prompt to `~/.claude/tmp/codex-prompt-<topic>.txt`, then run: `codex exec -c 'approval_policy=never' -c 'sandbox_mode=danger-full-access' "$(cat ~/.claude/tmp/codex-prompt-<topic>.txt)"`
2. CLI succeeds: treat output as full audit result (findings, not a checklist). Skip Phases 2-N and Final Phase. Proceed to Step C.
3. CLI fails or returns empty: retry CLI once. Still failing:
   - Delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt`
   - Return **CODEX_FAILED** with: what failed, raw audit prompt for manual execution.

**On overload (explicit 429/503/overload error) — run overload backoff:**
1. Wait 10 seconds → retry MCP
2. Wait 30 seconds → retry MCP
3. Try CLI (temp-file transport as above, full-audit prompt)
4. CLI also fails → Delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt` → Return **PAUSE** to Eric: "Codex appears overloaded after 3 attempts + CLI fallback. Options: (a) wait and retry, (b) I will audit these items manually." Only these two options are allowed.

**On any other MCP/tool/server error (not timeout, not overload, not empty):**
Treat as equivalent to connection timeout — fall back to CLI immediately. Follow the timeout path above. Exception: if the CLI fallback fails with the same error class (e.g., both return authentication or permission errors), do not retry — delete the status file and return CODEX_FAILED with the specific error. Repeated auth failures indicate a configuration problem, not a transient issue.

**On empty/malformed response:** Retry once via CLI (full-audit prompt, temp-file transport). Both empty:
- Delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt`
- Return **CODEX_FAILED**.

**On unparseable Phase 1 checklist (response received but not a numbered checklist):**
Treat as malformed response — retry once via CLI (full-audit prompt, temp-file transport). If CLI also returns an unparseable result:
- Delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt`
- Return **CODEX_FAILED**.

---

#### Phases 2 through N: Batched Audit Execution

Parse Phase 1 checklist into numbered items. If not parseable, treat as malformed Phase 1 response. Determine total batch count (5 items per batch). Store as `TOTAL_BATCHES`. Compute `TOTAL_PHASES = TOTAL_BATCHES + 2` (Phase 1 + N batches + Final).

For each batch (items X through Y):

Write to status file: `{"step": "B", "phase": <batch + 1>, "totalPhases": <TOTAL_PHASES>, "detail": "Auditing items X-Y: [brief description]", "startedAt": "<ISO timestamp>"}`

**Tool:** `mcp__codex__codex-reply` (continues session — does NOT pass `config`)

Call:
```
mcp__codex__codex-reply(
  prompt: "Audit items X through Y from your checklist. For each item, report: severity (BLOCKER/WARNING/NIT), file path, line number if applicable, what's wrong, why it matters, and your recommended fix. If an item checks out clean, report it as PASS with a one-line reason.",
  threadId: THREAD_ID
)
```

**On connection timeout (90s no data) for a batch — escalation chain (no findings dropped):**
1. Retry that batch — call `mcp__codex__codex-reply` again with same `THREAD_ID` and same prompt. One retry.
2. If retry also times out — CLI fallback for this batch only. Write a standalone prompt with items X-Y and their file paths to `~/.claude/tmp/codex-prompt-<topic>.txt`, then: `codex exec -c 'approval_policy=never' -c 'sandbox_mode=danger-full-access' "$(cat ~/.claude/tmp/codex-prompt-<topic>.txt)"`
   - CLI succeeds: incorporate findings. Continue to next batch.
   - CLI fails: PAUSE to Eric (standard Step B PAUSE contract — see below).

**Batch accounting:** After every batch response (MCP or CLI), list every item number from the batch. For each, confirm you received a finding (BLOCKER/WARNING/NIT/PASS). Any item without a confirmed result is "missing" and must be retried via CLI or escalated via PAUSE.

**Thread staleness probe (applies after ANY batch CLI fallback, regardless of failure type):** If any batch in the current iteration used CLI fallback for any reason (timeout, overload, generic error, or partial response), probe the MCP session before attempting the next MCP batch: `mcp__codex__codex-reply(prompt: "Confirm session is active. Reply OK.", threadId: THREAD_ID)`. If the probe fails, abandon the MCP session and use CLI (temp-file transport) for all remaining batches. Note in the convergence report that mixed MCP+CLI auditing was used.

**On overload (explicit 429/503/overload error) during any batch:**
1. Wait 10 seconds → retry MCP (`mcp__codex__codex-reply` with same `THREAD_ID`)
2. Wait 30 seconds → retry MCP
3. Try CLI for this batch only (temp-file transport, standalone prompt)
4. CLI also fails → PAUSE to Eric (standard Step B PAUSE contract — see below).

**On any other MCP/tool/server error during a batch:**
Treat as equivalent to connection timeout — retry once on same thread, then CLI, then PAUSE (standard Step B PAUSE contract — see below). Exception: if both MCP and CLI fail with the same authentication or permission error, do not continue retrying — go directly to PAUSE with the specific error noted as a likely configuration problem.

**On empty/malformed/partial batch response:**
If the response does not account for every requested item in the batch, retry once (`mcp__codex__codex-reply` with same prompt). If still incomplete after retry, CLI for the missing items. If CLI also fails to cover them, PAUSE (standard Step B PAUSE contract — see below) with the unaudited items listed.

**Standard Step B PAUSE contract (used by all batch failure paths):**
PAUSE is an immediate return to the parent session. When reaching a PAUSE from a batch failure:
1. Delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt`
2. Return **PAUSE** immediately with this payload:
   - Which phase/batch failed
   - Which items are unaudited
   - How many attempts were made (MCP + retry + CLI)
   - Allowed options for Eric: `(a) retry` or `(b) audit those items manually` — only these two. Every item must be audited or explicitly paused. There is no bypass option.
3. The parent session writes Eric's decision to the handoff file's Resume State for the next `/converge` run.

**Codex must not make edits.** If Codex asks to make edits or write fixes during any phase: ALWAYS DECLINE. Codex is the auditor only.

---

#### Final Phase: Consolidation

Write to status file: `{"step": "B", "phase": <TOTAL_PHASES>, "totalPhases": <TOTAL_PHASES>, "detail": "Codex consolidating findings across all batches", "startedAt": "<ISO timestamp>"}`

**Tool:** `mcp__codex__codex-reply` (same session — does NOT pass `config`)

Call:
```
mcp__codex__codex-reply(
  prompt: "You've completed all audit items. Provide a consolidated summary: all findings grouped by severity, any cross-cutting concerns you noticed across multiple files that individual items didn't capture, and your overall assessment of the build quality.",
  threadId: THREAD_ID
)
```

**On connection timeout (90s no data) — do NOT run overload backoff:**
Retry once (`mcp__codex__codex-reply` with same `THREAD_ID`). If retry also times out: skip the consolidation step (non-fatal — batch findings are already collected). Note in report: "Consolidation phase failed. Cross-file analysis may be incomplete." Do NOT return CODEX_FAILED for consolidation failure alone.

**On overload (explicit 429/503/overload error) — run overload backoff:**
1. Wait 10 seconds → retry MCP
2. Wait 30 seconds → retry MCP
3. Try CLI (standalone consolidation prompt, temp-file transport)
4. CLI also fails → skip the consolidation step (same as timeout exhaustion). Note in report.

**On any other MCP/tool/server error:** Treat as timeout — retry once, then skip the consolidation step and note in report. Exception: if the error is an authentication or permission failure, do not retry — skip consolidation immediately and note the auth error in the report as a likely configuration problem.

**On success:** Merge consolidation findings with batch findings. All proceed to Step C.

---

#### Rules Carried Through Step B

- **No findings dropped.** Every checklist item is audited via MCP, via CLI, or escalated to Eric. Never silently passed over. The only outcomes for unaudited items are: retry, manual audit, or PAUSE.
- **No bypass language for audit items.** Every audit item must be accounted for. Exception: the consolidation (Final Phase) may be omitted on failure because it is a cross-file summary, not a findings-producing step. Batch findings are already collected.
- **config is Phase 1 only.** `mcp__codex__codex` receives `RIGOR_CONFIG`. `mcp__codex__codex-reply` does not — session config set once.
- **threadId reuse.** All Phase 2+ calls use `THREAD_ID` from Phase 1. If `THREAD_ID` unavailable (Phase 1 fell back to CLI), Phases 2-N and Final are skipped — CLI already returned full audit.
- **Codex must not make edits.** Always decline. Codex reads, runs tests, reports. You apply fixes.
- **Status file writes are non-blocking.** If any write or delete fails, log a warning and continue.
- **All CLI fallbacks use temp-file transport.** Write prompts to `~/.claude/tmp/codex-prompt-<topic>.txt` and use `$(cat ...)` — never interpolate prompts directly into shell commands.

### Step C: Classify every finding

Write to status file: `{"step": "C", "phase": null, "totalPhases": null, "detail": "Classifying N findings from Codex", "startedAt": "<ISO timestamp>"}` (Replace N with the actual count of findings returned.)

For each finding Codex returns:
- **AGREE** — Confirmed real issue. Will fix.
- **PAUSE** — Requires human input. Use when: you disagree with Codex (with specific reasoning); you're uncertain; the fix would expand scope; it requires a product decision; there are multiple valid approaches.
- **NIT** — Cosmetic or trivial. Log it, don't fix.

You MUST state specific reasoning for every classification, referencing the code or plan. "I don't think this is an issue" is not sufficient.

### Step D: Check for PAUSE

Write to status file: `{"step": "D", "phase": null, "totalPhases": null, "detail": "Checking for PAUSE items — N findings classified as PAUSE", "startedAt": "<ISO timestamp>"}`

If ANY findings are classified as PAUSE:
- Write current state to the iteration log (ALL findings and classifications for this iteration, including any already classified before the PAUSE trigger — not just the paused items)
- Delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt`
- Return **PAUSE** to the parent session with:
  - What Codex found
  - Your assessment and specific reasoning
  - What you need Eric to decide

The parent session will present this to Eric, get a decision, and re-spawn you with the decision in the handoff's Resume State.

### Step E: Check oscillation

Write to status file: `{"step": "E", "phase": null, "totalPhases": null, "detail": "Checking for oscillation against previous iteration", "startedAt": "<ISO timestamp>"}`

Read the iteration log. If the same substantive finding (same file + same issue category) appeared in the previous iteration after a claimed fix, classify it as PAUSE and escalate. Do not fix the same thing twice without human input. Before returning PAUSE for oscillation, delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt`

### Step F: Apply fixes

Write to status file: `{"step": "F", "phase": null, "totalPhases": null, "detail": "Applying fix M of N: [brief description]", "startedAt": "<ISO timestamp>"}` (Update detail for each fix as it begins.)

For all AGREE findings:
- **Plan audits:** Update the plan file directly — revise tasks, add missing tasks, fix sequencing.
- **Build audits:** Apply code fixes using Conductor protocol (define fix as micro-task, implement, verify). Rerun relevant validation commands from the handoff's Validation Context.

Never fix NITs before all AGREE findings are resolved.

### Step G: Log the iteration

Write to status file: `{"step": "G", "phase": null, "totalPhases": null, "detail": "Logging iteration results", "startedAt": "<ISO timestamp>"}`

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

Write to status file: `{"step": "H", "phase": null, "totalPhases": null, "detail": "Checking convergence — N AGREE findings remaining", "startedAt": "<ISO timestamp>"}` (Replace N with actual count.)

- **Zero AGREE findings this iteration** → Delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt` → Return **CONVERGED** with the convergence report (format below).
- **Checkpoint reached** (every 3 iterations for plans, every 5 for builds): Delete the status file: `rm ~/.claude/tmp/convergence-status-<topic>.txt` → Return **PAUSE** with a checkpoint status — iterations so far, findings trend, what's been fixed, what's still open. Ask Eric to continue or stop.
- **Otherwise:** `iteration += 1` → return to Step A.

## Convergence Report Format

When returning CONVERGED, include:

```
### Convergence Report

**Audit type:** [plan / build]
**Rigor:** [low / medium / high — from RIGOR_CONFIG]
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
- The status file is deleted before every return (CONVERGED, PAUSE, CODEX_FAILED). If a convergence run is killed without a clean return, the parent session should delete any orphaned `~/.claude/tmp/convergence-status-<topic>.txt` file.
