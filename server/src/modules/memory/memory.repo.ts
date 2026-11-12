import { and, asc, cosineDistance, desc, eq, gte, isNull, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../../common/db/client.js";
import { turns, type Turn } from "../chat/chat.table.js";
import { turnEmbeddings } from "./search/embedding.table.js";

export type MemoryTurn = Turn;

// Memory spans every chat: the user is one person talking to one assistant, so "what did I ask
// on 3 November" must not depend on which chat the question was asked in.

// Turns asked in [from, to), oldest first. Fetches one extra row so the caller can tell whether
// the list was cut off.
export async function getTurnsBetween(from: Date, to: Date, limit: number): Promise<{ turns: MemoryTurn[]; more: boolean }> {
  const rows = await db
    .select()
    .from(turns)
    .where(and(gte(turns.askedAt, from), lt(turns.askedAt, to)))
    .orderBy(asc(turns.askedAt), asc(turns.id))
    .limit(limit + 1);
  return { turns: rows.slice(0, limit), more: rows.length > limit };
}

const searchVector = sql`to_tsvector('english', ${turns.userText} || ' ' || ${turns.assistantText})`;

async function runSearch(tsQuery: SQL, range: { from: Date; to: Date } | undefined, limit: number) {
  const conditions: SQL[] = [sql`${searchVector} @@ ${tsQuery}`];
  if (range) conditions.push(gte(turns.askedAt, range.from), lt(turns.askedAt, range.to));
  return db
    .select()
    .from(turns)
    .where(and(...conditions))
    .orderBy(desc(sql`ts_rank(${searchVector}, ${tsQuery})`), desc(turns.askedAt))
    .limit(limit);
}

// Keyword search over past turns. Tries "all words" first; if that finds nothing, retries with
// "any word" so a long, wordy query still turns something up. Best matches first.
export async function searchTurns(
  query: string,
  range: { from: Date; to: Date } | undefined,
  limit: number,
): Promise<MemoryTurn[]> {
  const strict = await runSearch(sql`websearch_to_tsquery('english', ${query})`, range, limit);
  if (strict.length > 0) return strict;

  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
  if (words.length < 2) return [];
  return runSearch(sql`websearch_to_tsquery('english', ${words.join(" or ")})`, range, limit);
}

// ---- search by meaning ----

// Cosine distance runs from 0 (same meaning) to 2. Matches further away than this are noise: a
// vector search always returns its nearest rows, even when none of them are related.
const MAX_DISTANCE = 0.65;

export async function saveEmbedding(turnId: number, embedding: number[], model: string): Promise<void> {
  await db.insert(turnEmbeddings).values({ turnId, embedding, model }).onConflictDoNothing();
}

// Turns that have no embedding yet, newest first (used to catch up after a failure, or on rows
// that were added without going through a reply).
export async function getTurnsWithoutEmbedding(limit: number): Promise<MemoryTurn[]> {
  const rows = await db
    .select({ turn: turns })
    .from(turns)
    .leftJoin(turnEmbeddings, eq(turnEmbeddings.turnId, turns.id))
    .where(isNull(turnEmbeddings.turnId))
    .orderBy(desc(turns.id))
    .limit(limit);
  return rows.map((r) => r.turn);
}

// Turns whose claims and profile facts have not been read out yet, oldest first. Turns that have
// already used up their attempts are left alone.
export function getTurnsPendingExtraction(maxAttempts: number, limit: number): Promise<Turn[]> {
  return db
    .select()
    .from(turns)
    .where(and(isNull(turns.extractedAt), lt(turns.extractionAttempts, maxAttempts)))
    .orderBy(asc(turns.id))
    .limit(limit);
}

export async function recordExtractionAttempt(turnId: number): Promise<void> {
  await db
    .update(turns)
    .set({ extractionAttempts: sql`${turns.extractionAttempts} + 1` })
    .where(eq(turns.id, turnId));
}

export async function markExtracted(turnId: number): Promise<void> {
  await db.update(turns).set({ extractedAt: new Date() }).where(eq(turns.id, turnId));
}

export async function searchTurnsByMeaning(
  queryEmbedding: number[],
  range: { from: Date; to: Date } | undefined,
  limit: number,
): Promise<MemoryTurn[]> {
  const distance = cosineDistance(turnEmbeddings.embedding, queryEmbedding);
  const conditions: SQL[] = [lt(distance, MAX_DISTANCE)];
  if (range) conditions.push(gte(turns.askedAt, range.from), lt(turns.askedAt, range.to));
  const rows = await db
    .select({ turn: turns })
    .from(turnEmbeddings)
    .innerJoin(turns, eq(turns.id, turnEmbeddings.turnId))
    .where(and(...conditions))
    .orderBy(distance)
    .limit(limit);
  return rows.map((r) => r.turn);
}
