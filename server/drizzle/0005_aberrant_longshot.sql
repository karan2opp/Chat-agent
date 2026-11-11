CREATE TABLE "turn_embeddings" (
	"turn_id" bigint PRIMARY KEY NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turn_embeddings" ADD CONSTRAINT "turn_embeddings_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "turn_embeddings_hnsw_idx" ON "turn_embeddings" USING hnsw ("embedding" vector_cosine_ops);