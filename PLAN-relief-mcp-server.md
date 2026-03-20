# Plan: Relief MCP Server

## Context

SMEAC repo at `~/smeac/`. Relief is a session-to-session handoff broker for Claude Code — an MCP server that lets one degrading session pass its full context to a fresh session. Architecture defined in `relief/README.md`. Named after General Order #6.

- Node.js v24.12.0, npm available
- FastMCP v3.34.0 on npm (TypeScript MCP framework)
- Existing MCP servers in `~/.mcp.json` use stdio pattern
- Persistence: JSON files at `~/.claude/relief/`, keyed by canonical cwd hash

## Objective

Build a local Node.js MCP server with three tools (`post_relief`, `assume_watch`, `check_questions`) that persists handoff packets to disk in SMEAC format.

## Scope

- Node.js MCP server (stdio transport)
- 3 tools with Zod-validated input schemas
- JSON file persistence at `~/.claude/relief/`
- `/relief` and `/assume-watch` slash commands for Claude Code
- Installation docs + `~/.mcp.json` entry

## Out of Scope

- Cross-project communication
- Build graph / session orchestration
- Web UI or remote deployment
- Real-time WebSocket between sessions
- Automated testing framework (test script only)

## Micro-Tasks

### Task 1: Initialize Node.js project
- Create `relief/package.json`: name `@smeac/relief`, version `1.0.0`, type `module`, main `dist/index.js`, scripts: `build` (tsc), `start` (node dist/index.js)
- Create `relief/tsconfig.json`: target ES2022, module NodeNext, moduleResolution NodeNext, outDir dist, rootDir src, strict true, esModuleInterop true
- Create `relief/.gitignore`: `node_modules/`, `dist/`
- **Verify:** Files exist, valid JSON

### Task 2: Install dependencies + verify FastMCP API
- Check FastMCP docs/README for current API (tool registration, Zod schemas, stdio transport)
- If FastMCP supports it: `npm install fastmcp zod`
- If not: `npm install @modelcontextprotocol/sdk zod` (direct SDK)
- Install dev deps: `npm install -D typescript @types/node`
- **Verify:** `npx tsc --version` works, chosen framework importable
- **Fallback:** Raw `@modelcontextprotocol/sdk` if FastMCP API doesn't fit

### Task 3: Define the SMEAC handoff packet schema
- Create `relief/src/schema.ts`
- Zod schemas:
  ```
  HandoffPacket {
    metadata: {
      timestamp: string (ISO 8601)
      cwd: string (canonical, resolved via realpath)
      branch: string (optional)
      session_id: string (auto-generated UUID)
    }
    situation: string     // Branch, files touched, what's running, where things stand
    mission: string       // What's being accomplished and why
    execution: string     // What's done, what's next, the approach
    admin_logistics: string // Env var names and operational context (NEVER secret values)
    command_signal: string  // Open questions, decisions needed, verification
  }

  // JSONL event union — discriminated on `type`
  QuestionPosted {
    type: "question_posted"
    id: string (UUID)
    packet_session_id: string (links question to the specific handoff packet)
    timestamp: string
    question: string
  }

  QuestionAnswered {
    type: "question_answered"
    question_id: string (references QuestionPosted.id)
    timestamp: string
    answer: string
  }

  // QuestionEvent = QuestionPosted | QuestionAnswered (Zod discriminated union on `type`)
  // Materialized view on read: merge QuestionPosted + QuestionAnswered by id → produces:
  //   { id, packet_session_id, timestamp, question, answer: string | null, answered_at: string | null }
  ```
- Export TypeScript types via `z.infer<>`
- **Verify:** `npx tsc --noEmit` passes

### Task 4: Create the persistence layer
- Create `relief/src/storage.ts`
- `canonicalizeCwd(cwd: string): string` — resolve via `path.resolve()` then `fs.realpathSync()` (catch ENOENT, fall back to resolved path). This ensures symlinks, trailing slashes, and `.`/`..` all map to the same canonical path.
- `cwdToKey(cwd: string): string` — take canonical path, compute `crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16)`. Prefix with the last directory name for readability: `<dirname>-<shortHash>`. Collision-resistant and canonical.
- `ensureDir()` — create `~/.claude/relief/` if missing
- `savePacket(cwd, packet)` — write to `~/.claude/relief/<key>.json` using atomic write (write to `.tmp` with unique suffix, rename). Validate packet against Zod schema before writing.
- `loadPacket(cwd): LoadResult` — read and parse. Return type is a discriminated union:
  - `{ status: "ok", packet: HandoffPacket }` — valid packet loaded
  - `{ status: "missing" }` — no file exists for this cwd
  - `{ status: "corrupt", path: string, error: string }` — file exists but JSON parse or Zod validation failed
  Validate against Zod schema on load. Callers pattern-match on `status` — no ad hoc narrowing.
- `appendQuestion(cwd, sessionId, question)` — append a `QuestionPosted` event to `~/.claude/relief/<key>-questions.jsonl` (JSON Lines format, one event per line). No read-modify-write — just append. Generates UUID for the question ID. Returns the generated UUID.
- `loadQuestions(cwd, sessionId?): MaterializedQuestion[]` — read JSONL file, parse each line (validate against `QuestionEvent` discriminated union), filter `QuestionPosted` events by `packet_session_id` if provided. Merge with `QuestionAnswered` events by `question_id` to produce materialized view: `{ id, packet_session_id, timestamp, question, answer: string | null, answered_at: string | null }`. If file missing: return empty array. If any line fails parse: skip it and continue (log warning to stderr). This isolates corruption to individual records.
- `answerQuestion(cwd, questionId, answer)` — first load and verify the question exists in the JSONL (by scanning for a `QuestionPosted` event with matching `id`). If not found: throw with "Question [id] not found." If found: append a `QuestionAnswered` event. Re-answering is last-write-wins (the materialized view uses the latest `QuestionAnswered` event for a given `question_id`).
- `cleanOrphanedTmpFiles()` — on server start, remove any `.tmp` files in `~/.claude/relief/` older than 60 seconds
- **Error model:**
  - `loadPacket` missing file → `{ status: "missing" }`; `loadQuestions` missing file → empty array (both normal)
  - `loadPacket` corrupt JSON / Zod validation failure → `{ status: "corrupt", path, error }`; `loadQuestions` corrupt line → skip + warn to stderr
  - Write failure (ENOSPC, EACCES) → throw with clear message, let MCP tool return error to caller
- **Verify:** `npx tsc --noEmit` passes

### Task 5: Implement `post_relief` tool
- Create `relief/src/tools/post-relief.ts`
- Export a function/object that defines the MCP tool
- Input schema (Zod):
  - `cwd`: string, required — "The working directory of the project"
  - `situation`: string, required
  - `mission`: string, required
  - `execution`: string, required
  - `admin_logistics`: string, required
  - `command_signal`: string, required
  - `branch`: string, optional
- Behavior: construct HandoffPacket with auto-generated metadata (canonicalize cwd, generate session_id UUID), call savePacket. When a new packet is posted, the old questions JSONL file is NOT deleted — questions are scoped by `packet_session_id`, so stale questions are naturally filtered out on read.
- Return: "Relief posted. Packet saved for [cwd] at [timestamp]. Session ID: [session_id]. The next session can run assume_watch to continue."
- **Verify:** `npx tsc --noEmit` passes

### Task 6: Implement `assume_watch` tool
- Create `relief/src/tools/assume-watch.ts`
- Input schema: `cwd` (string, required)
- Behavior: call loadPacket(cwd), pattern-match on `status`:
  - `ok`: return formatted SMEAC content with all 5 paragraphs + metadata. Also return any unanswered questions scoped to this packet's `session_id`.
  - `corrupt`: return clear error message: "Handoff file for [cwd] exists but is corrupt ([error]). The previous session may need to re-post relief."
  - `missing`: return "No handoff available for [cwd]. No previous session has posted relief for this directory."
- **Verify:** `npx tsc --noEmit` passes

### Task 7: Implement `check_questions` tool
- Create `relief/src/tools/check-questions.ts`
- Input schema — use a Zod discriminated union on `action`:
  - **Post variant:** `{ cwd: string, action: "post", question: string }`
  - **Read variant:** `{ cwd: string, action: "read", session_id?: string }` (if session_id omitted, reads questions for the latest packet)
  - **Answer variant:** `{ cwd: string, action: "answer", question_id: string, answer: string }`
  - Use `z.discriminatedUnion("action", [...])` to enforce required/forbidden fields per action at the schema level, not via runtime checks.
- Behavior:
  - `post`: look up the current packet's `session_id` for this cwd, call `appendQuestion(cwd, sessionId, question)`, return confirmation with the generated question UUID
  - `read`: call `loadQuestions(cwd, sessionId)`, return all with answers (or "unanswered" marker). Filter to current packet's session by default.
  - `answer`: call `answerQuestion(cwd, questionId, answer)`, return confirmation
  - If no packet exists for the cwd: return error "No active handoff for [cwd]. Post relief before posting questions."
- **Verify:** `npx tsc --noEmit` passes

### Task 8: Wire up the MCP server entry point
- Create `relief/src/index.ts`
- Import MCP framework (FastMCP or SDK)
- Create server with name "relief", description "Session-to-session handoff broker for Claude Code (General Order #6)"
- Register post_relief, assume_watch, check_questions tools
- Start with stdio transport
- **Verify:** `npx tsc --noEmit` passes, `npm run build` produces `dist/index.js`

### Task 9: Build and integration test
- Run `npm run build` — zero errors
- Create `relief/test.sh`:
  - **Happy path:**
    - Send MCP initialize handshake to the server
    - Call post_relief with test data
    - Call assume_watch, verify packet matches
    - Call check_questions post, then read, verify question appears (scoped to session)
    - Call check_questions answer, then read, verify answer present
  - **Key canonicalization:**
    - Post relief with cwd `/tmp/test-relief/` (trailing slash)
    - Assume watch with cwd `/tmp/test-relief` (no trailing slash)
    - Verify same packet returned (proves canonical key works)
  - **Packet replacement + question scoping:**
    - Post relief for a cwd, post a question
    - Post relief again for the same cwd (new session_id)
    - Read questions — verify old question is NOT returned (scoped to new session)
  - **Missing handoff:**
    - Call assume_watch for a cwd with no packet — verify "no handoff" message
    - Call check_questions post for a cwd with no packet — verify error
  - **Corrupt data:**
    - Write invalid JSON to a `<key>.json` file manually
    - Call assume_watch — verify clear error message, no crash
  - Clean up test files from `~/.claude/relief/`
- Run test.sh — all checks pass
- **Verify:** Server starts, responds to protocol, all test cases pass

### Task 10: Create `/relief` slash command
- Create `relief/commands/relief.md`
- Instructions for Claude:
  1. Gather context: current branch, files modified (git status), task list, recent decisions, open questions, operational context (which services are running, ports in use, env var names — NEVER secret values, tokens, or credentials)
  2. Structure as SMEAC: map gathered context to the 5 paragraphs. Admin/Logistics should list env var names and service details, never secret values.
  3. Call the `post_relief` MCP tool with the structured content + cwd
  4. Confirm to the user: "Relief posted. Open a new terminal and start Claude Code to continue."
- **Verify:** Command file is clear, complete, actionable

### Task 11: Create `/assume-watch` slash command
- Create `relief/commands/assume-watch.md`
- Instructions for Claude:
  1. Call the `assume_watch` MCP tool with the current working directory
  2. If a handoff exists: read the full SMEAC packet, state back to the user what you understand — summarize each paragraph, highlight open questions and unresolved items
  3. Check for any unanswered questions from the previous session. If present, try to answer them from the handoff context or flag them for the user.
  4. Ask the user: "I have the watch. Ready to continue, or do you want to clarify anything first?"
  5. If no handoff exists: tell the user "No handoff available for this directory."
- **Verify:** Command file is clear, complete, actionable

### Task 12: Update documentation and installation
- Update `relief/README.md`:
  - Add Prerequisites section (Node.js >= 18)
  - Add Installation section: `cd smeac/relief && npm install && npm run build`
  - Add MCP registration: example `~/.mcp.json` entry
  - Add command setup: copy `relief/commands/relief.md` and `relief/commands/assume-watch.md` to `~/.claude/commands/`
  - Update Status from "Planning" to "Built"
- Update `smeac/README.md`: change Relief status from "Planning" to "Built"
- **Verify:** A new user can follow the docs end-to-end

## Success Criteria

- [ ] `npm run build` produces zero TypeScript errors
- [ ] Server starts and responds to MCP initialize handshake
- [ ] `post_relief` writes a valid SMEAC JSON packet to `~/.claude/relief/`
- [ ] `assume_watch` reads it back with full fidelity
- [ ] `check_questions` supports post → read → answer → read cycle
- [ ] `/relief` command is clear and triggers a structured handoff
- [ ] `/assume-watch` command pulls handoff, states back understanding, and prompts to continue
- [ ] Installation docs are complete for a new user
- [ ] No secrets or credentials persisted in handoff packets (best-effort: enforced by `/relief` slash command guidance, not server-side — the caller is always Claude, not an untrusted client)

## Audit Findings That Shaped This Plan

### Self-Audit (pre-convergence)
- **WARNING → Fixed:** Added atomic write pattern (write .tmp, rename) to Task 4
- **WARNING → Fixed:** Added FastMCP API verification sub-step to Task 2 with SDK fallback
- **WARNING → Fixed:** Tool descriptions include clear cwd parameter guidance
- **WARNING → Fixed:** Added concrete test script (test.sh) in Task 9
- **NIT → Fixed:** Command copies added to Task 12 installation steps
- **NIT → Accepted:** Using kebab-case filenames consistently (matches existing smeac conventions)

### Convergence Iteration 0 (Codex review)
- **BLOCKER → Fixed:** `sanitizeCwd()` was collision-prone (slash replacement). Replaced with `canonicalizeCwd()` using `realpath` + SHA-256 short hash for collision-resistant, canonical routing keys.
- **BLOCKER → Fixed:** Questions used read-modify-write on shared JSON with auto-increment IDs. Replaced with append-only JSONL format and UUID-based question IDs — no concurrent write conflicts.
- **WARNING → Fixed:** Questions were not scoped to a specific handoff packet. Added `packet_session_id` to QuestionEvent schema; questions filtered by session on read.
- **WARNING → Fixed:** No error handling for corrupt JSON, write failures, or orphaned temp files. Added explicit error model: corrupt → error result (not null), write failure → throw with message, orphaned `.tmp` cleanup on start.
- **WARNING → Fixed:** `check_questions` input schema used optional fields with implicit requirements. Replaced with `z.discriminatedUnion("action", [...])` for schema-level enforcement.
- **WARNING → Fixed:** "Zero personal data" success criterion conflicted with storing env details. Changed to "No secrets or credentials persisted" with explicit redaction rules in slash command.
- **WARNING → Fixed:** Test plan was happy-path only. Added negative-path tests: key canonicalization, packet replacement + question scoping, missing handoff, corrupt data.

### Convergence Iteration 1 (Codex review)
- **BLOCKER → Fixed:** QuestionEvent schema was a single shape but storage model needed two event types. Replaced with discriminated union: `QuestionPosted` + `QuestionAnswered`, with materialized view on read.
- **WARNING → Fixed:** `loadPacket` return type `HandoffPacket | null` conflicted with error model. Replaced with discriminated `LoadResult` type: `ok` / `missing` / `corrupt`.
- **WARNING → Downgraded to NIT:** "No secrets" enforcement only exists as client-side slash command guidance. Server-side detection would be fragile/false-positive-prone for a single-user local tool. Downgraded to "best-effort client behavior" in success criteria.
- **WARNING → Fixed:** `answerQuestion()` didn't validate question existence. Added existence check (scan JSONL for matching QuestionPosted event). Re-answer is last-write-wins.

## Residual Risk

- FastMCP's TypeScript API may need adjustment at implementation time (fallback: raw SDK)
- Question/answer flow requires both sessions alive simultaneously — by design, not a bug
- JSONL append is not atomic on all filesystems (partial line write on crash) — extremely low probability, and the read logic skips unparseable lines
