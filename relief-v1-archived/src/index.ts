import { FastMCP } from "fastmcp";
import { cleanOrphanedTmpFiles } from "./storage.js";
import { postReliefParams, executePostRelief } from "./tools/post-relief.js";
import { assumeWatchParams, executeAssumeWatch } from "./tools/assume-watch.js";
import { checkQuestionsParams, executeCheckQuestions } from "./tools/check-questions.js";

// Clean up any orphaned .tmp files from previous runs
cleanOrphanedTmpFiles();

const server = new FastMCP({
  name: "relief",
  version: "1.0.0",
});

server.addTool({
  name: "post_relief",
  description: 'Post relief — "I stand relieved." Push your current session context as a SMEAC handoff packet so a fresh session can continue your work.',
  parameters: postReliefParams,
  execute: async (args) => {
    return await executePostRelief(args);
  },
});

server.addTool({
  name: "assume_watch",
  description: 'Assume the watch — "I have the watch." Pull the latest handoff packet for this working directory and continue where the previous session left off.',
  parameters: assumeWatchParams,
  execute: async (args) => {
    return await executeAssumeWatch(args);
  },
});

server.addTool({
  name: "check_questions",
  description: "Radio check — post questions for the other session, read pending questions, or answer them. Questions are scoped to the current handoff packet.",
  parameters: checkQuestionsParams,
  execute: async (args) => {
    return await executeCheckQuestions(args);
  },
});

server.start({
  transportType: "stdio",
});
