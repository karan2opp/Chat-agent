ALTER TABLE "turns" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "extraction_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Turns saved before this column existed were already handled; do not read them out again.
UPDATE "turns" SET "extracted_at" = "answered_at";
