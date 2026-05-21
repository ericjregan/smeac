import crypto from "node:crypto";
import { z } from "zod";
import { canonicalizeCwd, savePacket } from "../storage.js";
import type { HandoffPacket } from "../schema.js";

export const postReliefParams = z.object({
  cwd: z.string().describe("The working directory of the project"),
  situation: z.string().describe("Branch, files touched, what's running, where things stand"),
  mission: z.string().describe("What's being accomplished and why"),
  execution: z.string().describe("What's done, what's next, the approach and why this approach"),
  admin_logistics: z.string().describe("Env var names, services running, ports in use, gotchas (NEVER include secret values, tokens, or credentials)"),
  command_signal: z.string().describe("Open questions, decisions needed, how to verify the work, unresolved ambiguities"),
  branch: z.string().optional().describe("Git branch name (optional)"),
});

export async function executePostRelief(args: z.infer<typeof postReliefParams>): Promise<string> {
  const sessionId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const canonical = canonicalizeCwd(args.cwd);

  const packet: HandoffPacket = {
    metadata: {
      timestamp,
      cwd: canonical,
      branch: args.branch,
      session_id: sessionId,
    },
    situation: args.situation,
    mission: args.mission,
    execution: args.execution,
    admin_logistics: args.admin_logistics,
    command_signal: args.command_signal,
  };

  savePacket(args.cwd, packet);

  return `Relief posted. Packet saved for ${canonical} at ${timestamp}. Session ID: ${sessionId}. The next session can run assume_watch to continue.`;
}
