UPDATE "course_note"
SET "visibility" = 'private'
WHERE "kind" = 'note' AND "visibility" IS DISTINCT FROM 'private';
--> statement-breakpoint
WITH "sanitized_lessons" AS (
	SELECT
		lesson."id",
		CASE
			WHEN jsonb_typeof(lesson."document" -> 'frames') = 'array' THEN
				jsonb_set(
					lesson."document",
					'{frames}',
					COALESCE(
						(
							SELECT jsonb_agg(
								CASE
									WHEN jsonb_typeof(frame.value -> 'slots') = 'object' THEN
										jsonb_set(
											frame.value,
											'{slots}',
											COALESCE(
												(
													SELECT jsonb_object_agg(
														slot.key,
														CASE
															WHEN jsonb_typeof(slot.value) = 'array' THEN
																COALESCE(
																	(
																		SELECT jsonb_agg(
																			CASE
														WHEN widget.value ->> 'type' = 'language.passage'
															AND jsonb_typeof(widget.value -> 'content' -> 'annotations') IN ('array', 'object') THEN
																jsonb_set(
																	widget.value,
																	'{content,annotations}',
																	CASE jsonb_typeof(widget.value -> 'content' -> 'annotations')
																		WHEN 'array' THEN
																			COALESCE(
																				(
																					SELECT jsonb_agg(
																						CASE
																							WHEN jsonb_typeof(annotation.value) = 'object' THEN annotation.value - 'note'
																							ELSE annotation.value
																						END
																						ORDER BY annotation.ordinality
																					)
																					FROM jsonb_array_elements(
																						widget.value -> 'content' -> 'annotations'
																					) WITH ORDINALITY AS annotation(value, ordinality)
																				),
																				'[]'::jsonb
																			)
																		WHEN 'object' THEN
																			(widget.value -> 'content' -> 'annotations') - 'note'
																	END
																)
																				ELSE widget.value
																			END
																			ORDER BY widget.ordinality
																		)
																		FROM jsonb_array_elements(slot.value)
																			WITH ORDINALITY AS widget(value, ordinality)
																	),
																	'[]'::jsonb
																)
															ELSE slot.value
														END
													)
													FROM jsonb_each(frame.value -> 'slots') AS slot(key, value)
												),
												'{}'::jsonb
											)
										)
									ELSE frame.value
								END
								ORDER BY frame.ordinality
							)
							FROM jsonb_array_elements(lesson."document" -> 'frames')
								WITH ORDINALITY AS frame(value, ordinality)
						),
						'[]'::jsonb
					)
				)
			ELSE lesson."document"
		END AS "document"
	FROM "course_lesson" AS lesson
	WHERE jsonb_path_exists(
		lesson."document",
		'$.frames[*].slots.*[*] ? (@.type == "language.passage").content.annotations[*].note'
	)
)
UPDATE "course_lesson" AS lesson
SET "document" = sanitized."document"
FROM "sanitized_lessons" AS sanitized
WHERE lesson."id" = sanitized."id";
