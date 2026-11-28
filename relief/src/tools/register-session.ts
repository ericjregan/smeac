import crypto from "node:crypto";
import { z } from "zod";
import { getWorkstreamStatus, registerSession } from "../storage.js";

export const registerSessionParams = z.object({
  cwd: z.string().describe("The working directory for this terminal session"),
  tool: z.string().optional().describe("Tool running in the session, for example claude or codex"),
  workstream_name: z.string().optional().describe("Optional explicit workstream name"),
  session_id: z.string().optional().describe("Optional pre-generated session ID"),
});

export async function executeRegisterSession(args: z.infer<typeof registerSessionParams>): Promise<string> {
  const sessionId = args.session_id ?? crypto.randomUUID();
  const { session, workstream } = registerSession(args.cwd, args.tool, args.workstream_name, sessionId);
  const status = getWorkstreamStatus(session.session_id);

  return `Session registered.
Session ID: ${session.session_id}
Tool: ${session.tool}
Repo Root: ${session.repo_root}
Branch: ${session.branch}
Workstream Key: ${workstream.key}
Workstream Name: ${workstream.workstream_name ?? "(unnamed)"}
Ambiguous: ${workstream.ambiguous ? "yes" : "no"}
Relief Mode: ${workstream.relief_mode}
WORKSTATE: ${status.workstatePath}
Transcript: ${status.transcriptPath}
Latest Packet: ${status.latestPacket.status}`;
}
