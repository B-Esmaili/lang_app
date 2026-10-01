CREATE TABLE "course_media_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"media_id" text NOT NULL,
	"name" text NOT NULL,
	"transcribed_text" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_media_resource" ADD CONSTRAINT "course_media_resource_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_media_resource" ADD CONSTRAINT "course_media_resource_media_id_media_asset_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_media_resource_course_id_idx" ON "course_media_resource" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_media_resource_media_id_idx" ON "course_media_resource" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_media_resource_course_name_idx" ON "course_media_resource" USING btree ("course_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "course_media_resource_course_media_idx" ON "course_media_resource" USING btree ("course_id","media_id");