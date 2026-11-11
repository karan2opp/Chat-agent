CREATE TABLE "summaries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"time_zone" text NOT NULL,
	"text" text NOT NULL,
	"turn_count" integer NOT NULL,
	"through_turn_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "summary_children" (
	"summary_id" bigint NOT NULL,
	"child_id" bigint NOT NULL,
	CONSTRAINT "summary_children_summary_id_child_id_pk" PRIMARY KEY("summary_id","child_id")
);
--> statement-breakpoint
CREATE TABLE "summary_turns" (
	"summary_id" bigint NOT NULL,
	"turn_id" bigint NOT NULL,
	CONSTRAINT "summary_turns_summary_id_turn_id_pk" PRIMARY KEY("summary_id","turn_id")
);
--> statement-breakpoint
ALTER TABLE "summary_children" ADD CONSTRAINT "summary_children_summary_id_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_children" ADD CONSTRAINT "summary_children_child_id_summaries_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_turns" ADD CONSTRAINT "summary_turns_summary_id_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_turns" ADD CONSTRAINT "summary_turns_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "summaries_period_idx" ON "summaries" USING btree ("level","period_start","time_zone");--> statement-breakpoint
CREATE INDEX "summary_turns_turn_idx" ON "summary_turns" USING btree ("turn_id");