import { bigint, bigserial, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { turns } from "../chat/chat.table.js";

export type SummaryLevel = "day" | "week" | "month" | "year";

// A summary of a period of conversations, in the user's time zone. Summaries are an index, not a
// replacement: they point back to what they were built from (summary_turns for a day,
// summary_children for the higher levels), and the raw turns are never changed or deleted.
export const summaries = pgTable(
  "summaries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    level: text("level").$type<SummaryLevel>().notNull(),
    // First and last calendar day covered, inclusive.
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    // Days start and end at midnight in this zone, so each zone has its own summaries.
    timeZone: text("time_zone").notNull(),
    text: text("text").notNull(),
    turnCount: integer("turn_count").notNull(),
    // The newest turn id this summary includes. If a newer turn lands in the period, the summary
    // is out of date and is rebuilt the next time it is needed.
    throughTurnId: bigint("through_turn_id", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("summaries_period_idx").on(t.level, t.periodStart, t.timeZone)],
);

// Pointers from a day summary to the raw turns it covers.
export const summaryTurns = pgTable(
  "summary_turns",
  {
    summaryId: bigint("summary_id", { mode: "number" })
      .notNull()
      .references(() => summaries.id, { onDelete: "cascade" }),
    turnId: bigint("turn_id", { mode: "number" })
      .notNull()
      .references(() => turns.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.summaryId, t.turnId] }), index("summary_turns_turn_idx").on(t.turnId)],
);

// Pointers from a week, month or year summary to the lower-level summaries it was built from.
export const summaryChildren = pgTable(
  "summary_children",
  {
    summaryId: bigint("summary_id", { mode: "number" })
      .notNull()
      .references(() => summaries.id, { onDelete: "cascade" }),
    childId: bigint("child_id", { mode: "number" })
      .notNull()
      .references(() => summaries.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.summaryId, t.childId] })],
);

export type Summary = typeof summaries.$inferSelect;
