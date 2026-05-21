import { z } from "zod";

// --- Handoff Packet (the SMEAC 5-paragraph order) ---

export const MetadataSchema = z.object({
  timestamp: z.string().describe("ISO 8601 timestamp"),
  cwd: z.string().describe("Canonical working directory (resolved via realpath)"),
  branch: z.string().optional().describe("Git branch name"),
  repo_root: z.string().optional().describe("Canonical git repository root when available"),
  workstream_key: z.string().optional().describe("Broker workstream key"),
  workstream_name: z.string().optional().describe("Optional human-assigned workstream name"),
  session_id: z.string().describe("Auto-generated UUID for this handoff session"),
});

export const HandoffPacketSchema = z.object({
  metadata: MetadataSchema,
  situation: z.string().describe("Branch, files touched, what's running, where things stand"),
  mission: z.string().describe("What's being accomplished and why"),
  execution: z.string().describe("What's done, what's next, the approach and why"),
  admin_logistics: z.string().describe("Env var names, services, ports, gotchas (NEVER secret values)"),
  command_signal: z.string().describe("Open questions, decisions needed, how to verify"),
});

export type Metadata = z.infer<typeof MetadataSchema>;
export type HandoffPacket = z.infer<typeof HandoffPacketSchema>;

// --- Relief Broker v2 ---

export const ReliefModeSchema = z.enum(["manual", "suggest", "auto", "full-auto"]);
export const ProtectedPhaseSchema = z.enum(["idle", "design", "plan", "build"]);
export const SessionStatusSchema = z.enum(["active", "standby", "closed"]);
export const MessageTypeSchema = z.enum(["question", "answer", "note"]);

export const SessionRecordSchema = z.object({
  session_id: z.string(),
  cwd: z.string(),
  repo_root: z.string(),
  branch: z.string(),
  tool: z.string(),
  workstream_key: z.string(),
  workstream_name: z.string().optional(),
  status: SessionStatusSchema,
  started_at: z.string(),
  last_heartbeat_at: z.string(),
  active_phase: ProtectedPhaseSchema,
  checkpoint_ready: z.boolean(),
  last_checkpoint_type: z.string().nullable(),
  last_checkpoint_at: z.string().nullable(),
});

export const WorkstreamRecordSchema = z.object({
  key: z.string(),
  repo_root: z.string(),
  branch: z.string(),
  workstream_name: z.string().optional(),
  session_ids: z.array(z.string()),
  owner_session_id: z.string().nullable(),
  successor_session_id: z.string().nullable(),
  ambiguous: z.boolean(),
  relief_mode: ReliefModeSchema,
  queued_relief: z.boolean(),
  queued_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const CheckpointDefinitionSchema = z.object({
  phase: ProtectedPhaseSchema.exclude(["idle"]),
  type: z.string(),
  description: z.string(),
  auto_handoff_eligible: z.boolean(),
  system: z.boolean().default(false),
});

export const CheckpointProposalSchema = z.object({
  id: z.string(),
  phase: ProtectedPhaseSchema.exclude(["idle"]),
  type: z.string(),
  description: z.string().optional(),
  proposed_by_session_id: z.string(),
  timestamp: z.string(),
});

export const BrokerMessageSchema = z.object({
  id: z.string(),
  workstream_key: z.string(),
  from_session_id: z.string(),
  to_session_id: z.string().nullable(),
  type: MessageTypeSchema,
  body: z.string(),
  timestamp: z.string(),
});

export const TranscriptEntrySchema = z.object({
  id: z.string(),
  workstream_key: z.string(),
  session_id: z.string().optional(),
  category: z.string(),
  body: z.string(),
  timestamp: z.string(),
});

export type ReliefMode = z.infer<typeof ReliefModeSchema>;
export type ProtectedPhase = z.infer<typeof ProtectedPhaseSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type WorkstreamRecord = z.infer<typeof WorkstreamRecordSchema>;
export type CheckpointDefinition = z.infer<typeof CheckpointDefinitionSchema>;
export type CheckpointProposal = z.infer<typeof CheckpointProposalSchema>;
export type BrokerMessage = z.infer<typeof BrokerMessageSchema>;
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

// --- Question Events (JSONL, discriminated on `type`) ---

export const QuestionPostedSchema = z.object({
  type: z.literal("question_posted"),
  id: z.string().describe("UUID for this question"),
  packet_session_id: z.string().describe("Links question to the specific handoff packet"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  question: z.string(),
});

export const QuestionAnsweredSchema = z.object({
  type: z.literal("question_answered"),
  question_id: z.string().describe("References QuestionPosted.id"),
  timestamp: z.string().describe("ISO 8601 timestamp"),
  answer: z.string(),
});

export const QuestionEventSchema = z.discriminatedUnion("type", [
  QuestionPostedSchema,
  QuestionAnsweredSchema,
]);

export type QuestionPosted = z.infer<typeof QuestionPostedSchema>;
export type QuestionAnswered = z.infer<typeof QuestionAnsweredSchema>;
export type QuestionEvent = z.infer<typeof QuestionEventSchema>;

// --- Materialized View (produced on read by merging events) ---

export interface MaterializedQuestion {
  id: string;
  packet_session_id: string;
  timestamp: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
}

// --- Load Result (discriminated union for loadPacket return) ---

export type LoadResult =
  | { status: "ok"; packet: HandoffPacket }
  | { status: "missing" }
  | { status: "corrupt"; path: string; error: string };
