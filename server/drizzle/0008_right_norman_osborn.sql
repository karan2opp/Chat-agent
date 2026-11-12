CREATE TABLE "persona_facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"story" text NOT NULL,
	"source_turn_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persona_facts" ADD CONSTRAINT "persona_facts_source_turn_id_turns_id_fk" FOREIGN KEY ("source_turn_id") REFERENCES "public"."turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "persona_facts_key_idx" ON "persona_facts" USING btree ("key");