import { and, asc, desc, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../../common/db/client.js";
import { turns, type Turn } from "../chat/chat.table.js";

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
