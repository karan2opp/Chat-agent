import { run, type AgentInputItem } from "@openai/agents";
import { agent } from "./chat.agent.js";
import { fitRecent, unsummarised } from "../memory/context/context-window.js";
import { isValidTimeZone } from "../memory/time/date-resolver.js";
import { renderProfile } from "../memory/facts/facts.js";
import { getActiveFacts } from "../memory/facts/facts.repo.js";
import { budgets } from "../memory/context/memory.config.js";
import type { AgentContext } from "../memory/memory.tools.js";
import * as repo from "./chat.repo.js";
import type { ChatMessage } from "./chat.schema.js";
import { collectSources } from "./chat.sources.js";

// Most turns read from the database when building history; the token budget decides how many of
// them are actually sent to the model.
const HISTORY_FETCH = 300;

// Upper limit on model calls in one reply (memory lookups, web searches and retries of a search
// that did not fit the request). It stops a search that keeps failing from looping.
const MAX_MODEL_TURNS = 10;

export class ChatNotFoundError extends Error {}

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

function titleFrom(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine;
}

// Resolves the chat (creating one if needed) and builds the model input from stored history.
export async function startTurn(chatId: string | undefined, message: string) {
  const askedAt = new Date();
  const history: ChatMessage[] = [];

  let id = chatId;
  let chatSummary: string | undefined;
  if (id) {
    const chat = await repo.getChat(id);
    if (!chat) throw new ChatNotFoundError();
    // The summary covers the older turns; every turn after it is sent word for word. The summary is
    // kept within its budget when it is saved. fitRecent only cuts in if compaction has fallen
    // behind (it runs after the reply, and could have failed).
    chatSummary = chat.summary ?? undefined;
    const recent = unsummarised(await repo.getRecentTurns(id, HISTORY_FETCH), chat.summaryThroughTurnId);
    const { kept } = fitRecent(recent, budgets().recentTokens);
    for (const t of kept) {
      history.push({ role: "user", content: t.userText });
      history.push({ role: "assistant", content: t.assistantText });
    }
  } else {
    id = await repo.createChat(titleFrom(message));
  }

  // Long-term facts about the user go into the prompt on every turn, within their own budget.
  const userProfile = renderProfile(await getActiveFacts(), budgets().coreTokens);

  return {
    chatId: id,
    askedAt,
    userProfile,
    chatSummary,
    messages: [...history, { role: "user", content: message } as ChatMessage],
  };
}

// Falls back to the server's own zone when the client sent none or an unknown one.
export function pickTimeZone(requested: string | undefined): string {
  if (requested && isValidTimeZone(requested)) return requested;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Starts an agent run and returns the streamed result; the caller decides how to deliver it.
// `context` is what the memory tools use to work out dates ("yesterday") in the user's time zone.
export function streamReply(messages: ChatMessage[], signal: AbortSignal, context: AgentContext) {
  return run(agent, toInput(messages), { stream: true, signal, context, maxTurns: MAX_MODEL_TURNS });
}

export { collectSources };

export const saveTurn = repo.saveTurn;

export async function getChatWithTurns(id: string) {
  const chat = await repo.getChat(id);
  if (!chat) return null;
  return { chat, turns: await repo.getAllTurns(id) };
}

export const listChats = (limit = 50) => repo.listChats(limit);
