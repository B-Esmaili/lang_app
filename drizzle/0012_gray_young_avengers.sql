ALTER TABLE "user_ai_credential" ADD COLUMN "base_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ai_credential" ADD COLUMN "model" text DEFAULT '' NOT NULL;