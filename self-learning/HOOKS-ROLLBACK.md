# Self-Improvement System — Rollback Reference

## Quick Fixes

**Silence the Stop hook reminder only:**
```bash
touch ~/.claude/.reflect-quiet
```
Remove the file to re-enable: `rm ~/.claude/.reflect-quiet`

**Pause autoresearch (Phase 2, when built):**
```bash
touch .autoresearch-off   # in the project directory
```

## Disable Hooks

**Disable all hooks:** Remove the `hooks` key from `~/.claude/settings.json`. All hooks stop immediately. No restart needed — takes effect next session.

**Disable one hook:** Remove its entry from the relevant event array in `~/.claude/settings.json`.

## Remove Promoted Rules

Promoted rules live in `~/.claude/rules/`. Each is a separate file.

**Remove one rule:** Delete `~/.claude/rules/<pattern-key>.md`

**Remove all promoted rules (keep meta-rules):**
```bash
find ~/.claude/rules/ -name '*.md' ! -name 'meta-rules.md' -delete
```
**Remove ALL rules including meta-rules:** `rm ~/.claude/rules/*.md`

## Full Revert

```bash
# Remove hooks
rm -rf ~/.claude/hooks/

# Remove promoted rules + meta-rules
rm -rf ~/.claude/rules/

# Remove hooks from settings.json (edit manually — remove the "hooks" key)

# Remove quiet sentinel if it exists
rm -f ~/.claude/.reflect-quiet
```

**Note:** Learnings.md and reflect-usage.json in `~/.claude/projects/<your-project>/memory/` persist independently. They're harmless data files — delete them only if you want to erase the learning history entirely.

## What's Independent

| Component | Depends On |
|-----------|-----------|
| Hooks (SessionStart, Stop) | settings.json `hooks` key |
| /reflect skill | Nothing — works standalone |
| Promoted rules (.claude/rules/) | Nothing — loaded automatically |
| Learnings.md | Nothing — just a data file |
| reflect-usage.json | Nothing — just a data file |

Removing hooks does NOT remove rules. Removing rules does NOT remove hooks. Each can be disabled independently.
