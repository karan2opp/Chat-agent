import { bigint, index, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";
import { EMBEDDING_DIMENSIONS } from "../../common/llm/embedding-size.js";
import { turns } from "../chat/chat.table.js";

// One vector per turn, for searching by meaning. Kept in its own table, not on the turn row, so
// that loading chat history never drags a 1,536-number vector along with every turn.
export const turnEmbeddings = pgTable(
  "turn_embeddings",
  {
    turnId: bigint("turn_id", { mode: "number" })
      .primaryKey()
      .references(() => turns.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("turn_embeddings_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops"))],
);
