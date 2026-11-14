# /relief — Post Relief ("I Stand Relieved")

Hand off your current session context so a fresh session can continue your work.

## What To Do

1. **Gather context** from the current session:
   - Current git branch (`git branch --show-current`)
   - Files modified (`git status --short`)
   - Current task list (if using tasks, read them)
   - Recent decisions made during this session
   - Open questions or unresolved ambiguities
   - Operational context: which services are running, ports in use, env var *names* in play

2. **Structure as SMEAC** — map everything gathered to these five paragraphs:

   | Paragraph | What Goes Here |
   |-----------|---------------|
   | **Situation** | Branch, files touched, what's running, where things stand right now |
   | **Mission** | What's being accomplished and why — not just the task, but the reasoning |
   | **Execution** | What's done, what's next, the approach and why this approach was chosen |
   | **Admin/Logistics** | Env var names (NEVER values/secrets/tokens), services running, ports, dependencies, gotchas |
   | **Command/Signal** | Open questions, decisions the next session needs to make, how to verify the work |

3. **Call the `post_relief` MCP tool** with the structured content and the current working directory.

4. **Confirm to the user:** "Relief posted. Open a new terminal and run `/assume-watch` to continue."

## Rules

- **NEVER include secret values, tokens, API keys, or credentials** in any field. List env var *names* only (e.g., "DATABASE_URL is set" not "DATABASE_URL=postgres://...").
- **Be honest about what's incomplete.** The next session builds on your handoff — if you flag uncertainties, they can verify. If you hide them, they'll build on bad assumptions.
- **Preserve the WHY.** Code is the what. Your handoff is the why. The next session can read the code — what they can't recover is your reasoning.
