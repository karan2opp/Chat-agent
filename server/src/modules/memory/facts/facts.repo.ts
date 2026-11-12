import { asc, desc, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../../../common/db/client.js";
import { userFacts, type UserFact } from "./fact.table.js";
import type { FactChanges } from "./facts.js";

export function getActiveFacts(): Promise<UserFact[]> {
  return db.select().from(userFacts).where(isNull(userFacts.supersededAt)).orderBy(asc(userFacts.id));
}

export function getFactHistory(): Promise<UserFact[]> {
  return db.select().from(userFacts).where(isNotNull(userFacts.supersededAt)).orderBy(desc(userFacts.supersededAt));
}

// Retires and inserts in one transaction, so there is never a moment with two values for a key.
export async function applyFactChanges(changes: FactChanges, sourceTurnId: number): Promise<void> {
  if (changes.supersede.length === 0 && changes.insert.length === 0) return;
  await db.transaction(async (tx) => {
    if (changes.supersede.length > 0) {
      await tx.update(userFacts).set({ supersededAt: new Date() }).where(inArray(userFacts.id, changes.supersede));
    }
    if (changes.insert.length > 0) {
      await tx.insert(userFacts).values(changes.insert.map((f) => ({ ...f, sourceTurnId })));
    }
  });
}
