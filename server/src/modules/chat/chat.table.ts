import { sql } from "drizzle-orm";
import { bigint, bigserial, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export type TurnSource = { url: string; title: string };

// A chat is a conversation; a turn is one user query plus the agent's reply.
export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Running summary of the turns of this chat that no longer fit in the recent window, and the
    // newest turn it covers. Both are empty until the chat gets long enough to need one.
    summary: text("summary"),
    summaryThroughTurnId: bigint("summary_through_turn_id", { mode: "number" }),
  },
  (t) => [index("chats_updated_idx").on(t.updatedAt.desc())],
);

export const turns = pgTable(
  "turns",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userText: text("user_text").notNull(),
    assistantText: text("assistant_text").notNull(),
    // Web pages the reply cited, saved with the turn so a later "has it changed?" check can see
    // exactly what the earlier answer was based on.
    sources: jsonb("sources").$type<TurnSource[]>().notNull().default(sql`'[]'::jsonb`),
    // When the user's query reached the server.
    askedAt: timestamp("asked_at", { withTimezone: true }).notNull(),
    // When the reply finished streaming and was saved.
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
    // Set once claims and profile facts have been read out of this turn. A turn where that failed
    // stays unset and is tried again after a later turn, up to a few attempts.
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    extractionAttempts: integer("extraction_attempts").notNull().default(0),
  },
  (t) => [
    index("turns_chat_idx").on(t.chatId, t.id),
    index("turns_asked_idx").on(t.askedAt),
    // Keyword search over both sides of the turn. Queries must use this same expression.
    index("turns_fts_idx").using("gin", sql`to_tsvector('english', ${t.userText} || ' ' || ${t.assistantText})`),
  ],
);

export type Chat = typeof chats.$inferSelect;
export type Turn = typeof turns.$inferSelect;
