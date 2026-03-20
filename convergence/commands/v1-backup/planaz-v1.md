Plan A-to-Z: Full planning pipeline with Conductor protocol, self-audit, and Codex handoff.

Objective: $ARGUMENTS

## Step 1: Gather Context

Before planning anything:
1. Read the project's CLAUDE.md and/or AGENTS.md.
2. Read the project's roadmap file (check docs/ for master-roadmap.md, PRODUCT-ROADMAP.md, or similar).
3. Run git status and git log to understand current state.
4. Identify all files, modules, and boundaries relevant to the objective.

Do not proceed until you understand the project's architecture, conventions, and current state.

## Step 2: Plan Using Conductor Protocol

Create a full Conductor plan following this template:

```
Objective: [One sentence]
Scope / Out of Scope:
Micro-Tasks: [Numbered, atomic, sequential — if a task has "and" in it, split it]
Success Criteria:
Dependencies: [What each task depends on]
Files Affected: [Full paths for every file that will be created or modified]
Risk Areas: [Where things are most likely to go wrong]
```

Rules:
- Decompose into the smallest possible sequential tasks.
- Each micro-task must be independently completable and verifiable.
- Identify the agents involved per task (UX, Code, Audit, Anti-Drift).
- No hand-waving. Every task must be specific enough that someone unfamiliar with the codebase could understand what to do.

## Step 3: Audit the Plan

Run a full /audit (Reliability Push) against the plan itself. Treat the plan as the artifact under test.

### Before You Touch Anything

1. Re-read the project's CLAUDE.md / AGENTS.md.
2. Re-read existing test infrastructure — understand what patterns exist.
3. Check git status and recent commits to confirm current state.

### Goals

1. Proactively find failures in the plan. Don't wait to be told where to look.
2. Validate that every micro-task has a verifiable completion criteria.
3. Report hard findings, not opinions.

### Operating Rules

- Use Conductor framework with micro-tasks, sequential only.
- Show pass/fail assessments, not vibes.
- For each finding, state: task number, problem, expected vs actual, fix.
- End with: what's wrong, what's missing, residual risk.

### Audit Checklist

For each micro-task:
- Is it truly atomic? Can it be split further?
- Is the sequence correct? Are dependencies satisfied?
- Are there missing tasks (migrations, tests, config, env vars, deployments)?
- Does it account for error cases and edge cases?
- Is anything out of scope creeping in?
- Are success criteria measurable and verifiable?
- Are file paths accurate and complete?
- Does it contradict the project's CLAUDE.md or established patterns?

### Acceptance Bar

- No blocker-level findings in the plan.
- Every micro-task has a clear, verifiable success criteria.
- All file paths confirmed accurate.
- No missing dependencies or sequencing errors.

### Findings Report

```
### Plan Audit Findings
- [BLOCKER/WARNING/NIT] Task #X: [Problem] -> [Fix]
- [BLOCKER/WARNING/NIT] Task #X: [Problem] -> [Fix]
...

### Residual Risk
- [Honest assessment of what could still go wrong]
```

## Step 4: Re-Plan

Incorporate all audit findings into a revised plan. This is the final plan. It must be tighter, more complete, and more precise than the first draft.

Use the same Conductor template from Step 2 but improved.

## Step 5: Save the Plan

Save the final plan to the project root as `PLAN-<slugified-topic>.md`.
- Slugify the topic: lowercase, hyphens, no special characters.
- Example: objective "rebuild onboarding flow" saves as `PLAN-rebuild-onboarding-flow.md`
- The file must include the full Conductor plan, the audit findings that shaped it, and a summary of context gathered in Step 1.

State the full file path after saving.

## Step 6: Generate Codex Audit Prompt

Output a clearly formatted, copy-pasteable text block for Codex to perform a reliability audit of the plan.

The prompt must be self-contained and include:
1. The objective and why it matters.
2. The full file path to the saved plan (so Codex can read it).
3. The project root path.
4. Key file paths Codex should read for context (CLAUDE.md, roadmap, relevant source files).
5. The tech stack and architecture summary.
6. Any decisions made during planning and why.
7. Clear instructions telling Codex to:
   - Read the plan file and all referenced files.
   - Audit for: missed edge cases, wrong sequencing, missing dependencies, scope creep, under-specified tasks, incorrect assumptions about the codebase, missing tests or validation steps, deployment concerns.
   - Produce a structured findings report with severity (blocker / warning / nit) and specific recommendations.
   - Flag anything that contradicts the project's CLAUDE.md or established patterns.

Format the Codex prompt inside a single fenced code block so it's easy to copy.

## Rules

- Do NOT skip any step.
- Do NOT execute the plan. This command is planning only.
- Do NOT commit anything.
- Ask clarifying questions BEFORE Step 2 if the objective is ambiguous. Do not guess.
- If the project has no CLAUDE.md or roadmap, say so and proceed with what's available.
