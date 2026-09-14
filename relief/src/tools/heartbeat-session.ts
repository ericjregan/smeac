import { z } from "zod";
import { heartbeatSession } from "../storage.js";

export const heartbeatSessionParams = z.object({
  session_id: z.string().describe("The registered broker session ID"),
});

export async function executeHeartbeatSession(args: z.infer<typeof heartbeatSessionParams>): Promise<string> {
  const session = heartbeatSession(args.session_id);
  return `Heartbeat recorded for ${session.session_id} at ${session.last_heartbeat_at}.`;
}
