import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../common/db/client.js";
import { turns, type Turn } from "../chat/chat.table.js";
import { summaries, summaryChildren, summaryTurns, type Summary, type SummaryLevel } from "./summary.table.js";

export async function getSummary(level: SummaryLevel, periodStart: string, timeZone: string): Promise<Summary | undefined> {
  const [row] = await db
    .select()
    .from(summaries)
    .where(and(eq(summaries.level, level), eq(summaries.periodStart, periodStart), eq(summaries.timeZone, timeZone)));
  return row;
}

export async function getSummaryById(id: number): Promise<Summary | undefined> {
  const [row] = await db.select().from(summaries).where(eq(summaries.id, id));
  return row;
}

export function getTurnsInRange(from: Date, to: Date): Promise<Turn[]> {
  return db
    .select()
    .from(turns)
    .where(and(gte(turns.askedAt, from), lt(turns.askedAt, to)))
    .orderBy(asc(turns.askedAt), asc(turns.id));
}

type SummaryFields = Pick<Summary, "level" | "periodStart" | "periodEnd" | "timeZone" | "text" | "turnCount" | "throughTurnId">;

// Creates or replaces the summary for a period and its pointers, in one transaction.
async function save(fields: SummaryFields, writePointers: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: number) => Promise<void>): Promise<Summary> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(summaries)
      .values(fields)
      .onConflictDoUpdate({
        target: [summaries.level, summaries.periodStart, summaries.timeZone],
        set: {
          periodEnd: fields.periodEnd,
          text: fields.text,
          turnCount: fields.turnCount,
          throughTurnId: fields.throughTurnId,
          updatedAt: new Date(),
        },
      })
      .returning();
    await tx.delete(summaryTurns).where(eq(summaryTurns.summaryId, row.id));
    await tx.delete(summaryChildren).where(eq(summaryChildren.summaryId, row.id));
    await writePointers(tx, row.id);
    return row;
  });
}

export function saveDaySummary(fields: SummaryFields, turnIds: number[]): Promise<Summary> {
  return save(fields, async (tx, id) => {
    if (turnIds.length > 0) await tx.insert(summaryTurns).values(turnIds.map((turnId) => ({ summaryId: id, turnId })));
  });
}

export function saveParentSummary(fields: SummaryFields, childIds: number[]): Promise<Summary> {
  return save(fields, async (tx, id) => {
    if (childIds.length > 0) await tx.insert(summaryChildren).values(childIds.map((childId) => ({ summaryId: id, childId })));
  });
}

// For each summary: the raw turn ids (day level) or the child summary ids (higher levels).
export async function getPointers(ids: number[]): Promise<Map<number, number[]>> {
  const pointers = new Map<number, number[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return pointers;
  const [turnRows, childRows] = await Promise.all([
    db.select().from(summaryTurns).where(inArray(summaryTurns.summaryId, ids)).orderBy(asc(summaryTurns.turnId)),
    db.select().from(summaryChildren).where(inArray(summaryChildren.summaryId, ids)),
  ]);
  for (const r of turnRows) pointers.get(r.summaryId)!.push(r.turnId);
  for (const r of childRows) pointers.get(r.summaryId)!.push(r.childId);
  return pointers;
}

export function getChildSummaries(summaryId: number): Promise<Summary[]> {
  return db
    .select({ s: summaries })
    .from(summaryChildren)
    .innerJoin(summaries, eq(summaries.id, summaryChildren.childId))
    .where(eq(summaryChildren.summaryId, summaryId))
    .orderBy(asc(summaries.periodStart))
    .then((rows) => rows.map((r) => r.s));
}

export function getSummaryTurns(summaryId: number): Promise<Turn[]> {
  return db
    .select({ t: turns })
    .from(summaryTurns)
    .innerJoin(turns, eq(turns.id, summaryTurns.turnId))
    .where(eq(summaryTurns.summaryId, summaryId))
    .orderBy(asc(turns.askedAt), asc(turns.id))
    .then((rows) => rows.map((r) => r.t));
}

// Calendar days (in the zone) on which turns were asked since `since`, newest first.
export async function getActiveDays(timeZone: string, since: Date): Promise<string[]> {
  const result = await db.execute<{ day: string }>(sql`
    SELECT DISTINCT to_char((${turns.askedAt} AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day
    FROM ${turns}
    WHERE ${turns.askedAt} >= ${since}
    ORDER BY day DESC`);
  return result.rows.map((r) => r.day);
}
