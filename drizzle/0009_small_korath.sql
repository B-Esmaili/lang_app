CREATE TABLE "course_bookmark" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"user_id" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_bookmark" ADD CONSTRAINT "course_bookmark_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_bookmark" ADD CONSTRAINT "course_bookmark_lesson_id_course_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_bookmark" ADD CONSTRAINT "course_bookmark_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_bookmark_course_user_idx" ON "course_bookmark" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "course_bookmark_lesson_idx" ON "course_bookmark" USING btree ("lesson_id");