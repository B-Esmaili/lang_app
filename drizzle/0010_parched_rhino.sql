CREATE TABLE "course_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"user_id" text NOT NULL,
	"anchor_text" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_comment" ADD CONSTRAINT "course_comment_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_comment" ADD CONSTRAINT "course_comment_lesson_id_course_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_comment" ADD CONSTRAINT "course_comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_comment_course_lesson_idx" ON "course_comment" USING btree ("course_id","lesson_id");