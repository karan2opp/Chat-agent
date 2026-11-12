import { asc } from "drizzle-orm";
import { db } from "../../../common/db/client.js";
import type { PersonaDetail } from "./persona.js";
import { personaFacts, type PersonaFact } from "./persona.table.js";

export function getPersonaFacts(): Promise<PersonaFact[]> {
  return db.select().from(personaFacts).orderBy(asc(personaFacts.id));
}

// Saves newly told details. If another turn saved the same topic first, that story is kept.
export async function addPersonaDetails(details: PersonaDetail[], sourceTurnId: number): Promise<void> {
  if (details.length === 0) return;
  await db
    .insert(personaFacts)
    .values(details.map((d) => ({ ...d, sourceTurnId })))
    .onConflictDoNothing({ target: personaFacts.key });
}
