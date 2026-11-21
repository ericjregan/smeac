import { z } from "zod";
import {
  assignSessionToNamedWorkstream,
  getWorkstreamStatus,
  listWorkstreams,
  readWorkstate,
  writeWorkstate,
} from "../storage.js";

export const workstreamControlParams = z.object({
  action: z.enum(["show", "set_name", "list", "read_workstate", "write_workstate"]).describe("Workstream control action"),
  session_id: z.string().optional().describe("The registered broker session ID"),
  workstream_name: z.string().optional().describe("Name to assign to the current session's workstream"),
  content: z.string().optional().describe("WORKSTATE content for write_workstate"),
});

export async function executeWorkstreamControl(args: z.infer<typeof workstreamControlParams>): Promise<string> {
  try {
    switch (args.action) {
      case "list": {
        const workstreams = listWorkstreams();
        if (workstreams.length === 0) {
          return "No workstreams registered.";
        }
        return workstreams
          .map((ws) => {
            return `${ws.key}
  repo: ${ws.repo_root}
  branch: ${ws.branch}
  name: ${ws.workstream_name ?? "(unnamed)"}
  ambiguous: ${ws.ambiguous ? "yes" : "no"}
  mode: ${ws.relief_mode}
  owner: ${ws.owner_session_id ?? "(none)"}`;
          })
          .join("\n");
      }
      case "show": {
        if (!args.session_id) {
          return "Error: 'session_id' is required when action is 'show'.";
        }
        const status = getWorkstreamStatus(args.session_id);
        return `Workstream: ${status.workstream.key}
Repo Root: ${status.workstream.repo_root}
Branch: ${status.workstream.branch}
Name: ${status.workstream.workstream_name ?? "(unnamed)"}
Ambiguous: ${status.workstream.ambiguous ? "yes" : "no"}
Mode: ${status.workstream.relief_mode}
Owner: ${status.workstream.owner_session_id ?? "(none)"}
Current Session: ${status.session.session_id}
Phase: ${status.session.active_phase}
Checkpoint Ready: ${status.session.checkpoint_ready ? "yes" : "no"}
WORKSTATE: ${status.workstatePath}
Transcript: ${status.transcriptPath}
Latest Packet: ${status.latestPacket.status}`;
      }
      case "set_name": {
        if (!args.session_id || !args.workstream_name) {
          return "Error: 'session_id' and 'workstream_name' are required when action is 'set_name'.";
        }
        const result = assignSessionToNamedWorkstream(args.session_id, args.workstream_name);
        return `Session ${result.session.session_id} moved to named workstream ${result.workstream.key} (${result.workstream.workstream_name}). Previous workstream: ${result.previousWorkstreamKey}.`;
      }
      case "read_workstate": {
        if (!args.session_id) {
          return "Error: 'session_id' is required when action is 'read_workstate'.";
        }
        const workstate = readWorkstate(args.session_id);
        return `WORKSTATE (${workstate.path})

${workstate.content}`;
      }
      case "write_workstate": {
        if (!args.session_id || !args.content) {
          return "Error: 'session_id' and 'content' are required when action is 'write_workstate'.";
        }
        const target = writeWorkstate(args.session_id, args.content);
        return `WORKSTATE updated at ${target}.`;
      }
    }
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
