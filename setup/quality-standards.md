# Quality Standards — What "Good" Looks Like

Follow these for any multi-component or creative work.

## 1. Audit Before Building

Before writing any component, read the existing codebase to extract:
- **Design system inventory**: Which shared components exist, their props, and their variants
- **Animation patterns**: Which motion variants are exported and how they're applied
- **Color/layout conventions**: Background alternation pattern, font classes, CSS custom properties
- **File structure**: How pages compose sections, how sections are exported

Do NOT guess at the design system. Read 2-3 existing components and match their patterns exactly.

## 2. Parallel Agents Get Complete Briefs

When dispatching agents for independent work, each agent prompt MUST include:
- **Exact file paths** to create
- **Design system reference** — list every shared component, its import path, and relevant props
- **Animation pattern** — copy-paste the exact boilerplate from existing components
- **Example file to follow** — name a specific existing component as the template
- **Color tokens** — list the exact class names and CSS variables
- **Content spec** — exact headlines, copy, and data structures
- **What NOT to do** — no new dependencies, no new utility functions, no design system additions

Vague briefs produce vague output. Specific briefs produce consistent output.

## 3. Review Every Agent Output

After agents complete, READ every file before integrating. Check for:
- Import paths that don't exist in the target project
- Components or props not in the design system
- Inconsistent background alternation
- Missing "use client" directive on interactive components
- Hardcoded colors instead of design tokens

## 4. Verify the Full Build

Before declaring anything "done":
1. `tsc --noEmit` — zero TypeScript errors
2. `next build` (or equivalent) — full production build passes
3. All routes render in the route table

Never trust agent self-reports. Run the build yourself.

## 5. Strategic Thinking for Marketing/Creative Work

Don't just list features. Think about:
- **Differentiators** — What does this product do that nothing else does? Lead with those.
- **Visual demos over descriptions** — Show mock outputs, example comparisons. A visual demo is worth 10x a paragraph.
- **Page hierarchy** — Primary features get large 2-column cards. Secondary features get compact 3-column grid. Don't give everything equal visual weight.
- **Copy that sells** — Headlines should make the reader feel something.

## 6. Conductor Pattern for 5+ File Tasks

Use the full conductor loop when touching 5+ files:
1. **Decompose** into independent work units (no shared files)
2. **Brief** each agent with the full design system context (see #2)
3. **Dispatch** all independent agents simultaneously
4. **Review** every output (see #3)
5. **Wire** the results into page composition yourself
6. **Build-check** the integrated result (see #4)

The conductor (you) handles integration. Agents handle isolated components.

## 7. Stay In the Project

**All work product goes in the project repo.** Plans go in `docs/tasks/*/PLAN.md`, not in system directories. Never scatter project artifacts across the filesystem.

## 8. Keep the Working Tree Clean

**Don't let unrelated changes pile up.** Every feature/concern gets its own commit. One concern per commit. Stage specific files, not `git add -A`. Audit `git status` between tasks.

## 9. Signup / Registration Forms

**ALWAYS use separate First Name and Last Name fields.** Never use a single "Full Name" input with string splitting.
