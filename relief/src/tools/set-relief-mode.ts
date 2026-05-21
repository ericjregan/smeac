import { z } from "zod";
import { ReliefModeSchema } from "../schema.js";
import { setReliefMode } from "../storage.js";

export const setReliefModeParams = z.object({
  session_id: z.string().describe("The registered broker session ID"),
  mode: ReliefModeSchema.describe("manual, suggest, auto, or full-auto"),
});

export async function executeSetReliefMode(args: z.infer<typeof setReliefModeParams>): Promise<string> {
  try {
    const workstream = setReliefMode(args.session_id, args.mode);
    return `Relief mode for ${workstream.key} is now ${workstream.relief_mode}. Ambiguous: ${workstream.ambiguous ? "yes" : "no"}.`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
