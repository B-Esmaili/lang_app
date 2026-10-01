CREATE TABLE "user_ai_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"provider" text DEFAULT 'openai-compatible' NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"is_assistant" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ai_connection" ADD CONSTRAINT "user_ai_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "user_ai_connection" (
	"id",
	"user_id",
	"label",
	"provider",
	"base_url",
	"model",
	"encrypted_api_key",
	"is_assistant",
	"created_at",
	"updated_at"
)
SELECT
	"user_id",
	"user_id",
	'Primary AI connection',
	'openai-compatible',
	"base_url",
	"model",
	"encrypted_api_key",
	CASE WHEN btrim("base_url") <> '' AND btrim("model") <> '' THEN true ELSE false END,
	"created_at",
	"updated_at"
FROM "user_ai_credential";--> statement-breakpoint
CREATE INDEX "user_ai_connection_user_idx" ON "user_ai_connection" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_connection_one_assistant_idx" ON "user_ai_connection" USING btree ("user_id") WHERE "user_ai_connection"."is_assistant";
