import { sql } from "drizzle-orm";
import { bigint, bigserial, doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { turns } from "../chat/chat.table.js";

// A claim is one checkable fact the assistant stated from a web search, such as "Pipedrive's
// Essential plan costs $14 per user per month". Saving them as rows, not just prose, is what
// lets a later "has this changed?" question compare old and new values.
export const claims = pgTable(
  "claims",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    turnId: bigint("turn_id", { mode: "number" })
      .notNull()
      .references(() => turns.id, { onDelete: "cascade" }),
    // What the group of claims is about, e.g. "CRM tool pricing".
    topic: text("topic").notNull(),
    subject: text("subject").notNull(),
    attribute: text("attribute").notNull(),
    // The value as stated, e.g. "$14 per user per month, billed annually".
    value: text("value").notNull(),
    // The main number in the value (14), when it is a single price or quantity. Compared
    // numerically so "$14/user/month" and "$14 per user per month" do not count as a change.
    amount: doublePrecision("amount"),
    sourceUrl: text("source_url"),
    // When the claim was stated, i.e. when the turn was asked.
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("claims_turn_idx").on(t.turnId),
    index("claims_as_of_idx").on(t.asOf),
    index("claims_fts_idx").using(
      "gin",
      sql`to_tsvector('english', ${t.topic} || ' ' || ${t.subject} || ' ' || ${t.attribute})`,
    ),
  ],
);

export type Claim = typeof claims.$inferSelect;
export type NewClaim = typeof claims.$inferInsert;
