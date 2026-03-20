---
description: Rules for how Claude should write rules — applies when capturing learnings via /reflect or creating promoted rules in .claude/rules/
globs:
---

# Meta-Rules: How to Write Rules

When writing a new rule (for learnings.md, .claude/rules/, or any instruction file), follow these principles:

## Core Principles (Always Apply)

- **Use absolute directives** — Start with NEVER or ALWAYS for non-negotiable rules
- **Lead with the problem** — Explain the rationale before the solution (1-3 bullets max)
- **Be concrete** — Include actual commands, file paths, or code for project-specific patterns
- **One clear point per block** — Don't bundle multiple instructions in one bullet
- **Bullets over paragraphs** — Keep explanations concise
- **Action before theory** — Put the immediate takeaway first

## Anti-Bloat Rules

- Do NOT add "Warning Signs" sections for obvious rules
- Do NOT show bad examples for trivial mistakes
- Do NOT create decision trees for simple binary choices
- Do NOT add "General Principle" when the section title already generalizes
- Do NOT write paragraphs when bullets convey the same information
- Do NOT write long "Why" explanations — 1-3 bullets maximum

## Distillation Rules (for promoting learnings to rules)

- **Descriptive to prescriptive**: "I noticed the project uses pnpm" becomes "ALWAYS use pnpm, not npm"
- **Verbose to concise**: Strip the explanation, keep the instruction
- **Conditional to absolute**: "Sometimes you need to restart" becomes "ALWAYS restart after .env change"
- **Incident to pattern**: "The Render cron was on a feature branch" becomes "NEVER recommend deletion without tracing origin across all branches"
