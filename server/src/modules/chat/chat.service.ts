import { run, type AgentInputItem } from "@openai/agents";
import { agent } from "./chat.agent.js";
import * as repo from "./chat.repo.js";
import type { ChatMessage } from "./chat.schema.js";

// How many past turns of a chat are sent back to the model as conversation history.
const HISTORY_TURNS = 20;

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
  if (id) {
    if (!(await repo.chatExists(id))) throw new ChatNotFoundError();
    for (const t of await repo.getRecentTurns(id, HISTORY_TURNS)) {
      history.push({ role: "user", content: t.userText });
      history.push({ role: "assistant", content: t.assistantText });
    }
  } else {
    id = await repo.createChat(titleFrom(message));
  }

  return { chatId: id, askedAt, messages: [...history, { role: "user", content: message } as ChatMessage] };
}

// Starts an agent run and returns the streamed result; the caller decides how to deliver it.
export function streamReply(messages: ChatMessage[], signal: AbortSignal) {
  return run(agent, toInput(messages), { stream: true, signal });
}

export const saveTurn = repo.saveTurn;

export async function getChatWithTurns(id: string) {
  const chat = await repo.getChat(id);
  if (!chat) return null;
  return { chat, turns: await repo.getAllTurns(id) };
}

export const listChats = (limit = 50) => repo.listChats(limit);
