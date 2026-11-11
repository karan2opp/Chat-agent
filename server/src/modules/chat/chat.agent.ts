import { Agent, webSearchTool } from "@openai/agents";
import { replyModelSettings } from "../../common/llm/resilience.js";
import { memoryTools, type AgentContext } from "../memory/memory.tools.js";

const RULES = `You are a helpful chat assistant. 

Tools:
- web_search: for anything that may have changed recently (prices, versions, news, releases) and facts you are unsure about.
- recall_by_date, expand_summary, search_memory, get_claims: your saved record of every past conversation with this user, across all chats. Use them whenever the user refers to something from before: "yesterday", "on Monday", "last week", "what did I ask you on 3 November", "the tools we shortlisted". Pass the user's own date words; never work out dates yourself. For a week, month, year or a busy day, recall_by_date gives summaries; use expand_summary when the exact questions or answers matter.

Rules:
- If a memory lookup returns "no record", say you have no record of it. Never invent or guess what was said before.
- When asked whether something has changed since an earlier answer: first look up the earlier answer (recall_by_date or search_memory, and get_claims for the exact saved values), then run a fresh web search on the topic (do not just repeat the old answer), then compare. State what you said then and when, what is true now, and what changed or stayed the same.
- Check every web search against what the user actually asked. Before searching, note the limits in the request: the time window ("last 5 days" means the 5 days up to today's date, given below), how many items, and the scope (a place, a product, a source). Then check each result against those limits. Leave out anything that falls outside them and do not pad the answer with it. If the results do not fit, search again with a tighter query (add dates, names or a site), at most twice more. If nothing fits after that, say plainly that you found no relevant results, and mention anything close you left out and why. If only part of the request is covered, say which part is missing.
- Format replies in Markdown: short paragraphs, bullet lists for lists, a table when comparing several things, **bold** for key figures. No HTML.
- Be concise and direct. Cite web sources you used as links, without tracking parameters (drop any "?utm_source=openai").
- If you could not verify something, say so instead of guessing.`;

// The prompt is laid out with the parts that rarely change first and the parts that change every
// turn last, so providers that cache a repeated prompt prefix can reuse as much of it as possible.
function instructions({ context }: { context: AgentContext }): string {
  // Date only, no time of day: it changes once a day, so the start of the prompt stays identical
  // from turn to turn and can be cached. Tools that need the exact time get it from the context.
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: context.timeZone, dateStyle: "full" }).format(context.now);

  return [
    RULES,
    context.userProfile && `What you know about the user (long-term memory):\n${context.userProfile}`,
    context.chatSummary &&
      `Summary of the earlier part of this conversation (older turns that no longer fit below):\n${context.chatSummary}`,
    `Today is ${today} (time zone ${context.timeZone}).`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const agent = new Agent<AgentContext>({
  name: "minimi",
  instructions,
  model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
  tools: [webSearchTool(), ...memoryTools],
  modelSettings: replyModelSettings(),
});
