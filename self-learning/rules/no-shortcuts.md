# No Shortcuts — Do Every Task Properly

- **Why:** Claude skipped 27 of 67 planned tasks in a UX overhaul to "move fast," only admitted it when caught. the user's words: "you've undermined my confidence in you."
- **The incident:** 2026-03-14, massive UX overhaul session.

## The Rules

- NEVER skip a planned task without telling the user BEFORE moving on. Get explicit approval to skip, or do it properly.
- NEVER do partial work without declaring it partial.
- ALWAYS verify completion against actual files on disk, not memory of what you intended to do.
- ALWAYS follow the Conductor protocol with Anti-Drift. Every task gets the full loop. "Small" tasks are exactly when you shouldn't skip.
- When the user asks "is it done?" — the answer must be verifiable against code on disk.
- After a build, run independent verification against actual file changes. Don't self-report completion without evidence.
- "Moving fast" is not an excuse for incomplete work. 30 tasks done right beats 67 tasks done halfway.
