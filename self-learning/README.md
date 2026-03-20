# Self-Learning System

A reflection and recurrence-tracking system for Claude Code. Turns session corrections into permanent, automatically-loaded rules.

**Status: Work in progress.** Phase 1 is deployed and running. Phase 2 (autoresearch) not yet built.

---

## How It Works

```
User corrects Claude  →  /reflect captures it  →  Pattern-Key assigned
                                                         |
                                                  Count increments
                                                  on recurrence
                                                         |
                                              Count >= 3, Score >= 6?
                                                    /          \
                                                  no           yes
                                                  |             |
                                              stays pending   → /reflect --promote
                                                                     |
                                                              User approves?
                                                                /        \
                                                              no         yes
                                                              |           |
                                                           skip    → ~/.claude/rules/<key>.md
                                                                     (auto-loaded every session)
```

---

## Components

### Skill: `/reflect`

The core skill. Scans the current conversation for corrections, abstracts them into reusable patterns, tracks recurrence, and promotes to hard rules when patterns repeat enough.

- `/reflect` — analyze current session
- `/reflect --review` — show all pending learnings
- `/reflect --promote` — walk through promotion candidates
- `/reflect --phase2-check` — report Phase 1 usage stats

**Source:** [skills/reflect/SKILL.md](skills/reflect/SKILL.md)

### Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| [session-start.sh](hooks/session-start.sh) | SessionStart | MCP health check + surfaces recurring learnings (count >= 3) |
| [stop-reflect.sh](hooks/stop-reflect.sh) | Stop | Reminds to capture learnings (silenceable: `touch ~/.claude/.reflect-quiet`) |
| [no-guessing.sh](hooks/no-guessing.sh) | UserPromptSubmit | Detects diagnostic questions, forces investigation before answering |
| [subagent-stop.sh](hooks/subagent-stop.sh) | SubagentStop | Quality gate — rejects empty/thin/unverified agent results |

### Rules

| Rule | Purpose |
|------|---------|
| [meta-rules.md](rules/meta-rules.md) | How Claude should format rules when capturing learnings or promoting |

### Data Files (not in repo — generated at runtime)

| File | Location | Purpose |
|------|----------|---------|
| `learnings.md` | `~/.claude/projects/<your-home>/memory/` | Structured learning log with recurrence counting |
| `reflect-usage.json` | `~/.claude/projects/<your-home>/memory/` | Usage ledger for Phase 2 trigger |

---

## Installation

These files install into `~/.claude/`. The live system reads from there, not from this repo.

```bash
# Skills
cp -r skills/reflect ~/.claude/skills/

# Hooks
cp hooks/*.sh ~/.claude/hooks/

# Rules
cp rules/meta-rules.md ~/.claude/rules/

# Then register hooks in ~/.claude/settings.json (see PLAN.md Task 8)
```

**Rollback:** See [HOOKS-ROLLBACK.md](HOOKS-ROLLBACK.md)

---

## Phase 2: Autoresearch (Not Yet Built)

Autonomous optimization loops. The system identifies patterns and runs experiments to improve itself. Triggers only after Phase 1 proves useful (10+ learnings, 2+ promotions, 10+ sessions, 2+ weeks).

See [PLAN.md](PLAN.md) for the full specification.
