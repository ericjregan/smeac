import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import {
  BrokerMessageSchema,
  CheckpointDefinitionSchema,
  CheckpointProposalSchema,
  HandoffPacketSchema,
  QuestionEventSchema,
  SessionRecordSchema,
  TranscriptEntrySchema,
  WorkstreamRecordSchema,
  type BrokerMessage,
  type CheckpointDefinition,
  type CheckpointProposal,
  type HandoffPacket,
  type LoadResult,
  type MaterializedQuestion,
  type ProtectedPhase,
  type QuestionAnswered,
  type QuestionPosted,
  type ReliefMode,
  type SessionRecord,
  type TranscriptEntry,
  type WorkstreamRecord,
} from "./schema.js";

const RELIEF_DIR = path.join(os.homedir(), ".claude", "relief");
const WORKSTREAMS_DIR = path.join(RELIEF_DIR, "workstreams");
const RELIEF_PACKETS_DIR = path.join(RELIEF_DIR, "relief-packets");
const BROKER_STATE_FILE = path.join(RELIEF_DIR, "broker-state.json");
const SESSIONS_FILE = path.join(RELIEF_DIR, "sessions.json");
const WORKSTREAMS_FILE = path.join(RELIEF_DIR, "workstreams.json");
const CHECKPOINT_REGISTRY_FILE = path.join(RELIEF_DIR, "checkpoint-registry.json");
const CHECKPOINT_PROPOSALS_FILE = path.join(RELIEF_DIR, "checkpoint-proposals.jsonl");
const MESSAGES_FILE = path.join(RELIEF_DIR, "messages.jsonl");
const BROKER_LOCK_FILE = path.join(RELIEF_DIR, ".broker.lock");

const DEFAULT_TOOL = "claude";
const STALE_SESSION_MS = Number(process.env.RELIEF_STALE_SESSION_MS ?? 10 * 60 * 1000);
const LOCK_RETRY_MS = Number(process.env.RELIEF_LOCK_RETRY_MS ?? 50);
const LOCK_ATTEMPTS = Number(process.env.RELIEF_LOCK_ATTEMPTS ?? 100);
const JSONL_MAX_LINES = Number(process.env.RELIEF_JSONL_MAX_LINES ?? 2000);
const JSONL_KEEP_LINES = Number(process.env.RELIEF_JSONL_KEEP_LINES ?? 1000);

interface BrokerState {
  sessions: Record<string, SessionRecord>;
  workstreams: Record<string, WorkstreamRecord>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "root";
}

function workstreamStorageDir(key: string): string {
  return path.join(WORKSTREAMS_DIR, key);
}

function workstatePathForKey(key: string): string {
  return path.join(workstreamStorageDir(key), "WORKSTATE.md");
}

function transcriptPathForKey(key: string): string {
  return path.join(workstreamStorageDir(key), "transcript.jsonl");
}

function packetArchiveDirForKey(key: string): string {
  return path.join(RELIEF_PACKETS_DIR, key);
}

function brokerDirs(): void {
  fs.mkdirSync(RELIEF_DIR, { recursive: true });
  fs.mkdirSync(WORKSTREAMS_DIR, { recursive: true });
  fs.mkdirSync(RELIEF_PACKETS_DIR, { recursive: true });
}

function atomicWrite(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, content, "utf-8");
  fs.renameSync(tmp, filePath);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withBrokerLock<T>(fn: () => T): T {
  brokerDirs();
  let fd: number | null = null;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      fd = fs.openSync(BROKER_LOCK_FILE, "wx");
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw err;
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
  if (fd === null) {
    throw new Error(`Could not acquire relief broker lock after ${LOCK_ATTEMPTS} attempts.`);
  }

  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(BROKER_LOCK_FILE);
    } catch {
      // best effort
    }
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function parseSessionsMap(raw: Record<string, unknown>): Record<string, SessionRecord> {
  const sessions: Record<string, SessionRecord> = {};
  for (const [sessionId, value] of Object.entries(raw)) {
    sessions[sessionId] = SessionRecordSchema.parse(value);
  }
  return sessions;
}

function parseWorkstreamsMap(raw: Record<string, unknown>): Record<string, WorkstreamRecord> {
  const workstreams: Record<string, WorkstreamRecord> = {};
  for (const [key, value] of Object.entries(raw)) {
    workstreams[key] = WorkstreamRecordSchema.parse(value);
  }
  return workstreams;
}

function writeJsonFile(filePath: string, value: unknown): void {
  atomicWrite(filePath, JSON.stringify(value, null, 2) + "\n");
}

function rotateJsonlIfNeeded(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter((line) => line.trim());
  if (lines.length <= JSONL_MAX_LINES) {
    return;
  }
  const archiveLines = lines.slice(0, Math.max(0, lines.length - JSONL_KEEP_LINES));
  const keepLines = lines.slice(-JSONL_KEEP_LINES);
  if (archiveLines.length > 0) {
    const archivePath = `${filePath}.${new Date().toISOString().replace(/[:.]/g, "-")}.archive`;
    atomicWrite(archivePath, archiveLines.join("\n") + "\n");
  }
  atomicWrite(filePath, keepLines.join("\n") + "\n");
}

function appendJsonl(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(value) + "\n", "utf-8");
  rotateJsonlIfNeeded(filePath);
}

function parseJsonlFile<T>(
  filePath: string,
  parser: (value: unknown) => T,
  logLabel: string,
): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const output: T[] = [];
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      output.push(parser(JSON.parse(line)));
    } catch {
      process.stderr.write(`[relief] Skipping unparseable ${logLabel}: ${line.slice(0, 100)}\n`);
    }
  }
  return output;
}

function defaultCheckpointRegistry(): CheckpointDefinition[] {
  return [
    {
      phase: "design",
      type: "spec_draft_saved",
      description: "Spec draft saved and unresolved decisions captured",
      auto_handoff_eligible: true,
      system: true,
    },
    {
      phase: "plan",
      type: "plan_saved_self_audited",
      description: "Plan saved and self-audit complete",
      auto_handoff_eligible: true,
      system: true,
    },
    {
      phase: "build",
      type: "micro_task_closed",
      description: "Current micro-task closed, reconciliation updated, validation captured",
      auto_handoff_eligible: true,
      system: true,
    },
  ];
}

function ensureCheckpointRegistry(): void {
  brokerDirs();
  if (!fs.existsSync(CHECKPOINT_REGISTRY_FILE)) {
    writeJsonFile(CHECKPOINT_REGISTRY_FILE, defaultCheckpointRegistry());
  }
}

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
  brokerDirs();
  ensureCheckpointRegistry();
}

function packetPath(key: string): string {
  return path.join(RELIEF_DIR, `${key}.json`);
}

function archivePacketPath(workstreamKey: string, packet: HandoffPacket): string {
  const timestamp = packet.metadata.timestamp.replace(/[:.]/g, "-");
  return path.join(packetArchiveDirForKey(workstreamKey), `${timestamp}-${packet.metadata.session_id}.json`);
}

function questionsPath(key: string): string {
  return path.join(RELIEF_DIR, `${key}-questions.jsonl`);
}

function loadBrokerStateRaw(): BrokerState {
  ensureDir();
  if (fs.existsSync(BROKER_STATE_FILE)) {
    const raw = readJsonFile<{ sessions?: Record<string, unknown>; workstreams?: Record<string, unknown> }>(
      BROKER_STATE_FILE,
      {},
    );
    return {
      sessions: parseSessionsMap(raw.sessions ?? {}),
      workstreams: parseWorkstreamsMap(raw.workstreams ?? {}),
    };
  }

  const rawSessions = readJsonFile<Record<string, unknown>>(SESSIONS_FILE, {});
  const rawWorkstreams = readJsonFile<Record<string, unknown>>(WORKSTREAMS_FILE, {});
  return {
    sessions: parseSessionsMap(rawSessions),
    workstreams: parseWorkstreamsMap(rawWorkstreams),
  };
}

function persistBrokerState(sessions: Record<string, SessionRecord>, workstreams: Record<string, WorkstreamRecord>): void {
  writeJsonFile(BROKER_STATE_FILE, { sessions, workstreams });
  writeJsonFile(SESSIONS_FILE, sessions);
  writeJsonFile(WORKSTREAMS_FILE, workstreams);
}

function activeSessionIdsForWorkstream(
  workstream: WorkstreamRecord,
  sessions: Record<string, SessionRecord>,
): string[] {
  return workstream.session_ids.filter((sessionId) => {
    const session = sessions[sessionId];
    return session && session.status !== "closed";
  });
}

function recalculateUnnamedAmbiguity(
  repoRoot: string,
  branch: string,
  sessions: Record<string, SessionRecord>,
  workstreams: Record<string, WorkstreamRecord>,
): void {
  for (const workstream of Object.values(workstreams)) {
    if (workstream.repo_root === repoRoot && workstream.branch === branch && !workstream.workstream_name) {
      workstream.ambiguous = activeSessionIdsForWorkstream(workstream, sessions).length > 1;
      workstream.updated_at = nowIso();
    }
  }
}

function normalizeBrokerState(
  sessions: Record<string, SessionRecord>,
  workstreams: Record<string, WorkstreamRecord>,
): boolean {
  let changed = false;
  const now = Date.now();

  for (const session of Object.values(sessions)) {
    if (session.status === "closed") {
      continue;
    }
    const lastHeartbeat = Date.parse(session.last_heartbeat_at);
    if (!Number.isNaN(lastHeartbeat) && now - lastHeartbeat > STALE_SESSION_MS) {
      session.status = "closed";
      session.last_heartbeat_at = nowIso();
      changed = true;
    }
  }

  for (const workstream of Object.values(workstreams)) {
    const filteredIds = workstream.session_ids.filter((sessionId) => sessions[sessionId]);
    if (filteredIds.length !== workstream.session_ids.length) {
      workstream.session_ids = filteredIds;
      changed = true;
    }
    const activeIds = activeSessionIdsForWorkstream(workstream, sessions);
    if (workstream.owner_session_id && !activeIds.includes(workstream.owner_session_id)) {
      workstream.owner_session_id = activeIds[0] ?? null;
      changed = true;
    }
    if (workstream.successor_session_id && !activeIds.includes(workstream.successor_session_id)) {
      workstream.successor_session_id = null;
      changed = true;
    }
    const nextAmbiguous = !workstream.workstream_name && activeIds.length > 1;
    if (workstream.ambiguous !== nextAmbiguous) {
      workstream.ambiguous = nextAmbiguous;
      changed = true;
    }
  }

  const scopes = new Set(Object.values(workstreams).map((workstream) => `${workstream.repo_root}::${workstream.branch}`));
  for (const scope of scopes) {
    const [repoRoot, branch] = scope.split("::");
    recalculateUnnamedAmbiguity(repoRoot, branch, sessions, workstreams);
  }

  return changed;
}

function readBrokerState<T>(fn: (sessions: Record<string, SessionRecord>, workstreams: Record<string, WorkstreamRecord>) => T): T {
  return withBrokerLock(() => {
    const { sessions, workstreams } = loadBrokerStateRaw();
    const changed = normalizeBrokerState(sessions, workstreams);
    if (changed) {
      persistBrokerState(sessions, workstreams);
    }
    return fn(sessions, workstreams);
  });
}

function mutateBrokerState<T>(
  fn: (sessions: Record<string, SessionRecord>, workstreams: Record<string, WorkstreamRecord>) => T,
): T {
  return withBrokerLock(() => {
    const { sessions, workstreams } = loadBrokerStateRaw();
    normalizeBrokerState(sessions, workstreams);
    const result = fn(sessions, workstreams);
    normalizeBrokerState(sessions, workstreams);
    persistBrokerState(sessions, workstreams);
    return result;
  });
}

function requireSessionFromState(
  sessionId: string,
  sessions: Record<string, SessionRecord>,
  workstreams: Record<string, WorkstreamRecord>,
): { session: SessionRecord; workstream: WorkstreamRecord } {
  const session = sessions[sessionId];
  if (!session) {
    throw new Error(`Unknown session ${sessionId}. Register the session first.`);
  }
  const workstream = workstreams[session.workstream_key];
  if (!workstream) {
    throw new Error(`Workstream ${session.workstream_key} is missing for session ${session.session_id}.`);
  }
  return { session, workstream };
}

export function loadSessionsMap(): Record<string, SessionRecord> {
  return readBrokerState((sessions) => ({ ...sessions }));
}

export function loadWorkstreamsMap(): Record<string, WorkstreamRecord> {
  return readBrokerState((_, workstreams) => ({ ...workstreams }));
}

export function getRepoContext(cwd: string): { repoRoot: string; branch: string } {
  const canonical = canonicalizeCwd(cwd);
  try {
    const repoRoot = execFileSync("git", ["-C", canonical, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    let branch = "";
    try {
      branch = execFileSync("git", ["-C", canonical, "symbolic-ref", "--quiet", "--short", "HEAD"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      branch = execFileSync("git", ["-C", canonical, "rev-parse", "--abbrev-ref", "HEAD"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    }
    if (!branch || branch === "HEAD") {
      branch = "detached";
    }
    return { repoRoot: canonicalizeCwd(repoRoot), branch };
  } catch {
    return { repoRoot: canonical, branch: "no-git" };
  }
}

export function makeWorkstreamKey(repoRoot: string, branch: string, workstreamName?: string): string {
  const identity = `${repoRoot}::${branch}::${workstreamName ?? ""}`;
  const hash = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 12);
  const repoPart = safeSlug(path.basename(repoRoot));
  const branchPart = safeSlug(branch);
  const namePart = workstreamName ? `-${safeSlug(workstreamName)}` : "";
  return `${repoPart}-${branchPart}${namePart}-${hash}`;
}

function ensureWorkstreamMaterialized(key: string): void {
  fs.mkdirSync(workstreamStorageDir(key), { recursive: true });
  const workstatePath = workstatePathForKey(key);
  if (!fs.existsSync(workstatePath)) {
    atomicWrite(
      workstatePath,
      "# WORKSTATE\n\n## Objective\nUnknown\n\n## Status\nNew workstream.\n\n## Open Questions\n- none\n",
    );
  }
  const transcriptPath = transcriptPathForKey(key);
  if (!fs.existsSync(transcriptPath)) {
    fs.closeSync(fs.openSync(transcriptPath, "a"));
  }
  fs.mkdirSync(packetArchiveDirForKey(key), { recursive: true });
}

export function loadCheckpointRegistry(): CheckpointDefinition[] {
  ensureCheckpointRegistry();
  const raw = readJsonFile<unknown[]>(CHECKPOINT_REGISTRY_FILE, []);
  return raw.map((entry) => CheckpointDefinitionSchema.parse(entry));
}

export function listCheckpointProposals(): CheckpointProposal[] {
  ensureDir();
  return parseJsonlFile(CHECKPOINT_PROPOSALS_FILE, (value) => CheckpointProposalSchema.parse(value), "checkpoint proposal");
}

export function findApprovedCheckpoint(phase: Exclude<ProtectedPhase, "idle">, type: string): CheckpointDefinition | null {
  return loadCheckpointRegistry().find((entry) => entry.phase === phase && entry.type === type) ?? null;
}

export function appendTranscriptEntry(
  workstreamKey: string,
  entry: Omit<TranscriptEntry, "id" | "timestamp" | "workstream_key"> &
    Partial<Pick<TranscriptEntry, "id" | "timestamp" | "workstream_key">>,
): TranscriptEntry {
  ensureDir();
  ensureWorkstreamMaterialized(workstreamKey);
  const normalized: TranscriptEntry = TranscriptEntrySchema.parse({
    id: entry.id ?? crypto.randomUUID(),
    workstream_key: workstreamKey,
    session_id: entry.session_id,
    category: entry.category,
    body: entry.body,
    timestamp: entry.timestamp ?? nowIso(),
  });
  appendJsonl(transcriptPathForKey(workstreamKey), normalized);
  return normalized;
}

export function listMessagesForSession(sessionId: string): BrokerMessage[] {
  ensureDir();
  return readBrokerState((sessions, workstreams) => {
    const { workstream } = requireSessionFromState(sessionId, sessions, workstreams);
    return parseJsonlFile(MESSAGES_FILE, (value) => BrokerMessageSchema.parse(value), "broker message").filter((message) => {
      if (message.workstream_key !== workstream.key) {
        return false;
      }
      return message.to_session_id === null || message.to_session_id === sessionId || message.from_session_id === sessionId;
    });
  });
}

export function postMessage(
  sessionId: string,
  type: BrokerMessage["type"],
  body: string,
  toSessionId?: string,
): BrokerMessage {
  ensureDir();
  const { session, workstream } = readBrokerState((sessions, workstreams) => {
    const resolved = requireSessionFromState(sessionId, sessions, workstreams);
    if (toSessionId && !resolved.workstream.session_ids.includes(toSessionId)) {
      throw new Error(`Target session ${toSessionId} is not part of workstream ${resolved.workstream.key}.`);
    }
    return resolved;
  });
  const message = BrokerMessageSchema.parse({
    id: crypto.randomUUID(),
    workstream_key: workstream.key,
    from_session_id: sessionId,
    to_session_id: toSessionId ?? null,
    type,
    body,
    timestamp: nowIso(),
  });
  appendJsonl(MESSAGES_FILE, message);
  appendTranscriptEntry(workstream.key, {
    session_id: sessionId,
    category: "message",
    body: `${type.toUpperCase()}: ${body}`,
  });
  return message;
}

export function registerSession(
  cwd: string,
  tool = DEFAULT_TOOL,
  workstreamName?: string,
  sessionId: string = crypto.randomUUID(),
): { session: SessionRecord; workstream: WorkstreamRecord } {
  ensureDir();
  const canonical = canonicalizeCwd(cwd);
  const { repoRoot, branch } = getRepoContext(canonical);
  const startedAt = nowIso();
  const result = mutateBrokerState((sessions, workstreams) => {
    const key = makeWorkstreamKey(repoRoot, branch, workstreamName);
    const existing = workstreams[key];
    const workstream: WorkstreamRecord =
      existing ??
      WorkstreamRecordSchema.parse({
        key,
        repo_root: repoRoot,
        branch,
        workstream_name: workstreamName,
        session_ids: [],
        owner_session_id: null,
        successor_session_id: null,
        ambiguous: false,
        relief_mode: "manual",
        queued_relief: false,
        queued_reason: null,
        created_at: startedAt,
        updated_at: startedAt,
      });

    if (!workstream.session_ids.includes(sessionId)) {
      workstream.session_ids.push(sessionId);
    }
    if (!workstream.owner_session_id) {
      workstream.owner_session_id = sessionId;
    }
    workstream.updated_at = startedAt;
    workstreams[key] = WorkstreamRecordSchema.parse(workstream);

    const session = SessionRecordSchema.parse({
      session_id: sessionId,
      cwd: canonical,
      repo_root: repoRoot,
      branch,
      tool,
      workstream_key: key,
      workstream_name: workstreamName,
      status: "active",
      started_at: startedAt,
      last_heartbeat_at: startedAt,
      active_phase: "idle",
      checkpoint_ready: false,
      last_checkpoint_type: null,
      last_checkpoint_at: null,
    });
    sessions[sessionId] = session;

    recalculateUnnamedAmbiguity(repoRoot, branch, sessions, workstreams);
    ensureWorkstreamMaterialized(key);
    return { session, workstream: workstreams[key] };
  });

  appendTranscriptEntry(result.workstream.key, {
    session_id: sessionId,
    category: "session_registered",
    body: `Registered ${tool} session ${sessionId} for ${canonical}.`,
  });
  return result;
}

export function heartbeatSession(sessionId: string): SessionRecord {
  return mutateBrokerState((sessions, workstreams) => {
    const { session } = requireSessionFromState(sessionId, sessions, workstreams);
    session.last_heartbeat_at = nowIso();
    sessions[sessionId] = SessionRecordSchema.parse(session);
    return sessions[sessionId];
  });
}

export function listWorkstreams(): WorkstreamRecord[] {
  return readBrokerState((_, workstreams) => Object.values(workstreams).sort((a, b) => a.key.localeCompare(b.key)));
}

export function getWorkstreamStatus(sessionId: string): {
  session: SessionRecord;
  workstream: WorkstreamRecord;
  workstatePath: string;
  transcriptPath: string;
  latestPacket: LoadResult;
} {
  return readBrokerState((sessions, workstreams) => {
    const { session, workstream } = requireSessionFromState(sessionId, sessions, workstreams);
    ensureWorkstreamMaterialized(workstream.key);
    return {
      session,
      workstream,
      workstatePath: workstatePathForKey(workstream.key),
      transcriptPath: transcriptPathForKey(workstream.key),
      latestPacket: loadPacket(session.cwd),
    };
  });
}

export function assignSessionToNamedWorkstream(sessionId: string, workstreamName: string): {
  session: SessionRecord;
  workstream: WorkstreamRecord;
  previousWorkstreamKey: string;
} {
  const result = mutateBrokerState((sessions, workstreams) => {
    const { session, workstream: previous } = requireSessionFromState(sessionId, sessions, workstreams);
    const key = makeWorkstreamKey(session.repo_root, session.branch, workstreamName);
    const timestamp = nowIso();

    previous.session_ids = previous.session_ids.filter((id) => id !== sessionId);
    if (previous.owner_session_id === sessionId) {
      previous.owner_session_id = previous.session_ids[0] ?? null;
    }
    if (previous.successor_session_id === sessionId) {
      previous.successor_session_id = null;
    }
    previous.updated_at = timestamp;

    const target =
      workstreams[key] ??
      WorkstreamRecordSchema.parse({
        key,
        repo_root: session.repo_root,
        branch: session.branch,
        workstream_name: workstreamName,
        session_ids: [],
        owner_session_id: null,
        successor_session_id: null,
        ambiguous: false,
        relief_mode: previous.relief_mode,
        queued_relief: false,
        queued_reason: null,
        created_at: timestamp,
        updated_at: timestamp,
      });
    if (!target.session_ids.includes(sessionId)) {
      target.session_ids.push(sessionId);
    }
    if (!target.owner_session_id) {
      target.owner_session_id = sessionId;
    }
    target.updated_at = timestamp;
    workstreams[key] = WorkstreamRecordSchema.parse(target);

    session.workstream_key = key;
    session.workstream_name = workstreamName;
    sessions[sessionId] = SessionRecordSchema.parse(session);

    recalculateUnnamedAmbiguity(session.repo_root, session.branch, sessions, workstreams);
    ensureWorkstreamMaterialized(key);
    return { session: sessions[sessionId], workstream: workstreams[key], previousWorkstreamKey: previous.key };
  });

  appendTranscriptEntry(result.workstream.key, {
    session_id: sessionId,
    category: "workstream_named",
    body: `Session ${sessionId} assigned to named workstream "${workstreamName}".`,
  });
  return result;
}

export function setReliefMode(sessionId: string, mode: ReliefMode): WorkstreamRecord {
  const result = mutateBrokerState((sessions, workstreams) => {
    const { session, workstream } = requireSessionFromState(sessionId, sessions, workstreams);
    if (workstream.ambiguous && (mode === "auto" || mode === "full-auto")) {
      throw new Error(
        `Workstream ${workstream.key} is ambiguous on ${workstream.repo_root} (${workstream.branch}). Name the workstream before enabling ${mode}.`,
      );
    }
    workstream.relief_mode = mode;
    workstream.updated_at = nowIso();
    workstreams[workstream.key] = WorkstreamRecordSchema.parse(workstream);
    return workstreams[workstream.key];
  });

  appendTranscriptEntry(result.key, {
    session_id: sessionId,
    category: "mode_changed",
    body: `Relief mode set to ${mode}.`,
  });
  return result;
}

export function startProtectedPhase(sessionId: string, phase: Exclude<ProtectedPhase, "idle">): SessionRecord {
  const session = mutateBrokerState((sessions, workstreams) => {
    const { session } = requireSessionFromState(sessionId, sessions, workstreams);
    session.active_phase = phase;
    session.checkpoint_ready = false;
    session.last_checkpoint_type = null;
    session.last_checkpoint_at = null;
    session.last_heartbeat_at = nowIso();
    sessions[sessionId] = SessionRecordSchema.parse(session);
    return sessions[sessionId];
  });

  appendTranscriptEntry(session.workstream_key, {
    session_id: sessionId,
    category: "phase_started",
    body: `Phase ${phase} started.`,
  });
  return session;
}

export function emitCheckpoint(
  sessionId: string,
  checkpointType: string,
  details?: string,
): { session: SessionRecord; approved: boolean; definition: CheckpointDefinition | null } {
  const result = mutateBrokerState((sessions, workstreams) => {
    const { session } = requireSessionFromState(sessionId, sessions, workstreams);
    if (session.active_phase === "idle") {
      throw new Error("Cannot emit a checkpoint when no protected phase is active.");
    }
    const definition = findApprovedCheckpoint(session.active_phase, checkpointType);
    const timestamp = nowIso();
    session.last_checkpoint_type = checkpointType;
    session.last_checkpoint_at = timestamp;
    session.checkpoint_ready = Boolean(definition?.auto_handoff_eligible);
    session.last_heartbeat_at = timestamp;
    sessions[sessionId] = SessionRecordSchema.parse(session);
    return { session: sessions[sessionId], approved: Boolean(definition?.auto_handoff_eligible), definition };
  });

  appendTranscriptEntry(result.session.workstream_key, {
    session_id: sessionId,
    category: "checkpoint_emitted",
    body: `${checkpointType}${details ? ` — ${details}` : ""}`,
  });
  return result;
}

export function proposeCheckpoint(
  sessionId: string,
  phase: Exclude<ProtectedPhase, "idle">,
  checkpointType: string,
  description?: string,
): CheckpointProposal {
  const proposal = CheckpointProposalSchema.parse({
    id: crypto.randomUUID(),
    phase,
    type: checkpointType,
    description,
    proposed_by_session_id: sessionId,
    timestamp: nowIso(),
  });
  appendJsonl(CHECKPOINT_PROPOSALS_FILE, proposal);

  const { session } = readBrokerState((sessions, workstreams) => requireSessionFromState(sessionId, sessions, workstreams));
  appendTranscriptEntry(session.workstream_key, {
    session_id: sessionId,
    category: "checkpoint_proposed",
    body: `${phase}:${checkpointType}${description ? ` — ${description}` : ""}`,
  });
  return proposal;
}

export function completeProtectedPhase(sessionId: string): SessionRecord {
  const result = mutateBrokerState((sessions, workstreams) => {
    const { session } = requireSessionFromState(sessionId, sessions, workstreams);
    const previous = session.active_phase;
    session.active_phase = "idle";
    session.checkpoint_ready = false;
    session.last_heartbeat_at = nowIso();
    sessions[sessionId] = SessionRecordSchema.parse(session);
    return { session: sessions[sessionId], previous };
  });

  appendTranscriptEntry(result.session.workstream_key, {
    session_id: sessionId,
    category: "phase_completed",
    body: `Phase ${result.previous} completed.`,
  });
  return result.session;
}

export function setWorkstreamOwner(sessionId: string): WorkstreamRecord {
  const result = mutateBrokerState((sessions, workstreams) => {
    const { workstream } = requireSessionFromState(sessionId, sessions, workstreams);
    workstream.owner_session_id = sessionId;
    workstream.successor_session_id = null;
    workstream.updated_at = nowIso();
    workstreams[workstream.key] = WorkstreamRecordSchema.parse(workstream);
    return workstreams[workstream.key];
  });

  appendTranscriptEntry(result.key, {
    session_id: sessionId,
    category: "watch_assumed",
    body: `Session ${sessionId} assumed the watch.`,
  });
  return result;
}

function evaluateHandoffEligibilityInState(
  sessionId: string,
  override: boolean,
  sessions: Record<string, SessionRecord>,
  workstreams: Record<string, WorkstreamRecord>,
): { allowed: boolean; reason: string; session: SessionRecord; workstream: WorkstreamRecord } {
  const { session, workstream } = requireSessionFromState(sessionId, sessions, workstreams);
  if (workstream.ambiguous) {
    return {
      allowed: false,
      reason: "Same repo+branch scope is ambiguous. Name the workstream before automatic handoff.",
      session,
      workstream,
    };
  }
  if (session.active_phase === "idle") {
    return { allowed: true, reason: "No protected phase is active.", session, workstream };
  }
  if (override) {
    return { allowed: true, reason: `Override enabled during ${session.active_phase}.`, session, workstream };
  }
  if (session.checkpoint_ready) {
    return {
      allowed: true,
      reason: `Approved checkpoint ${session.last_checkpoint_type ?? "unknown"} is active for ${session.active_phase}.`,
      session,
      workstream,
    };
  }
  return {
    allowed: false,
    reason: `Cannot hand off mid-${session.active_phase} before an approved checkpoint or explicit override.`,
    session,
    workstream,
  };
}

export function evaluateHandoffEligibility(
  sessionId: string,
  override = false,
): { allowed: boolean; reason: string; session: SessionRecord; workstream: WorkstreamRecord } {
  return readBrokerState((sessions, workstreams) => evaluateHandoffEligibilityInState(sessionId, override, sessions, workstreams));
}

export function writeWorkstate(sessionId: string, content: string): string {
  const { workstream } = readBrokerState((sessions, workstreams) => requireSessionFromState(sessionId, sessions, workstreams));
  ensureWorkstreamMaterialized(workstream.key);
  const target = workstatePathForKey(workstream.key);
  atomicWrite(target, content.endsWith("\n") ? content : `${content}\n`);
  appendTranscriptEntry(workstream.key, {
    session_id: sessionId,
    category: "workstate_updated",
    body: `WORKSTATE updated (${content.length} chars).`,
  });
  return target;
}

export function readWorkstate(sessionId: string): { path: string; content: string } {
  const { workstream } = readBrokerState((sessions, workstreams) => requireSessionFromState(sessionId, sessions, workstreams));
  ensureWorkstreamMaterialized(workstream.key);
  const target = workstatePathForKey(workstream.key);
  return { path: target, content: fs.readFileSync(target, "utf-8") };
}

export function isTmuxAvailable(): boolean {
  const result = spawnSync("/usr/bin/env", ["tmux", "-V"], { stdio: "ignore" });
  return result.status === 0;
}

export function spawnSuccessorSession(
  sessionId: string,
  toolCommand = DEFAULT_TOOL,
  override = false,
): { spawned: boolean; reason: string; workstream: WorkstreamRecord; session: SessionRecord } {
  const preflight = mutateBrokerState((sessions, workstreams) => {
    const eligibility = evaluateHandoffEligibilityInState(sessionId, override, sessions, workstreams);
    if (!eligibility.allowed) {
      eligibility.workstream.queued_relief = true;
      eligibility.workstream.queued_reason = eligibility.reason;
      eligibility.workstream.updated_at = nowIso();
    }
    return eligibility;
  });

  if (!preflight.allowed) {
    return { spawned: false, reason: preflight.reason, session: preflight.session, workstream: preflight.workstream };
  }
  if (!isTmuxAvailable()) {
    return { spawned: false, reason: "tmux is not available on this machine.", session: preflight.session, workstream: preflight.workstream };
  }

  const successorCommand = `cd ${shellEscape(preflight.session.cwd)} && ${toolCommand}`;
  const windowName = `relief-${safeSlug(preflight.workstream.workstream_name ?? path.basename(preflight.session.repo_root))}`.slice(0, 30);
  const result = spawnSync("tmux", ["new-window", "-n", windowName, "-c", preflight.session.cwd, successorCommand], {
    stdio: "ignore",
  });
  if (result.status !== 0) {
    return { spawned: false, reason: "tmux spawn failed.", session: preflight.session, workstream: preflight.workstream };
  }

  const updatedWorkstream = mutateBrokerState((sessions, workstreams) => {
    const { workstream } = requireSessionFromState(sessionId, sessions, workstreams);
    workstream.successor_session_id = null;
    workstream.queued_relief = false;
    workstream.queued_reason = null;
    workstream.updated_at = nowIso();
    workstreams[workstream.key] = WorkstreamRecordSchema.parse(workstream);
    return workstreams[workstream.key];
  });

  appendTranscriptEntry(updatedWorkstream.key, {
    session_id: sessionId,
    category: "successor_spawned",
    body: `Spawned successor terminal via tmux using command: ${toolCommand}`,
  });
  return { spawned: true, reason: "Successor session spawned via tmux.", session: preflight.session, workstream: updatedWorkstream };
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Save a handoff packet using atomic write (write to .tmp, rename).
 * Validates against Zod schema before writing.
 */
export function savePacket(cwd: string, packet: HandoffPacket): void {
  ensureDir();
  HandoffPacketSchema.parse(packet);
  const key = cwdToKey(cwd);
  const target = packetPath(key);
  atomicWrite(target, JSON.stringify(packet, null, 2) + "\n");

  const workstreamKey = packet.metadata.workstream_key;
  if (workstreamKey) {
    ensureWorkstreamMaterialized(workstreamKey);
    const archiveTarget = archivePacketPath(workstreamKey, packet);
    atomicWrite(archiveTarget, JSON.stringify(packet, null, 2) + "\n");
    appendTranscriptEntry(workstreamKey, {
      session_id: packet.metadata.session_id,
      category: "relief_posted",
      body: `Relief packet saved for ${packet.metadata.cwd}.`,
    });
  }
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
    timestamp: nowIso(),
    question,
  };

  appendJsonl(target, event);
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
  const questions = new Map<string, MaterializedQuestion>();
  const answers = new Map<string, QuestionAnswered>();

  for (const event of parseJsonlFile(target, (value) => QuestionEventSchema.parse(value), "question event")) {
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
  }

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
 * Validates that the question exists first, and optionally that it belongs
 * to the expected packet session.
 */
export function answerQuestion(cwd: string, questionId: string, answer: string, sessionId?: string): void {
  const key = cwdToKey(cwd);
  const target = questionsPath(key);

  if (!fs.existsSync(target)) {
    throw new Error(`Question ${questionId} not found. No questions file exists for this directory.`);
  }

  let found = false;
  let foundSessionId: string | null = null;
  for (const event of parseJsonlFile(target, (value) => QuestionEventSchema.parse(value), "question event")) {
    if (event.type === "question_posted" && event.id === questionId) {
      found = true;
      foundSessionId = event.packet_session_id;
      break;
    }
  }

  if (!found) {
    throw new Error(`Question ${questionId} not found.`);
  }
  if (sessionId && foundSessionId !== sessionId) {
    throw new Error(`Question ${questionId} does not belong to session ${sessionId}.`);
  }

  const event: QuestionAnswered = {
    type: "question_answered",
    question_id: questionId,
    timestamp: nowIso(),
    answer,
  };

  appendJsonl(target, event);
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
