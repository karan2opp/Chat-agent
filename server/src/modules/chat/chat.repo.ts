import { asc, desc, eq, exists, sql } from "drizzle-orm";
import { db } from "../../common/db/client.js";
import { chats, turns, type Chat, type Turn, type TurnSource } from "./chat.table.js";

export type { Chat, Turn };

export async function createChat(title: string): Promise<string> {
  const [row] = await db.insert(chats).values({ title }).returning({ id: chats.id });
  return row.id;
}

export async function setChatSummary(id: string, summary: string, throughTurnId: number): Promise<void> {
  await db.update(chats).set({ summary, summaryThroughTurnId: throughTurnId }).where(eq(chats.id, id));
}

// Most recent `limit` turns, returned oldest first.
export async function getRecentTurns(chatId: string, limit: number): Promise<Turn[]> {
  const rows = await db
    .select()
    .from(turns)
    .where(eq(turns.chatId, chatId))
    .orderBy(desc(turns.id))
    .limit(limit);
  return rows.reverse();
}

export async function saveTurn(
  chatId: string,
  userText: string,
  assistantText: string,
  askedAt: Date,
  sources: TurnSource[],
): Promise<Turn> {
  return db.transaction(async (tx) => {
    const [turn] = await tx.insert(turns).values({ chatId, userText, assistantText, askedAt, sources }).returning();
    await tx.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
    return turn;
  });
}

// Only chats with at least one saved turn, newest activity first.
export function listChats(limit: number): Promise<Chat[]> {
  return db
    .select()
    .from(chats)
    .where(exists(db.select({ one: sql`1` }).from(turns).where(eq(turns.chatId, chats.id))))
    .orderBy(desc(chats.updatedAt))
    .limit(limit);
}

export async function getChat(id: string): Promise<Chat | null> {
  const [row] = await db.select().from(chats).where(eq(chats.id, id));
  return row ?? null;
}

export function getAllTurns(chatId: string): Promise<Turn[]> {
  return db.select().from(turns).where(eq(turns.chatId, chatId)).orderBy(asc(turns.id));
}
