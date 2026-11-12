import { bigint, bigserial, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { turns } from "../../chat/chat.table.js";

// Ray's own backstory, as he has told it: where he is from, how he trained, what he likes. A detail
// is saved the first time he makes it up and never changed afterwards, so his story is the same
// every time someone asks, in any chat.
export const personaFacts = pgTable(
  "persona_facts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // What the detail is about, e.g. "origin", "training", "favourite food".
    key: text("key").notNull(),
    // The detail as he told it, in a few sentences.
    story: text("story").notNull(),
    // The turn he first told it in. Kept even if that turn is later deleted.
    sourceTurnId: bigint("source_turn_id", { mode: "number" }).references(() => turns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One story per topic: the first telling wins.
  (t) => [uniqueIndex("persona_facts_key_idx").on(t.key)],
);

export type PersonaFact = typeof personaFacts.$inferSelect;
