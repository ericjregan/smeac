import { z } from "zod";
import { ProtectedPhaseSchema } from "../schema.js";
import {
  completeProtectedPhase,
  emitCheckpoint,
  proposeCheckpoint,
  startProtectedPhase,
} from "../storage.js";

export const phaseControlParams = z.object({
  session_id: z.string().describe("The registered broker session ID"),
  action: z.enum(["start", "checkpoint", "complete", "propose_checkpoint"]).describe("Protected-phase control action"),
  phase: ProtectedPhaseSchema.exclude(["idle"]).optional().describe("Required for start and propose_checkpoint"),
  checkpoint_type: z.string().optional().describe("Checkpoint type for checkpoint/propose_checkpoint"),
  details: z.string().optional().describe("Optional checkpoint details"),
});

export async function executePhaseControl(args: z.infer<typeof phaseControlParams>): Promise<string> {
  try {
    switch (args.action) {
      case "start": {
        if (!args.phase) {
          return "Error: 'phase' is required when action is 'start'.";
        }
        const session = startProtectedPhase(args.session_id, args.phase);
        return `Protected phase ${session.active_phase} started for ${session.session_id}.`;
      }
      case "checkpoint": {
        if (!args.checkpoint_type) {
          return "Error: 'checkpoint_type' is required when action is 'checkpoint'.";
        }
        const result = emitCheckpoint(args.session_id, args.checkpoint_type, args.details);
        return result.approved
          ? `Approved checkpoint ${args.checkpoint_type} recorded. Auto-handoff may proceed if other gates are clear.`
          : `Checkpoint ${args.checkpoint_type} recorded, but it is not approved for automatic handoff.`;
      }
      case "propose_checkpoint": {
        if (!args.phase || !args.checkpoint_type) {
          return "Error: 'phase' and 'checkpoint_type' are required when action is 'propose_checkpoint'.";
        }
        const proposal = proposeCheckpoint(args.session_id, args.phase, args.checkpoint_type, args.details);
        return `Checkpoint proposed: ${proposal.phase}:${proposal.type}. Proposal ID: ${proposal.id}. Human approval required before it can unlock auto-handoff.`;
      }
      case "complete": {
        const session = completeProtectedPhase(args.session_id);
        return `Protected phase complete for ${session.session_id}. Session is now idle.`;
      }
    }
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
