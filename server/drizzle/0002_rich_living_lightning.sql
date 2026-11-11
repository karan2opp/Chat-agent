CREATE TABLE "claims" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"turn_id" bigint NOT NULL,
	"topic" text NOT NULL,
	"subject" text NOT NULL,
	"attribute" text NOT NULL,
	"value" text NOT NULL,
	"amount" double precision,
	"source_url" text,
	"as_of" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claims_turn_idx" ON "claims" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "claims_as_of_idx" ON "claims" USING btree ("as_of");--> statement-breakpoint
CREATE INDEX "claims_fts_idx" ON "claims" USING gin (to_tsvector('english', "topic" || ' ' || "subject" || ' ' || "attribute"));