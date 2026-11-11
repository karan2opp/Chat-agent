CREATE TABLE "user_facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"source_turn_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_facts" ADD CONSTRAINT "user_facts_source_turn_id_turns_id_fk" FOREIGN KEY ("source_turn_id") REFERENCES "public"."turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_facts_active_key_idx" ON "user_facts" USING btree ("key") WHERE "user_facts"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "user_facts_created_idx" ON "user_facts" USING btree ("created_at");