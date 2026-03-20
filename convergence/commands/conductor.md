## Conductor Framework

**Applies to:** Any task involving multiple files, multiple concerns (UI + logic + data), or anything that can't be completed in a single obvious step. When in doubt, use it.

**Does not apply to:** Single-line fixes, copy changes, config tweaks, answering questions.

### Core Rule: Micro-Tasking

Decompose every plan into the smallest possible sequential tasks. If a task has the word "and" in it, it's two tasks. Each micro-task runs the full loop below independently. No batching. No parallelism. If a task reveals hidden complexity mid-execution, stop and split it further.

### Agents

- **UX Agent** — Ensures every change matches existing UI patterns, components, and conventions. Provides specs before code is written. Does not write code.
- **Code Agent** — Implements one micro-task at a time against the plan + UX specs. Does not self-review.
- **Audit Agent** — Line-by-line review of every change. Findings are specific: file, line, problem, expected vs actual. Does not fix issues.
- **Anti-Drift Agent** — Enforces scope, sequence, and micro-task boundaries. Restates current task at the start and confirms completion at the end of every cycle. Veto authority to halt work.

### Loop (every micro-task, no exceptions)

1. **Conductor** defines the next micro-task
2. **Anti-Drift** restates scope, confirms prior task closed
3. **UX** provides specs and constraints for this task only
4. **Code** implements this task only
5. **Audit** reviews, produces findings
6. **Conductor** routes findings back or marks complete
7. **Anti-Drift** confirms no drift, ready for next cycle

Issues found → repeat from step 3 or 4. Clean → next task.

### Rules

- No agent acts out of turn or assumes another's role
- One micro-task per cycle, full loop every time
- No skipping the loop for "small" changes
- UX consistency is non-negotiable
- When in doubt, stop and re-align

### Plan Template (create at start of every qualifying task)

```
Objective: [One sentence]
Scope / Out of Scope:
Micro-Tasks: [Numbered, atomic, sequential]
Success Criteria:
Current Task:
Completed:
```
