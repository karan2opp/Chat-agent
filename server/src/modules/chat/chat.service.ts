import { run, type AgentInputItem } from "@openai/agents";
import { agent } from "./chat.agent.js";
import type { ChatMessage } from "./chat.schema.js";

function toInput(messages: ChatMessage[]): AgentInputItem[] {
  return messages.map((m) =>
    m.role === "user"
      ? { role: "user", content: m.content }
      : {
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: m.content }],
        },
  );
}

// Starts an agent run and returns the streamed result; the caller decides how to deliver it.
export function streamReply(messages: ChatMessage[], signal: AbortSignal) {
  return run(agent, toInput(messages), { stream: true, signal });
}
