# Claude Memory Index
<!-- TEMPLATE: Links below (about-you.md, example-infra.md, etc.) are placeholders.
     Create these files in your memory directory as you add projects and preferences. -->

## Session Start — ALWAYS DO THIS
1. **Read [about-you.md](about-you.md)** — know who the user is before doing anything.
2. Read the relevant project's topic file if working on a specific project.

## Compaction Survival
- **Task list is the safety net.** Use for ALL non-trivial work.
- **After compaction:** Read task list, roadmap, `git log`. State back before continuing.

## Housekeeping
- **Keep this file under 200 lines.** Detail goes in topic files, not here.
- **Clean up proactively.** Remove stale entries after completing work.

---

## About the User
See [about-you.md](about-you.md) — **read every session.**

## Quality Standards
See [quality-standards.md](quality-standards.md)

---

## Projects (detail in topic files)

| Project | Repo | Status File |
|---------|------|-------------|
| Example App | `/path/to/repo/` | [example-infra.md](example-infra.md) |
| Another Project | `/path/to/repo2/` | [another-infra.md](another-infra.md) |

---

## Self-Improvement System
- **/reflect** skill captures learnings, counts recurrence, promotes to rules
- **learnings.md** — structured log with Pattern-Keys, scoring, recurrence counting
- **reflect-usage.json** — usage ledger for Phase 2 trigger
- SessionStart hook surfaces flagged learnings (count >= 3)
- Stop hook reminds to reflect (silenceable: `touch ~/.claude/.reflect-quiet`)
- Promoted rules go to `~/.claude/rules/<pattern-key>.md` (NEVER CLAUDE.md)
- Rollback: see `~/.claude/HOOKS-ROLLBACK.md`

---

## Topic Files Index
| File | Contents |
|------|----------|
| [about-you.md](about-you.md) | Your background, role, preferences |
| [quality-standards.md](quality-standards.md) | Multi-component work playbook |
| [learnings.md](learnings.md) | Structured learning log |
| [example-infra.md](example-infra.md) | Project infra, credentials, patterns |
