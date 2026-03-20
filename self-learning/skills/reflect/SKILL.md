---
name: reflect
description: Capture learnings from the current session, count recurrence, and promote patterns to permanent rules. The core of the self-improvement system.
---

# /reflect — Session Learning Capture

Capture what went wrong or what was learned in this session. Abstract it into a reusable pattern. Track how often it recurs. When it recurs enough, promote it to a permanent rule.

## Files This Skill Reads and Writes

- **Reads:** `~/.claude/rules/meta-rules.md` (formatting guidance)
- **Reads/Writes:** `~/.claude/projects/<your-home-project>/memory/learnings.md` (learning log — ALWAYS use this absolute path regardless of which project you're working in)
- **Reads/Writes:** `~/.claude/projects/<your-home-project>/memory/reflect-usage.json` (usage ledger — same, always absolute path)
- **Writes (on promotion only):** `~/.claude/rules/<pattern-key>.md` (promoted rules)
- **NEVER writes to:** `~/.claude/CLAUDE.md` — this is non-negotiable
- **NOTE:** These files live in the HOME project scope, not per-project scope. Learnings are global — they apply across all projects. Always use the full path `~/.claude/projects/<your-home-project>/memory/` even when working from a project directory.

## Subcommands

### `/reflect` (default — analyze current session)

1. **Scan** the current conversation for:
   - Corrections the user made ("no, don't do that", "instead use...", "actually...")
   - Mistakes that were caught (wrong approach, missed step, bad assumption)
   - Better approaches discovered ("this worked better because...")

2. **For each learning found**, abstract into a general pattern:
   - Not "I used the wrong grep flag in learnings.md" but "validate.tool.output.before.presenting"
   - Not "I forgot to check git log" but "investigation.before.removal"

3. **Read `~/.claude/rules/meta-rules.md`** for formatting guidance.

4. **Assign a normalized Pattern-Key:**
   - Lowercase, dot-separated tokens
   - No special characters, no regex metacharacters
   - Examples: `visual.verify.before.claiming`, `investigation.before.removal`, `scope.creep.detection`

5. **Check for existing match:**
   ```bash
   grep -F "Pattern-Key: <key>" "$HOME/.claude/projects/<your-home-project>/memory/learnings.md"
   ```
   **IMPORTANT:** Always use the full absolute path. Do not rely on project-relative paths — learnings.md is global, not per-project.

6. **If match found:**
   - Increment `Recurrence-Count`
   - Update `Last-Seen` to today's date
   - Add `See Also: LRN-XXXXXXXX-XXX` cross-reference if different incident

7. **If new:**
   - Create entry with Count=1
   - Ask the user to score: "Rate this learning — Durability (0-3), Impact (0-3), Scope (0-3)?"
   - If the user skips scoring, default to D=1 I=1 S=1 (Total: 3)

8. **Check promotion eligibility:**
   - If Count >= 3 AND Total Score >= 6 AND Durability >= 2: flag with "This learning is ready for promotion. Run `/reflect --promote` to review."

9. **Present proposed entry to the user for approval before writing anything.**
   - Show the formatted entry
   - Ask: "Write this to learnings.md? (y/n/edit)"
   - If the user says skip or not worth it, respect that and move on

10. **Update usage ledger** (`reflect-usage.json`):
    - Increment `invocations`
    - Add today's date to `sessions_used` (deduplicate — unique dates only)
    - If a NEW learning was created (not an update to existing): increment `learnings_captured`

### `/reflect --review` (show all pending learnings)

1. Read `learnings.md`
2. Filter to Status = pending
3. Sort by: promotion candidates first (Count >= 3, Score >= 6, Durability >= 2), then by Count descending, then by Total Score descending
4. Display as a summary table:
   ```
   | # | Pattern-Key | Count | Score | Status |
   |---|-------------|-------|-------|--------|
   | 1 | visual.verify.before.claiming | 4 | D=3 I=3 S=3 (9) | *PROMOTE* |
   | 2 | scope.creep.detection | 2 | D=2 I=2 S=2 (6) | pending |
   ```
5. If `reflect-usage.json` shows 5+ invocations, mention: "Run `/reflect --phase2-check` to check Phase 2 readiness."

### `/reflect --promote` (walk through promotion candidates)

For each entry where Count >= 3 AND Score >= 6 AND Durability >= 2 AND Status = pending:

1. **Present to the user:**
   ```
   PROMOTION CANDIDATE: [Pattern-Key]
   Recurrence: [Count] times across [date range]
   Score: D=[X] I=[X] S=[X] (Total: [X])

   Summary: [one-line]

   Suggested Rule:
   [The rule text formatted per meta-rules]

   Proposed file: ~/.claude/rules/[pattern-key].md
   Scope: [universal (no globs) | project-scoped (globs: ["path/**"])]
   ```

2. **Ask the user:** "Approve / Edit / Skip?"

3. **If approved:**
   - Create `~/.claude/rules/<pattern-key>.md` with frontmatter:
     ```yaml
     ---
     description: [one-line from Summary]
     globs: [empty for universal, or specific glob pattern]
     ---
     ```
   - Write the rule content formatted per meta-rules
   - Update learning Status to `promoted` in learnings.md
   - Increment `promotions` in reflect-usage.json

4. **If edited:** Apply the user's edits, then create the rule file.

5. **If skipped:** Move to next candidate. Do not change Status.

6. **After all candidates reviewed:** If learnings.md has > 50 entries, offer to archive promoted/resolved entries to `learnings-archive.md`.

### `/reflect --phase2-check` (Phase 2 readiness report)

Read `reflect-usage.json` and `learnings.md`. Report:

```
Phase 1 Usage Report
─────────────────────
Learnings captured:  [learnings_captured from ledger] / 10 required
Promotions completed: [promotions from ledger] / 2 required
Sessions used:       [unique dates in sessions_used] / 10 required
Time since deploy:   [days since first_deployed] / 14 required

Status: [NOT READY — X of 4 criteria met] or [READY — all 4 criteria met]
```

When ALL four met:
> "Phase 1 is working. Consider building Phase 2 (autoresearch). Read the Phase 2 section of the self-learning PLAN.md for the full spec."

When not met: report which are satisfied and which remain.

## Rules

- **NEVER write to `~/.claude/CLAUDE.md`** — all promotions go to `~/.claude/rules/`
- **ALWAYS ask the user before writing to any file** — present the entry, get approval
- **If the user says "skip" or "not worth it"** — respect that, move on, no guilt trip
- **If no learnings found in the session** — say "No corrections or learnings detected this session." and stop
- **Pattern-Keys must be normalized** — lowercase, dot-separated, no special chars
- **Existing match lookup uses `grep -F`** — fixed-string match, no regex
- **Default score when the user skips** — D=1 I=1 S=1 (Total: 3)
