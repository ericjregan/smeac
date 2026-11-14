import { z } from "zod";
import { evaluateHandoffEligibility, spawnSuccessorSession } from "../storage.js";

export const spawnSuccessorParams = z.object({
  session_id: z.string().describe("The registered broker session ID"),
  tool_command: z.string().optional().describe("Command to launch in tmux, defaults to claude"),
  override: z.boolean().optional().describe("Override protected-phase gating"),
  dry_run: z.boolean().optional().describe("Evaluate eligibility without spawning"),
});

export async function executeSpawnSuccessor(args: z.infer<typeof spawnSuccessorParams>): Promise<string> {
  try {
    if (args.dry_run) {
      const eligibility = evaluateHandoffEligibility(args.session_id, args.override ?? false);
      return eligibility.allowed
        ? `Handoff allowed. ${eligibility.reason}`
        : `Handoff blocked. ${eligibility.reason}`;
    }

    const result = spawnSuccessorSession(args.session_id, args.tool_command, args.override ?? false);
    return result.spawned
      ? `Successor spawned for ${result.workstream.key}. ${result.reason}`
      : `Successor not spawned for ${result.workstream.key}. ${result.reason}`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
