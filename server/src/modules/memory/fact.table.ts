import { sql } from "drizzle-orm";
import { bigint, bigserial, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { turns } from "../chat/chat.table.js";

export const FACT_KINDS = ["profile", "preference", "project", "goal", "other"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

// Long-term facts about the user: name, role, preferences, one line per project. The active rows
// are always put in the prompt. When a fact changes, the old row is kept with `supersededAt` set,
// so the history is never lost. (The app has one user, so rows carry no user id.)
export const userFacts = pgTable(
  "user_facts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").$type<FactKind>().notNull(),
    // A stable name for the fact, e.g. "name", "role", "project:minimi".
    key: text("key").notNull(),
    value: text("value").notNull(),
    // The turn the user said it in. Kept even if that turn is later deleted.
    sourceTurnId: bigint("source_turn_id", { mode: "number" }).references(() => turns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when a newer value replaced this one or the user said it was no longer true.
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
  },
  (t) => [
    // At most one current value per key.
    uniqueIndex("user_facts_active_key_idx").on(t.key).where(sql`${t.supersededAt} IS NULL`),
    index("user_facts_created_idx").on(t.createdAt),
  ],
);

export type UserFact = typeof userFacts.$inferSelect;
export type NewUserFact = typeof userFacts.$inferInsert;
