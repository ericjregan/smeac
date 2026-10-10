import { FastMCP } from "fastmcp";
import { cleanOrphanedTmpFiles } from "./storage.js";
import { postReliefParams, executePostRelief } from "./tools/post-relief.js";
import { assumeWatchParams, executeAssumeWatch } from "./tools/assume-watch.js";
import { checkQuestionsParams, executeCheckQuestions } from "./tools/check-questions.js";
import { registerSessionParams, executeRegisterSession } from "./tools/register-session.js";
import { heartbeatSessionParams, executeHeartbeatSession } from "./tools/heartbeat-session.js";
import { setReliefModeParams, executeSetReliefMode } from "./tools/set-relief-mode.js";
import { phaseControlParams, executePhaseControl } from "./tools/phase-control.js";
import { workstreamControlParams, executeWorkstreamControl } from "./tools/workstream-control.js";
import { spawnSuccessorParams, executeSpawnSuccessor } from "./tools/spawn-successor.js";
import { relayMessageParams, executeRelayMessage } from "./tools/relay-message.js";

// Clean up any orphaned .tmp files from previous runs
cleanOrphanedTmpFiles();

const server = new FastMCP({
  name: "relief",
  version: "1.0.0",
});

server.addTool({
  name: "register_session",
  description: "Register a terminal session with the relief broker and attach it to a repo/branch workstream.",
  parameters: registerSessionParams,
  execute: async (args) => {
    return await executeRegisterSession(args);
  },
});

server.addTool({
  name: "heartbeat_session",
  description: "Update heartbeat for a registered broker session.",
  parameters: heartbeatSessionParams,
  execute: async (args) => {
    return await executeHeartbeatSession(args);
  },
});

server.addTool({
  name: "set_relief_mode",
  description: "Set workstream relief mode: manual, suggest, auto, or full-auto.",
  parameters: setReliefModeParams,
  execute: async (args) => {
    return await executeSetReliefMode(args);
  },
});

server.addTool({
  name: "phase_control",
  description: "Start, checkpoint, complete, or propose protected-phase checkpoints for a broker session.",
  parameters: phaseControlParams,
  execute: async (args) => {
    return await executePhaseControl(args);
  },
});

server.addTool({
  name: "workstream_control",
  description: "Inspect or rename workstreams and read/write the shared WORKSTATE.",
  parameters: workstreamControlParams,
  execute: async (args) => {
    return await executeWorkstreamControl(args);
  },
});

server.addTool({
  name: "spawn_successor",
  description: "Evaluate or launch a successor session for relief handoff, using tmux when available.",
  parameters: spawnSuccessorParams,
  execute: async (args) => {
    return await executeSpawnSuccessor(args);
  },
});

server.addTool({
  name: "relay_message",
  description: "Send or read broker-level messages within a workstream.",
  parameters: relayMessageParams,
  execute: async (args) => {
    return await executeRelayMessage(args);
  },
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
