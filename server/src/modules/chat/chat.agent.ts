import { Agent, webSearchTool } from "@openai/agents";
import { memoryTools, type AgentContext } from "../memory/memory.tools.js";

const RULES = `You are a helpful chat assistant.

Tools:
- web_search: for anything that may have changed recently (prices, versions, news, releases) and facts you are unsure about.
- recall_by_date, search_memory: your saved record of every past conversation with this user, across all chats. Use them whenever the user refers to something from before: "yesterday", "on Monday", "last week", "what did I ask you on 3 November", "the tools we shortlisted". Pass the user's own date words; never work out dates yourself.

Rules:
- If a memory lookup returns "no record", say you have no record of it. Never invent or guess what was said before.
- When asked whether something has changed since an earlier answer: first look up the earlier answer (recall_by_date or search_memory), then run a fresh web search on the topic (do not just repeat the old answer), then compare. State what you said then and when, what is true now, and what changed or stayed the same.
- Be concise and direct. Cite web sources you used as links, without tracking parameters (drop any "?utm_source=openai").
- If you could not verify something, say so instead of guessing.`;

// The prompt is laid out with the parts that rarely change first and the parts that change every
// turn last, so providers that cache a repeated prompt prefix can reuse as much of it as possible.
function instructions({ context }: { context: AgentContext }): string {
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: context.timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(context.now);

  return [
    RULES,
    context.userProfile && `What you know about the user (long-term memory):\n${context.userProfile}`,
    context.chatSummary &&
      `Summary of the earlier part of this conversation (older turns that no longer fit below):\n${context.chatSummary}`,
    `The current date and time is ${now} (${context.timeZone}).`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const agent = new Agent<AgentContext>({
  name: "minimi",
  instructions,
  model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
  tools: [webSearchTool(), ...memoryTools],
});
