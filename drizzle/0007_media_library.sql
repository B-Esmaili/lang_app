CREATE TABLE "media_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"folder_id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"source_url" text NOT NULL,
	"mime_type" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_folder_id_media_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_parent_id_media_folder_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_asset_owner_id_idx" ON "media_asset" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "media_asset_folder_id_idx" ON "media_asset" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_owner_folder_name_idx" ON "media_asset" USING btree ("owner_id","folder_id","name");--> statement-breakpoint
CREATE INDEX "media_folder_owner_id_idx" ON "media_folder" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "media_folder_parent_id_idx" ON "media_folder" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_folder_owner_parent_name_idx" ON "media_folder" USING btree ("owner_id","parent_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "media_folder_owner_root_name_idx" ON "media_folder" USING btree ("owner_id","name") WHERE "parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_asset_owner_root_name_idx" ON "media_asset" USING btree ("owner_id","name") WHERE "folder_id" IS NULL;
