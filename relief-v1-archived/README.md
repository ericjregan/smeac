# Relief

> **General Order #6:** *"To receive, obey, and pass on to the sentry who relieves me, all orders from the Commanding Officer, Command Duty Officer, Officer of the Deck, and Officers and Petty Officers of the Watch only."*

An MCP server for Claude Code session-to-session handoff. When one session is degrading — losing coherence, forgetting decisions, getting slow — it posts relief. A fresh session assumes the watch with full context: what was being done, why, what's decided, what's next, and what's unresolved.

Two guards. One post. The mission doesn't stop because a shift ends.

---

## The Problem

Claude Code sessions have a context window. It fills up. When it fills up, everything the session understood — every tradeoff weighed, every decision made, every edge case noticed but not yet addressed — is gone. The developer manually reconstructs that understanding in a new session. That reconstruction is lossy, slow, and error-prone.

The relay is only as strong as the worst handoff in the chain.

---

## How It Works

```
Session A (degrading)          Relief Server           Session B (fresh)
        |                          |                          |
        |--- "I stand relieved" -->|                          |
        |    (post_relief)         |                          |
        |                          |<-- "I have the watch" ---|
        |                          |    (assume_watch)        |
        |                          |                          |
        |                          |<-- "Question for A" ----|
        |                          |    (check_questions)     |
```

1. Session A feels the degradation. You say "hand off" or `/relief`.
2. Session A writes its full context to the MCP broker — structured as a SMEAC order.
3. You open a new terminal, start Claude Code.
4. Session B pulls the handoff, states back what it understands, and continues.
5. If Session B has questions and Session A is still alive, they communicate through the broker.

---

## The Handoff Packet (SMEAC Format)

Every handoff follows the five-paragraph order:

| Paragraph | Field | Contents |
|-----------|-------|----------|
| **Situation** | Current state | Branch, files touched, what's running, where things stand |
| **Mission** | Task objective | What's being accomplished and why — not just the what, but the reasoning |
| **Execution** | Progress + plan | What's done, what's next, the approach and why this approach |
| **Admin/Logistics** | Dependencies | Env vars, services running, ports in use, gotchas, things that'll bite you |
| **Command/Signal** | Open questions | Decisions needed, how to verify the work, unresolved ambiguities |

---

## MCP Tools

| Tool | Marine Equivalent | What It Does |
|------|------------------|-------------|
| `post_relief` | "I stand relieved" | Push current session context to the broker |
| `assume_watch` | "I have the watch" | Pull the latest handoff for this working directory |
| `check_questions` | Radio check | Read/post questions between sessions |

---

## The Standard

If the session after you has to ask the developer *"what was the previous session doing?"* — you failed your handoff.

If the session after you builds on a flawed assumption you could have flagged — you failed your handoff.

If the session after you wastes its first 20% re-discovering what you already knew — you failed your handoff.

---

## Installation

### Prerequisites
- Node.js >= 18

### Build

```bash
cd smeac/relief
npm install
npm run build
```

### Register MCP Server

Add to `~/.mcp.json`:

```json
{
  "mcpServers": {
    "relief": {
      "command": "node",
      "args": ["/absolute/path/to/smeac/relief/dist/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/smeac` with your actual path.

### Install Slash Commands

```bash
cp relief/commands/relief.md ~/.claude/commands/relief.md
cp relief/commands/assume-watch.md ~/.claude/commands/assume-watch.md
```

Restart Claude Code to pick up the changes.

### Usage

**Session A (degrading):**
```
/relief
```
Claude gathers your session context, structures it as a SMEAC order, and posts it.

**Session B (fresh terminal):**
```
/assume-watch
```
Claude pulls the handoff, reads it back to you, and says "I have the watch."

---

## Status

**Built.** MCP server operational. 10/10 integration tests passing.
