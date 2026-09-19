import { z } from "zod";
import { listMessagesForSession, postMessage } from "../storage.js";
import { MessageTypeSchema } from "../schema.js";

export const relayMessageParams = z.object({
  session_id: z.string().describe("The registered broker session ID"),
  action: z.enum(["post", "read"]).describe("post = send a message, read = read available messages"),
  type: MessageTypeSchema.optional().describe("question, answer, or note; required when action is post"),
  body: z.string().optional().describe("Message body; required when action is post"),
  to_session_id: z.string().optional().describe("Optional target session within the same workstream"),
});

export async function executeRelayMessage(args: z.infer<typeof relayMessageParams>): Promise<string> {
  try {
    if (args.action === "post") {
      if (!args.type || !args.body) {
        return "Error: 'type' and 'body' are required when action is 'post'.";
      }
      const message = postMessage(args.session_id, args.type, args.body, args.to_session_id);
      return `Message posted (${message.id}) to ${message.to_session_id ?? "workstream"} as ${message.type}.`;
    }

    const messages = listMessagesForSession(args.session_id);
    if (messages.length === 0) {
      return "No messages for this session.";
    }
    return messages
      .map((message) => {
        return `[${message.timestamp}] ${message.type.toUpperCase()} ${message.from_session_id} -> ${message.to_session_id ?? "workstream"}\n${message.body}`;
      })
      .join("\n\n");
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
