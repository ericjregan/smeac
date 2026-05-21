import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import {
  HandoffPacketSchema,
  QuestionEventSchema,
  type HandoffPacket,
  type LoadResult,
  type MaterializedQuestion,
  type QuestionPosted,
  type QuestionAnswered,
} from "./schema.js";

const RELIEF_DIR = path.join(os.homedir(), ".claude", "relief");

/**
 * Resolve cwd to a canonical absolute path.
 * Uses realpath to resolve symlinks; falls back to path.resolve on ENOENT.
 */
export function canonicalizeCwd(cwd: string): string {
  const resolved = path.resolve(cwd);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/**
 * Convert a canonical cwd to a filesystem-safe key.
 * Format: <dirname>-<sha256-short-hash>
 */
export function cwdToKey(cwd: string): string {
  const canonical = canonicalizeCwd(cwd);
  const hash = crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  const dirname = path.basename(canonical) || "root";
  return `${dirname}-${hash}`;
}

/** Ensure the relief storage directory exists. */
export function ensureDir(): void {
  fs.mkdirSync(RELIEF_DIR, { recursive: true });
}

function packetPath(key: string): string {
  return path.join(RELIEF_DIR, `${key}.json`);
}

function questionsPath(key: string): string {
  return path.join(RELIEF_DIR, `${key}-questions.jsonl`);
}

/**
 * Save a handoff packet using atomic write (write to .tmp, rename).
 * Validates against Zod schema before writing.
 */
export function savePacket(cwd: string, packet: HandoffPacket): void {
  ensureDir();
  HandoffPacketSchema.parse(packet); // validate before write
  const key = cwdToKey(cwd);
  const target = packetPath(key);
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(packet, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, target);
}

/**
 * Load a handoff packet. Returns a discriminated LoadResult.
 */
export function loadPacket(cwd: string): LoadResult {
  const key = cwdToKey(cwd);
  const target = packetPath(key);

  if (!fs.existsSync(target)) {
    return { status: "missing" };
  }

  try {
    const raw = fs.readFileSync(target, "utf-8");
    const parsed = JSON.parse(raw);
    const packet = HandoffPacketSchema.parse(parsed);
    return { status: "ok", packet };
  } catch (err) {
    return {
      status: "corrupt",
      path: target,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Append a QuestionPosted event to the JSONL file.
 * Returns the generated question UUID.
 */
export function appendQuestion(cwd: string, sessionId: string, question: string): string {
  ensureDir();
  const key = cwdToKey(cwd);
  const target = questionsPath(key);
  const id = crypto.randomUUID();

  const event: QuestionPosted = {
    type: "question_posted",
    id,
    packet_session_id: sessionId,
    timestamp: new Date().toISOString(),
    question,
  };

  fs.appendFileSync(target, JSON.stringify(event) + "\n", "utf-8");
  return id;
}

/**
 * Load questions from JSONL, optionally filtered by session_id.
 * Produces a materialized view by merging QuestionPosted + QuestionAnswered events.
 * Skips unparseable lines (logs warning to stderr).
 */
export function loadQuestions(cwd: string, sessionId?: string): MaterializedQuestion[] {
  const key = cwdToKey(cwd);
  const target = questionsPath(key);

  if (!fs.existsSync(target)) {
    return [];
  }

  const lines = fs.readFileSync(target, "utf-8").split("\n").filter((l) => l.trim());
  const questions = new Map<string, MaterializedQuestion>();
  const answers = new Map<string, QuestionAnswered>();

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const event = QuestionEventSchema.parse(parsed);

      if (event.type === "question_posted") {
        if (!sessionId || event.packet_session_id === sessionId) {
          questions.set(event.id, {
            id: event.id,
            packet_session_id: event.packet_session_id,
            timestamp: event.timestamp,
            question: event.question,
            answer: null,
            answered_at: null,
          });
        }
      } else if (event.type === "question_answered") {
        answers.set(event.question_id, event);
      }
    } catch {
      process.stderr.write(`[relief] Skipping unparseable question event: ${line.slice(0, 100)}\n`);
    }
  }

  // Merge answers into questions (last-write-wins for re-answers)
  for (const [questionId, answerEvent] of answers) {
    const q = questions.get(questionId);
    if (q) {
      q.answer = answerEvent.answer;
      q.answered_at = answerEvent.timestamp;
    }
  }

  return Array.from(questions.values());
}

/**
 * Answer a question by appending a QuestionAnswered event.
 * Validates that the question exists first.
 */
export function answerQuestion(cwd: string, questionId: string, answer: string): void {
  const key = cwdToKey(cwd);
  const target = questionsPath(key);

  if (!fs.existsSync(target)) {
    throw new Error(`Question ${questionId} not found. No questions file exists for this directory.`);
  }

  // Verify the question exists
  const lines = fs.readFileSync(target, "utf-8").split("\n").filter((l) => l.trim());
  let found = false;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "question_posted" && parsed.id === questionId) {
        found = true;
        break;
      }
    } catch {
      // skip unparseable lines
    }
  }

  if (!found) {
    throw new Error(`Question ${questionId} not found.`);
  }

  const event: QuestionAnswered = {
    type: "question_answered",
    question_id: questionId,
    timestamp: new Date().toISOString(),
    answer,
  };

  fs.appendFileSync(target, JSON.stringify(event) + "\n", "utf-8");
}

/**
 * Remove orphaned .tmp files older than 60 seconds.
 * Called on server start.
 */
export function cleanOrphanedTmpFiles(): void {
  try {
    if (!fs.existsSync(RELIEF_DIR)) return;
    const files = fs.readdirSync(RELIEF_DIR);
    const now = Date.now();

    for (const file of files) {
      if (file.endsWith(".tmp")) {
        const fullPath = path.join(RELIEF_DIR, file);
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > 60_000) {
          fs.unlinkSync(fullPath);
        }
      }
    }
  } catch {
    // best-effort cleanup, don't crash on failure
  }
}
