Generate a Codex audit prompt for what was just done in this session.

$ARGUMENTS

## Instructions

Output a copy-pasteable prompt for Codex that includes:

1. **What was done** — summarize the work completed in this session.
2. **Project root path** — full path so Codex knows where to look.
3. **Key file paths** — every file that was created, modified, or is relevant for context. Use full absolute paths.
4. **CLAUDE.md / AGENTS.md path** — so Codex can read project conventions.
5. **Roadmap path** — if one exists.
6. **Tech stack** — brief summary.
7. **What to audit** — tell Codex to read the listed files and perform a reliability audit. It should:
   - Check for correctness, missed edge cases, and bugs.
   - Verify consistency with the project's CLAUDE.md and established patterns.
   - Flag missing tests or validation.
   - Produce a structured findings report with severity (blocker / warning / nit) and specific recommendations.

Format the entire Codex prompt inside a single fenced code block so it's easy to copy.

## Rules

- Do NOT execute any code or make changes. This is prompt generation only.
- Do NOT fabricate file paths. Only reference files you actually read or modified in this session.
- Keep it concise. Codex can read the files itself — don't inline code unless necessary for context.
