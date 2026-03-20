import { z } from "zod";
import { loadPacket, appendQuestion, loadQuestions, answerQuestion } from "../storage.js";

const PostAction = z.object({
  cwd: z.string().describe("The working directory of the project"),
  action: z.literal("post"),
  question: z.string().describe("The question to post"),
});

const ReadAction = z.object({
  cwd: z.string().describe("The working directory of the project"),
  action: z.literal("read"),
  session_id: z.string().optional().describe("Filter to a specific session (defaults to latest packet)"),
});

const AnswerAction = z.object({
  cwd: z.string().describe("The working directory of the project"),
  action: z.literal("answer"),
  question_id: z.string().describe("UUID of the question to answer"),
  answer: z.string().describe("The answer to the question"),
});

export const checkQuestionsParams = z.discriminatedUnion("action", [
  PostAction,
  ReadAction,
  AnswerAction,
]);

export async function executeCheckQuestions(args: z.infer<typeof checkQuestionsParams>): Promise<string> {
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
      const questionId = appendQuestion(args.cwd, sessionId, args.question);
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
        answerQuestion(args.cwd, args.question_id, args.answer);
        return `Answer posted for question ${args.question_id}.`;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }
  }
}
