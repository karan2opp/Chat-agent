import { and, asc, gte, lt, sql, type SQL } from "drizzle-orm";
import { db } from "../../common/db/client.js";
import { claims, type Claim, type NewClaim } from "./claim.table.js";

export async function insertClaims(rows: NewClaim[]): Promise<void> {
  if (rows.length > 0) await db.insert(claims).values(rows);
}

const searchVector = sql`to_tsvector('english', ${claims.topic} || ' ' || ${claims.subject} || ' ' || ${claims.attribute})`;

async function run(tsQuery: SQL | undefined, range: { from: Date; to: Date } | undefined, limit: number): Promise<Claim[]> {
  const conditions: SQL[] = [];
  if (tsQuery) conditions.push(sql`${searchVector} @@ ${tsQuery}`);
  if (range) conditions.push(gte(claims.asOf, range.from), lt(claims.asOf, range.to));
  return db
    .select()
    .from(claims)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(claims.asOf), asc(claims.id))
    .limit(limit);
}

// Claims about a topic and/or stated within a period. With a topic it tries "all words" first and
// then "any word", the same way memory search does.
export async function findClaims(
  topic: string | null,
  range: { from: Date; to: Date } | undefined,
  limit: number,
): Promise<Claim[]> {
  if (!topic) return run(undefined, range, limit);

  const strict = await run(sql`websearch_to_tsquery('english', ${topic})`, range, limit);
  if (strict.length > 0) return strict;

  const words = [...new Set(topic.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])];
  if (words.length < 2) return [];
  return run(sql`websearch_to_tsquery('english', ${words.join(" or ")})`, range, limit);
}
