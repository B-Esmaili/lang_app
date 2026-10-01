CREATE TABLE IF NOT EXISTS "user_voice_chat_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"connection_id" text,
	"voice_id" text DEFAULT 'en_US-hfc_female-medium' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_voice_chat_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "user_voice_chat_settings_connection_id_user_ai_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_ai_connection"("id") ON DELETE set null ON UPDATE no action
);
