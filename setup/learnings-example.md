---
name: Agent learning log
description: Structured log of learnings with recurrence counting and promotion tracking. Read by /reflect skill and SessionStart hook.
type: reference
---

# Learnings Log

## Schema

Each entry follows this exact format. Pattern-Keys are **lowercase, dot-separated tokens, no special characters**. Lookup via `grep -F "Pattern-Key: <key>"` (fixed-string match). Archive to `learnings-archive.md` when this file exceeds 50 entries.

```
## [LRN-YYYYMMDD-XXX] pattern.key.here

**Status**: pending | promoted | resolved | wont_fix
**Pattern-Key**: category.subcategory.specific
**Recurrence-Count**: 1
**First-Seen**: YYYY-MM-DD
**Last-Seen**: YYYY-MM-DD
**Score**: D=0 I=0 S=0 (Total: 0)

### Summary
One-line description

### Details
Context, what happened, what's correct

### Suggested Rule
The rule text as it would appear in .claude/rules/ if promoted
```

### Scoring Dimensions (0-3 each)

| Dimension | 0 | 1 | 2 | 3 |
|-----------|---|---|---|---|
| **D**urability | One-time fix | Temp workaround | Stable pattern | Architectural truth |
| **I**mpact | Nice-to-know | Saves 1 minute | Prevents mistakes | Prevents breakage |
| **S**cope | One file | One directory | Whole project | All projects |

**Promotion threshold:** Count >= 3 AND Total Score >= 6 AND Durability >= 2

---

## Entries

## [LRN-20260101-001] verify.before.claiming.success

**Status**: pending
**Pattern-Key**: verify.before.claiming.success
**Recurrence-Count**: 2
**First-Seen**: 2026-01-01
**Last-Seen**: 2026-01-05
**Score**: D=3 I=3 S=3 (Total: 9)

### Summary
NEVER say "should" — verify every claim of success with evidence before reporting it

### Details
Opened a browser window and said "should have opened" without checking. The window was invisible behind the desktop. Repeated multiple times. The fix: always take a screenshot, check process state, or confirm output before reporting success.

### Suggested Rule
NEVER claim something worked without evidence. "Should have" is not verification. Take a screenshot, check process state, or confirm output before reporting success. If you can't verify, say "I launched X but can't confirm it's visible — can you check?"
