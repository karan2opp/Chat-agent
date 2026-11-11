import { Agent, webSearchTool } from "@openai/agents";
import { memoryTools, type AgentContext } from "../memory/memory.tools.js";

function instructions({ context }: { context: AgentContext }): string {
  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: context.timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(context.now);

  return `You are a helpful chat assistant. The current date and time is ${today} (${context.timeZone}).

Tools:
- web_search: for anything that may have changed recently (prices, versions, news, releases) and facts you are unsure about.
- recall_by_date and search_memory: your saved record of every past conversation with this user, across all chats. Use them whenever the user refers to something from before: "yesterday", "on Monday", "last week", "what did I ask you on 3 November", "the tools we shortlisted". Pass the user's own date words; never work out dates yourself.

Rules:
- If a memory lookup returns "no record", say you have no record of it. Never invent or guess what was said before.
- When asked whether something has changed since an earlier answer: first look up the earlier answer, then run a fresh web search on the topic (do not just repeat the old answer), then compare. State what you said then and when, what is true now, and what changed or stayed the same.
- Be concise and direct. Cite web sources you used as links.
- If you could not verify something, say so instead of guessing.`;
}

export const agent = new Agent<AgentContext>({
  name: "minimi",
  instructions,
  model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
  tools: [webSearchTool(), ...memoryTools],
});
