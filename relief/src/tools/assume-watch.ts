import { z } from "zod";
import { loadPacket, loadQuestions, setWorkstreamOwner } from "../storage.js";

export const assumeWatchParams = z.object({
  cwd: z.string().describe("The working directory of the project"),
  session_id: z.string().optional().describe("Optional registered broker session ID that is assuming the watch"),
});

export async function executeAssumeWatch(args: z.infer<typeof assumeWatchParams>): Promise<string> {
  const result = loadPacket(args.cwd);

  switch (result.status) {
    case "missing":
      return `No handoff available for ${args.cwd}. No previous session has posted relief for this directory.`;

    case "corrupt":
      return `Handoff file for ${args.cwd} exists but is corrupt (${result.error}). File: ${result.path}. The previous session may need to re-post relief.`;

    case "ok": {
      const { packet } = result;
      if (args.session_id && packet.metadata.workstream_key) {
        try {
          setWorkstreamOwner(args.session_id);
        } catch {
          // keep assume_watch usable even when broker state is not initialized
        }
      }
      const questions = loadQuestions(args.cwd, packet.metadata.session_id);
      const unanswered = questions.filter((q) => q.answer === null);

      let output = `# Handoff Received — I Have the Watch

## Metadata
- **Session ID:** ${packet.metadata.session_id}
- **Posted:** ${packet.metadata.timestamp}
- **Directory:** ${packet.metadata.cwd}
${packet.metadata.branch ? `- **Branch:** ${packet.metadata.branch}` : ""}

## SITUATION
${packet.situation}

## MISSION
${packet.mission}

## EXECUTION
${packet.execution}

## ADMIN/LOGISTICS
${packet.admin_logistics}

## COMMAND/SIGNAL
${packet.command_signal}`;

      if (unanswered.length > 0) {
        output += "\n\n## UNANSWERED QUESTIONS FROM PREVIOUS SESSION\n";
        for (const q of unanswered) {
          output += `- **[${q.id}]** ${q.question}\n`;
        }
      }

      return output;
    }
  }
}
