import { z } from "zod";

// --- Handoff Packet (the SMEAC 5-paragraph order) ---

export const MetadataSchema = z.object({
  timestamp: z.string().describe("ISO 8601 timestamp"),
  cwd: z.string().describe("Canonical working directory (resolved via realpath)"),
  branch: z.string().optional().describe("Git branch name"),
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
