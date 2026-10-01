CREATE TABLE "user_ai_credential" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ai_credential" ADD CONSTRAINT "user_ai_credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;