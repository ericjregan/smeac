# /assume-watch — Assume the Watch ("I Have the Watch")

Pull the handoff from the previous session and continue the work.

## What To Do

1. **Call the `assume_watch` MCP tool** with the current working directory.

2. **If a handoff exists:**
   - Read the full SMEAC packet carefully.
   - State back to the user what you understand — summarize each paragraph in your own words.
   - Highlight open questions from the Command/Signal section.
   - If there are unanswered questions from the previous session, try to answer them from the handoff context. If you can't, flag them for the user.
   - Say: **"I have the watch. Ready to continue, or do you want to clarify anything first?"**

3. **If no handoff exists:**
   - Tell the user: "No handoff available for this directory. No previous session has posted relief."

## Rules

- **Don't trust blindly.** The previous session may have made mistakes. Verify critical assumptions before building on them.
- **Don't repeat work.** If the previous session solved something, use it. Read the Execution section before re-deriving conclusions.
- **Ask questions.** If something in the handoff is ambiguous, use the `check_questions` MCP tool to post a question. The user can flip to the other terminal to get it answered.
- **Be honest about your boundaries.** If the handoff is unclear on a point, say so — don't guess and build on the guess.
