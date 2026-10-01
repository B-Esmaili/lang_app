CREATE TABLE "course_note" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"author_id" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"anchor_key" text NOT NULL,
	"anchor_text" text NOT NULL,
	"anchors" jsonb NOT NULL,
	"body" text NOT NULL,
	"language" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_translation_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"source_text" text NOT NULL,
	"source_language" text NOT NULL,
	"target_language" text NOT NULL,
	"model_key" text NOT NULL,
	"translation" text NOT NULL,
	"prompt_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_note" ADD CONSTRAINT "course_note_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_note" ADD CONSTRAINT "course_note_lesson_id_course_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_note" ADD CONSTRAINT "course_note_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_translation_cache" ADD CONSTRAINT "course_translation_cache_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_note_course_lesson_idx" ON "course_note" USING btree ("course_id","lesson_id");--> statement-breakpoint
CREATE INDEX "course_note_author_idx" ON "course_note" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "course_note_anchor_idx" ON "course_note" USING btree ("lesson_id","anchor_key");--> statement-breakpoint
CREATE INDEX "course_note_translation_idx" ON "course_note" USING btree ("course_id","kind","language");--> statement-breakpoint
CREATE INDEX "course_translation_cache_course_idx" ON "course_translation_cache" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_translation_cache_languages_idx" ON "course_translation_cache" USING btree ("course_id","source_language","target_language");
--> statement-breakpoint
INSERT INTO "course_note" (
	"id",
	"course_id",
	"lesson_id",
	"author_id",
	"kind",
	"visibility",
	"source",
	"anchor_key",
	"anchor_text",
	"anchors",
	"body",
	"language",
	"created_at",
	"updated_at"
)
SELECT
	'legacy.comment.' || "id",
	"course_id",
	"lesson_id",
	"user_id",
	'note',
	'private',
	'legacy',
	'legacy.comment.' || "id",
	"anchor_text",
	jsonb_build_array(
		jsonb_build_object(
			'key', 'legacy.comment.' || "id",
			'text', "anchor_text"
		)
	),
	"body",
	NULL,
	"created_at",
	"created_at"
FROM "course_comment"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_note" (
	"id",
	"course_id",
	"lesson_id",
	"author_id",
	"kind",
	"visibility",
	"source",
	"anchor_key",
	"anchor_text",
	"anchors",
	"body",
	"language",
	"created_at",
	"updated_at"
)
SELECT
	'legacy.bookmark.' || "id",
	"course_id",
	"lesson_id",
	"user_id",
	'note',
	'private',
	'legacy',
	'legacy.bookmark.' || "id",
	'',
	'[]'::jsonb,
	COALESCE(NULLIF(BTRIM("note"), ''), 'Saved lesson'),
	NULL,
	"created_at",
	"created_at"
FROM "course_bookmark"
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "course_note" (
	"id",
	"course_id",
	"lesson_id",
	"author_id",
	"kind",
	"visibility",
	"source",
	"anchor_key",
	"anchor_text",
	"anchors",
	"body",
	"language",
	"created_at",
	"updated_at"
)
SELECT
	'legacy.annotation.' || lesson."id" || '.' || (widget.value ->> 'id') || '.' || (annotation.value ->> 'id'),
	lesson."course_id",
	lesson."id",
	course_record."owner_id",
	'note',
	'private',
	'legacy',
	'legacy.annotation.' || lesson."id" || '.' || (widget.value ->> 'id') || '.' || (annotation.value ->> 'id'),
	SUBSTRING(
		legacy_range.text
		FROM resolved_range.start_character + 1
		FOR resolved_range.end_character - resolved_range.start_character
	),
	jsonb_build_array(
		jsonb_build_object(
			'key', 'legacy.annotation.' || lesson."id" || '.' || (widget.value ->> 'id') || '.' || (annotation.value ->> 'id'),
			'text', SUBSTRING(
				legacy_range.text
				FROM resolved_range.start_character + 1
				FOR resolved_range.end_character - resolved_range.start_character
			),
			'frameId', frame.value ->> 'id',
			'widgetId', widget.value ->> 'id',
			'start', legacy_range.start_offset,
			'end', legacy_range.end_offset
		)
	),
	BTRIM(annotation.value ->> 'note'),
	NULL,
	lesson."created_at",
	lesson."updated_at"
FROM "course_lesson" AS lesson
INNER JOIN "course" AS course_record ON course_record."id" = lesson."course_id"
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(lesson."document" -> 'frames') = 'array' THEN lesson."document" -> 'frames'
		ELSE '[]'::jsonb
	END
) AS frame(value)
CROSS JOIN LATERAL jsonb_each(
	CASE
		WHEN jsonb_typeof(frame.value -> 'slots') = 'object' THEN frame.value -> 'slots'
		ELSE '{}'::jsonb
	END
) AS slot(key, value)
CROSS JOIN LATERAL jsonb_array_elements(
	CASE WHEN jsonb_typeof(slot.value) = 'array' THEN slot.value ELSE '[]'::jsonb END
) AS widget(value)
CROSS JOIN LATERAL jsonb_array_elements(
	CASE
		WHEN jsonb_typeof(widget.value -> 'content' -> 'annotations') = 'array'
			THEN widget.value -> 'content' -> 'annotations'
		WHEN jsonb_typeof(widget.value -> 'content' -> 'annotations') = 'object'
			THEN jsonb_build_array(widget.value -> 'content' -> 'annotations')
		ELSE '[]'::jsonb
	END
) AS annotation(value)
CROSS JOIN LATERAL (
	SELECT
		COALESCE(widget.value -> 'content' ->> 'text', '') AS text,
		CASE
			WHEN (annotation.value ->> 'start') ~ '^[0-9]{1,9}$'
				THEN (annotation.value ->> 'start')::integer
		END AS start_offset,
		CASE
			WHEN (annotation.value ->> 'end') ~ '^[0-9]{1,9}$'
				THEN (annotation.value ->> 'end')::integer
		END AS end_offset
) AS legacy_range
CROSS JOIN LATERAL (
	SELECT
		COALESCE(
			MAX(boundary.character_index) FILTER (
				WHERE boundary.utf16_end <= legacy_range.start_offset
			),
			0
		) AS start_character,
		COALESCE(
			MAX(boundary.character_index) FILTER (
				WHERE boundary.utf16_end <= legacy_range.end_offset
			),
			0
		) AS end_character,
		(
			legacy_range.start_offset = 0
			OR COALESCE(BOOL_OR(boundary.utf16_end = legacy_range.start_offset), false)
		) AS valid_start,
		(
			legacy_range.end_offset = 0
			OR COALESCE(BOOL_OR(boundary.utf16_end = legacy_range.end_offset), false)
		) AS valid_end
	FROM (
		SELECT
			character_index,
			SUM(
				CASE
					WHEN OCTET_LENGTH(
						CONVERT_TO(SUBSTRING(legacy_range.text FROM character_index FOR 1), 'UTF8')
					) = 4 THEN 2
					ELSE 1
				END
			) OVER (ORDER BY character_index) AS utf16_end
		FROM GENERATE_SERIES(1, CHAR_LENGTH(legacy_range.text)) AS character_index
	) AS boundary
) AS resolved_range
WHERE widget.value ->> 'type' = 'language.passage'
	AND BTRIM(COALESCE(annotation.value ->> 'note', '')) <> ''
	AND NULLIF(widget.value ->> 'id', '') IS NOT NULL
	AND NULLIF(annotation.value ->> 'id', '') IS NOT NULL
	AND legacy_range.start_offset IS NOT NULL
	AND legacy_range.end_offset IS NOT NULL
	AND legacy_range.end_offset > legacy_range.start_offset
	AND resolved_range.valid_start
	AND resolved_range.valid_end
ON CONFLICT ("id") DO NOTHING;
