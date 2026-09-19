import { z } from "zod";
import { loadPacket, appendQuestion, loadQuestions, answerQuestion } from "../storage.js";

export const checkQuestionsParams = z.object({
  cwd: z.string().describe("The working directory of the project"),
  action: z.enum(["post", "read", "answer"]).describe("post = ask a question, read = see all questions, answer = respond to a question"),
  question: z.string().optional().describe("The question to post (required when action is 'post')"),
  session_id: z.string().optional().describe("Filter to a specific session (optional, defaults to latest packet)"),
  question_id: z.string().optional().describe("UUID of the question to answer (required when action is 'answer')"),
  answer: z.string().optional().describe("The answer to the question (required when action is 'answer')"),
});

export async function executeCheckQuestions(args: z.infer<typeof checkQuestionsParams>): Promise<string> {
  // Validate required fields per action
  if (args.action === "post" && !args.question) {
    return "Error: 'question' is required when action is 'post'.";
  }
  if (args.action === "answer" && (!args.question_id || !args.answer)) {
    return "Error: 'question_id' and 'answer' are required when action is 'answer'.";
  }

  // All actions require an active handoff packet
  const packetResult = loadPacket(args.cwd);
  if (packetResult.status === "missing") {
    return `No active handoff for ${args.cwd}. Post relief before posting questions.`;
  }
  if (packetResult.status === "corrupt") {
    return `Handoff file for ${args.cwd} is corrupt (${packetResult.error}). Cannot manage questions.`;
  }

  const sessionId = packetResult.packet.metadata.session_id;

  switch (args.action) {
    case "post": {
      const questionId = appendQuestion(args.cwd, sessionId, args.question!);
      return `Question posted (ID: ${questionId}). The other session can see it by calling check_questions with action "read".`;
    }

    case "read": {
      const targetSession = args.session_id ?? sessionId;
      const questions = loadQuestions(args.cwd, targetSession);

      if (questions.length === 0) {
        return `No questions for this session.`;
      }

      let output = `## Questions (${questions.length})\n\n`;
      for (const q of questions) {
        const status = q.answer ? `**Answered** (${q.answered_at})` : "**Unanswered**";
        output += `### [${q.id}] ${status}\n`;
        output += `**Q:** ${q.question}\n`;
        if (q.answer) {
          output += `**A:** ${q.answer}\n`;
        }
        output += "\n";
      }
      return output;
    }

    case "answer": {
      try {
        answerQuestion(args.cwd, args.question_id!, args.answer!);
        return `Answer posted for question ${args.question_id}.`;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }
  }
}
