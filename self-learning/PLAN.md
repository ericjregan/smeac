# Plan: Self-Improving Agent System (v4 — Build-Ready)

## Context

the user wants his Claude Code agents to be measurably better tomorrow than they are today. Research across 4 parallel agents identified the universal pattern: **Observe → Record → Count → Promote → Apply**. the user's existing setup (global CLAUDE.md at 198 lines, 27 memory files, 5 feedback files, no hooks, no rules directory) already handles Observe, Record, and Apply. The gaps are **Count** (recurrence detection) and **Promote** (graduating patterns from soft memories to hard rules).

### Current State
- Global CLAUDE.md: 198 lines (at compliance threshold)
- Memory files: 27 (5 are feedback_*.md with structured format)
- Hooks: None configured
- Rules directory: Does not exist
- Skills: 1 (efficient-browser-automation)
- Settings: permissions, statusLine, 17 plugins enabled
- Runtime: python3 available

---

## Objective

Build a self-improvement system for Claude Code in two phases. Phase 1 closes the feedback loop (reflection + recurrence + promotion + lightweight hooks). Phase 2 adds autonomous optimization (autoresearch) only after Phase 1 proves useful.

## Design Principles

1. **NEVER append to global CLAUDE.md.** All promoted rules go to `~/.claude/rules/`. CLAUDE.md stays at 198 lines.
2. **Hooks fail silently.** Missing files = exit 0, no output. No hook takes > 2 seconds.
3. **the user approves every promotion.** No auto-write to rules.
4. **Phase 2 triggers itself.** A usage ledger (`reflect-usage.json`) tracks invocations, sessions, and promotions. `/reflect --phase2-check` reads it and tells the user when Phase 1 has enough usage data to warrant Phase 2.
5. **Hook behavior is one-edit reversible.** Remove `hooks` key from settings.json and all hooks stop. Promoted rules in `.claude/rules/` persist independently and must be removed separately if unwanted.

---

## Phase 1: Reflection + Recurrence + Promotion + Safe Hooks

### Task 1: Create directory structure + verify runtime
Create: `~/.claude/rules/`, `~/.claude/hooks/`
Verify: Both exist, `python3 --version` succeeds
Dependencies: None

### Task 2: Create meta-rules file
Create: `~/.claude/rules/meta-rules.md`
Content: How Claude should write rules when capturing learnings or creating promoted rules. Based on claude-meta template:
- Use absolute directives (ALWAYS/NEVER for non-negotiable rules)
- Lead with the problem/rationale (1-3 bullets max)
- Be concrete — include actual commands/paths for project-specific patterns
- One clear point per code block
- Bullets over paragraphs
- No examples for obvious rules, no decision trees for binary choices
- No "Warning Signs" for obvious rules, no "General Principle" when title already generalizes
No `paths:` frontmatter (loads globally).
Verify: File exists, content follows template
Dependencies: Task 1

### Task 3: Define learnings entry schema
Create: `~/.claude/projects/<your-home-project>/memory/learnings.md`
Frontmatter:
```yaml
---
name: Agent learning log
description: Structured log of learnings with recurrence counting and promotion tracking. Read by /reflect skill and SessionStart hook.
type: reference
---
```
Header documents exact entry format:
```markdown
## [LRN-YYYYMMDD-XXX] pattern.key.here

**Status**: pending | promoted | resolved | wont_fix
**Pattern-Key**: category.subcategory.specific
**Recurrence-Count**: 1
**First-Seen**: 2026-03-17
**Last-Seen**: 2026-03-17
**Score**: D=0 I=0 S=0 (Total: 0)

### Summary
One-line description

### Details
Context, what happened, what's correct

### Suggested Rule
The rule text as it would appear in .claude/rules/ if promoted
```
Normalization: Pattern-Keys are lowercase, dot-separated tokens, no special chars. Lookup via `grep -F "Pattern-Key: <key>"` (fixed-string, no regex). Archive to `learnings-archive.md` when file exceeds 50 entries.

Include one seed example from existing feedback (Status: resolved, not pending — already handled by CLAUDE.md rule 12):
```markdown
## [LRN-20260312-001] investigation.before.removal

**Status**: resolved
**Pattern-Key**: investigation.before.removal
**Recurrence-Count**: 3
**First-Seen**: 2026-03-12
**Last-Seen**: 2026-03-14
**Score**: D=3 I=3 S=3 (Total: 9)

### Summary
Never recommend removal/deletion without tracing origin first

### Details
Triggered by Render cron incident. Claude recommended deleting a cron job that was actually unreleased work on a feature branch. Pattern repeated across multiple sessions. Already addressed in CLAUDE.md rule 12 and feedback_investigation_first.md.

### Suggested Rule
N/A — already captured in CLAUDE.md rule 12
```
Verify: File exists, frontmatter correct, schema documented, seed example has Status: resolved (not pending)
Dependencies: Task 1

### Task 3b: Create usage ledger
Create: `~/.claude/projects/<your-home-project>/memory/reflect-usage.json`
Content:
```json
{
  "first_deployed": "2026-03-17",
  "invocations": 0,
  "sessions_used": [],
  "promotions": 0
}
```
The /reflect skill appends to this on each invocation:
- Increments `invocations`
- Adds current session date to `sessions_used` (deduplicated — unique dates only)
- Increments `promotions` when a promotion is completed
`/reflect --phase2-check` reads this file to compute readiness.
Verify: File exists, valid JSON
Dependencies: Task 1

### Task 4: Create reflection skill
Create: `~/.claude/skills/reflect/SKILL.md`
Skill frontmatter: name, description, user-invocable via `/reflect`

Core behavior:
1. Scan current conversation for corrections, mistakes, or better approaches the user pointed out
2. For each, abstract into a general pattern (not specific to this incident)
3. Read `~/.claude/rules/meta-rules.md` for formatting guidance
4. Assign a normalized Pattern-Key (lowercase.dot.separated)
5. Read `~/.claude/projects/<your-home-project>/memory/learnings.md`
6. `grep -F "Pattern-Key: <key>"` to check for existing match
7. **If match found:** increment Recurrence-Count, update Last-Seen, add cross-reference
8. **If new:** create entry with Count=1, ask the user to score (D/I/S 0-3 each)
9. **If Count >= 3 AND Total Score >= 6 AND Durability >= 2:** flag for promotion, present to the user
10. Present proposed entry/update to the user for approval before writing anything

Subcommands:
- `/reflect` — default, analyzes current session
- `/reflect --review` — shows all pending learnings sorted by score, highlights promotion candidates
- `/reflect --promote` — walks through promotion candidates one by one
- `/reflect --phase2-check` — reports Phase 1 usage stats (total learnings, promotions, /reflect invocations) and recommends whether Phase 2 is warranted

**Phase 2 readiness criteria** (built into --phase2-check, reads from `reflect-usage.json` and `learnings.md`):
- At least 10 learnings captured (count entries in learnings.md)
- At least 2 promotions completed (read `promotions` from reflect-usage.json)
- /reflect used in at least 10 unique sessions (count unique dates in `sessions_used`)
- At least 2 weeks since `first_deployed` date in reflect-usage.json
When ALL four met: output "Phase 1 is working. Consider building Phase 2 (autoresearch). Run: read PLAN-self-improving-agents.md Phase 2 section."
When not met: output which criteria are satisfied and which remain, with current values.
`/reflect --review` mentions `--phase2-check` once the ledger has 5+ invocations.

Rules:
- NEVER write to global CLAUDE.md
- ALWAYS ask the user before writing to any file
- If the user says "skip" or "not worth it," respect that and move on
Verify: Skill file exists, correct frontmatter, invocable, all subcommands documented
Dependencies: Tasks 2, 3

### Task 5: Add promotion logic to reflect skill
Extend: `~/.claude/skills/reflect/SKILL.md` (part of `/reflect --promote` subcommand)

Promotion flow:
1. Read learnings.md, find entries with Count >= 3, Score >= 6, Durability >= 2, Status = pending
2. For each candidate, present to the user:
   - The learning summary and details
   - The scoring matrix (D/I/S with current values)
   - The Suggested Rule text
   - Proposed file: `~/.claude/rules/<pattern-key>.md`
   - Whether it should be scoped (`paths: ["src/**/*.py"]`) or universal (no paths)
3. the user says approve/edit/skip
4. If approved: write `~/.claude/rules/<pattern-key>.md` with appropriate frontmatter
5. Update learning Status to `promoted` in learnings.md
6. If learnings.md > 50 entries: move all promoted/resolved to `learnings-archive.md`
Verify: Promotion flow documented, example output shown in skill
Dependencies: Task 4

### Task 6: Create SessionStart hook
Create: `~/.claude/hooks/session-start.sh`
```bash
#!/bin/bash
LEARNINGS="$HOME/.claude/projects/<your-home-project>/memory/learnings.md"
if [ ! -f "$LEARNINGS" ]; then exit 0; fi
# Find pending entries with Recurrence-Count >= 3
FLAGGED=$(python3 -c "
import sys
entries = []
current = None
with open('$LEARNINGS') as f:
    for line in f:
        if line.startswith('## [LRN-'):
            if current and current.get('count',0) >= 3 and current.get('status') == 'pending':
                entries.append(current)
            current = {'key': line.strip().split('] ')[1] if '] ' in line else '?'}
        if current:
            if line.startswith('**Recurrence-Count**:'):
                try: current['count'] = int(line.split(':',1)[1].strip().rstrip('+'))
                except: pass
            if line.startswith('**Status**:'):
                current['status'] = line.split(':',1)[1].strip().split()[0]
            if line.startswith('**Score**:'):
                # Parse D=X I=X S=X (Total: X)
                score_part = line.split('(Total:')
                if len(score_part) > 1:
                    try: current['total'] = int(score_part[1].strip().rstrip(')'))
                    except: current['total'] = 0
                # Parse Durability
                if 'D=' in line:
                    try: current['durability'] = int(line.split('D=')[1][0])
                    except: current['durability'] = 0
            if line.startswith('### Summary'):
                current['reading_summary'] = True
            elif current.get('reading_summary') and line.strip():
                current['summary'] = line.strip()
                current['reading_summary'] = False
if current and current.get('count',0) >= 3 and current.get('status') == 'pending':
    entries.append(current)
# Sort: promotion candidates first (total>=6, durability>=2), then by count, then score
def sort_key(e):
    promotable = 1 if e.get('total',0) >= 6 and e.get('durability',0) >= 2 else 0
    return (promotable, e.get('count',0), e.get('total',0))
entries.sort(key=sort_key, reverse=True)
for e in entries[:3]:
    tag = '*PROMOTE*' if e.get('total',0) >= 6 and e.get('durability',0) >= 2 else ''
    print(f\"[{e.get('key','?')}] (x{e.get('count',0)}) {e.get('summary','')} {tag}\".strip())
" 2>/dev/null)
if [ -n "$FLAGGED" ]; then
    echo "Recurring learnings awaiting review:"
    echo "$FLAGGED"
    echo "Run /reflect --review to see details."
fi
```
Verify: Script exists, executable, outputs nothing when no flagged learnings, outputs correctly with test data, completes in < 2 seconds
Dependencies: Task 3

### Task 7: Create Stop hook
Create: `~/.claude/hooks/stop-reflect.sh`
```bash
#!/bin/bash
# Quiet sentinel: touch ~/.claude/.reflect-quiet to silence this hook
if [ -f "$HOME/.claude/.reflect-quiet" ]; then exit 0; fi
echo "Session ending. If there were corrections worth capturing, run /reflect."
```
Note: This is the first hook to disable if it becomes habituated noise. the user can `touch ~/.claude/.reflect-quiet` without editing settings.json. Remove the sentinel to re-enable.
Verify: Script exists, executable, outputs one line, silent when sentinel exists
Dependencies: Task 1

### Task 8: Register hooks in settings.json
Modify: `~/.claude/settings.json`
Read existing JSON. Add `hooks` key:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/session-start.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/stop-reflect.sh"
          }
        ]
      }
    ]
  }
}
```
Merge into existing config. Do NOT overwrite permissions, plugins, statusLine, or other keys.
Verify: `python3 -m json.tool ~/.claude/settings.json` succeeds, hooks key present, existing keys unchanged
Dependencies: Tasks 6, 7

### Task 9: Create rollback documentation
Create: `~/.claude/HOOKS-ROLLBACK.md`
Content:
- **Silence Stop hook only:** `touch ~/.claude/.reflect-quiet` (no settings.json edit needed)
- **Disable all hooks:** Remove the `hooks` key from `~/.claude/settings.json`
- **Disable one hook:** Remove its entry from the event array in settings.json
- **Pause autoresearch (Phase 2):** `touch .autoresearch-off` in cwd
- **Remove promoted rules:** Delete individual files from `~/.claude/rules/` or delete the entire directory
- **Full revert:** Delete `~/.claude/rules/`, `~/.claude/hooks/`, remove `hooks` from settings.json
- **Note:** Hooks and rules are independent. Removing hooks does NOT remove promoted rules. Removing rules does NOT remove hooks. Learnings.md persists regardless.
Verify: File exists, instructions tested
Dependencies: Task 8

### Task 10: Create Phase 2 reminder memory file
Create: `~/.claude/projects/<your-home-project>/memory/phase2-reminder.md`
```yaml
---
name: Phase 2 self-improvement readiness check
description: After 2026-03-31, check if Phase 1 reflection system has enough usage to warrant building Phase 2 (autoresearch). Run /reflect --phase2-check.
type: project
---
```
Content:
```markdown
After 2026-03-31, run `/reflect --phase2-check` and tell the user the results.

If all criteria are met (10+ learnings, 2+ promotions, 10+ sessions, 2+ weeks), suggest building Phase 2 (autoresearch) per `PLAN-self-improving-agents.md`.

If criteria are NOT met, report which are missing and move on. Don't nag — mention it once per session at most.

Once Phase 2 is built, delete this file.
```
Verify: File exists, frontmatter correct, date is 2026-03-31
Dependencies: Task 1

### Task 11: Update MEMORY.md index
Modify: `~/.claude/projects/<your-home-project>/memory/MEMORY.md`
Add to topic files table:
```
| [learnings.md](learnings.md) | Structured learning log with recurrence counting — read by /reflect and SessionStart hook |
```
Add section:
```
## Self-Improvement System
- **/reflect** skill captures learnings, counts recurrence, promotes to rules
- SessionStart hook surfaces flagged learnings (count >= 3)
- Stop hook reminds to reflect after sessions with corrections
- Promoted rules go to `~/.claude/rules/<pattern-key>.md` (never CLAUDE.md)
- Rollback: see `~/.claude/HOOKS-ROLLBACK.md`
- Phase 2 readiness: run `/reflect --phase2-check`
```
Keep under 200 lines.
Verify: MEMORY.md updated, under 200 lines
Dependencies: Tasks 3, 9

### Task 12: Runtime validation
In a fresh Claude Code session:
1. Verify SessionStart hook fires — should show nothing (seed example is Status: resolved, not pending, so no flagged learnings)
2. Run `/reflect` — verify it loads, scans conversation, prompts for approval, and increments reflect-usage.json
3. Verify `~/.claude/rules/meta-rules.md` is being read (ask Claude "what are the meta-rules for writing rules?")
4. Verify settings.json hooks are registered (check session start behavior)
5. Run `/reflect --phase2-check` — should report: 1 learning (seed), 0 promotions, 1 session, 0 weeks. All criteria unmet. Says "not yet."
6. Test Stop hook — exit session, verify reminder appears
7. Test quiet sentinel — `touch ~/.claude/.reflect-quiet`, exit session, verify no reminder
Verify: All 7 checks pass
Dependencies: All Phase 1 tasks

---

## Phase 2: Autoresearch (triggered by /reflect --phase2-check)

**Do not build Phase 2 until `/reflect --phase2-check` reports readiness.** This means:
- 10+ learnings captured
- 2+ promotions completed
- /reflect used in 10+ unique sessions
- 2+ weeks since Phase 1 deployment

**Two trigger mechanisms (belt and suspenders):**

1. **Automated (SessionStart hook):** When all 4 criteria are met AND `phase2_prompted` is not true in reflect-usage.json, the SessionStart hook outputs one line: "Phase 1 mature. Run `/reflect --phase2-check` for details." Then writes `"phase2_prompted": true` to the ledger so it doesn't nag again.

2. **Memory file fallback (reliable):** A memory file at `~/.claude/projects/<your-home-project>/memory/phase2-reminder.md` with content: "After 2026-03-31, run `/reflect --phase2-check` and tell the user the results. If criteria are met, suggest building Phase 2 per PLAN-self-improving-agents.md." This gets read at session start via the normal memory system — proven, simple, no hook dependency.

the user sees one or both prompts during a normal session and decides when to pull the trigger.

### Task 12: Create autoresearch skill
Create: `~/.claude/skills/autoresearch/SKILL.md`
Ported from drivelineresearch/autoresearch-claude-code.
Setup: goal, metric (+direction), command, files in scope, constraints.
Runtime creates: `autoresearch.md` (marker file + session doc), `autoresearch.sh` (benchmark), `autoresearch.jsonl` (state), `experiments/worklog.md`.
Loop: edit → commit → run → measure → keep/revert → log → repeat forever.
NEVER STOP. User messages are steers — finish current experiment, then incorporate.
Verify: Skill exists, invocable via /autoresearch
Dependencies: Phase 1 validated

### Task 13: Create autoresearch UserPromptSubmit hook
Create: `~/.claude/hooks/autoresearch-context.sh`
```bash
#!/bin/bash
if [ -f "autoresearch.md" ] && [ ! -f ".autoresearch-off" ]; then
    echo "## Autoresearch Mode (ACTIVE)"
    echo "Read autoresearch.md for objective. Use autoresearch.jsonl for state."
    echo "NEVER STOP. Loop: edit, measure, keep/revert, log. Forever."
    echo "User messages are steers — finish current experiment first."
fi
```
Verify: Script exists, executable, outputs only when marker present, silent otherwise
Dependencies: Task 12

### Task 14: Register autoresearch hook
Modify: `~/.claude/settings.json`
Add UserPromptSubmit event with autoresearch-context.sh.
Verify: settings.json valid, UserPromptSubmit key present
Dependencies: Task 13

### Task 15: Autoresearch runtime validation
In a test directory:
1. Run `/autoresearch` with trivial metric
2. Verify marker file created
3. Verify hook fires on next prompt
4. Verify 1+ experiment cycle completes
5. Test `.autoresearch-off` sentinel
Verify: All checks pass
Dependencies: Tasks 12, 13, 14

---

## Files

### Created (Phase 1)
- `~/.claude/rules/meta-rules.md`
- `~/.claude/skills/reflect/SKILL.md`
- `~/.claude/hooks/session-start.sh`
- `~/.claude/hooks/stop-reflect.sh`
- `~/.claude/HOOKS-ROLLBACK.md`
- `~/.claude/projects/<your-home-project>/memory/learnings.md`
- `~/.claude/projects/<your-home-project>/memory/reflect-usage.json`
- `~/.claude/projects/<your-home-project>/memory/phase2-reminder.md`

### Created (Phase 2)
- `~/.claude/skills/autoresearch/SKILL.md`
- `~/.claude/hooks/autoresearch-context.sh`

### Modified
- `~/.claude/settings.json` (hooks key — Phase 1 and Phase 2)
- `~/.claude/projects/<your-home-project>/memory/MEMORY.md` (index entries)

---

## Success Criteria

### Phase 1
- [ ] /reflect captures learnings with normalized Pattern-Keys
- [ ] Recurrence counting increments on repeat patterns
- [ ] Promotion flags at Count >= 3, Score >= 6, Durability >= 2
- [ ] Promoted rules land in .claude/rules/ (never CLAUDE.md)
- [ ] SessionStart hook surfaces top flagged learnings (< 5 lines)
- [ ] Stop hook reminds to reflect (generic, 1 line)
- [ ] All hooks registered in settings.json
- [ ] CLAUDE.md unchanged at 198 lines
- [ ] /reflect --phase2-check reports stats and readiness
- [ ] Runtime validation passes
- [ ] Rollback docs complete
- [ ] the user approves every promoted rule

### Phase 2
- [ ] /autoresearch runs autonomous optimization loops
- [ ] Marker file created at runtime
- [ ] UserPromptSubmit hook fires only when marker present
- [ ] .autoresearch-off pauses the hook
- [ ] 1+ experiment cycle validated end-to-end

---

## Codex Re-Audit Notes

Changes from v2:
1. **Phasing tightened** — Phase 1 includes SessionStart and Stop hooks (low-risk, close the loop). Phase 2 is only PreCompact + autoresearch.
2. **PreCompact moved to Phase 2** — per Codex feedback, compaction behavior is less predictable.
3. **Phase 2 self-triggers** — `/reflect --phase2-check` built into the skill with concrete criteria (10 learnings, 2 promotions, 5 sessions, 2 weeks). the user doesn't need to remember — the system tells him.
4. **Hooks include actual code** — SessionStart hook has the full python3 parser, Stop hook has exact output. No more "behavior TBD."
5. **Seed example** from existing feedback_investigation_first.md shows the system working with real data from day 1.
