import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import type { LessonDocument, TemplateDefinition } from '$lib/features/lesson-editor/model';
import type { CourseNoteAnchor } from '$lib/features/course-builder/course-notes';
import type { TranscribedTextSnapshot } from '$lib/domain/transcribed-text';
import { user } from './auth.schema';
import { mediaAsset } from './media.schema';

export const course = pgTable(
	'course',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		subject: text('subject').notNull().default('language'),
		status: text('status').notNull().default('draft'),
		language: text('language').notNull().default('en'),
		direction: text('direction').notNull().default('auto'),
		accent: text('accent').notNull().default('lavender'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('course_owner_id_idx').on(table.ownerId),
		index('course_status_idx').on(table.status),
		index('course_updated_at_idx').on(table.updatedAt)
	]
);

export const courseLesson = pgTable(
	'course_lesson',
	{
		id: text('id').primaryKey(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		position: integer('position').notNull().default(0),
		document: jsonb('document').$type<LessonDocument>().notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('course_lesson_course_id_idx').on(table.courseId),
		uniqueIndex('course_lesson_position_idx').on(table.courseId, table.position)
	]
);

/** A course-local alias for a reusable media item, with optional audio timing data. */
export const courseMediaResource = pgTable(
	'course_media_resource',
	{
		id: text('id').primaryKey(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		mediaId: text('media_id')
			.notNull()
			.references(() => mediaAsset.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		transcribedText: jsonb('transcribed_text').$type<TranscribedTextSnapshot>(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('course_media_resource_course_id_idx').on(table.courseId),
		index('course_media_resource_media_id_idx').on(table.mediaId),
		uniqueIndex('course_media_resource_course_name_idx').on(table.courseId, table.name),
		uniqueIndex('course_media_resource_course_media_idx').on(table.courseId, table.mediaId)
	]
);

export const lessonTemplate = pgTable(
	'lesson_template',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		category: text('category').notNull().default('language'),
		definition: jsonb('definition').$type<TemplateDefinition>().notNull(),
		isSystem: boolean('is_system').notNull().default(false),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('lesson_template_owner_id_idx').on(table.ownerId),
		index('lesson_template_category_idx').on(table.category),
		uniqueIndex('lesson_template_system_id_idx').on(table.id, table.isSystem)
	]
);

export const courseEnrollment = pgTable(
	'course_enrollment',
	{
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: text('status').notNull().default('active'),
		progress: integer('progress').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		primaryKey({ columns: [table.courseId, table.userId] }),
		index('course_enrollment_user_id_idx').on(table.userId)
	]
);

/** A learner-owned note pinned to a lesson in a course. */
export const courseBookmark = pgTable(
	'course_bookmark',
	{
		id: text('id').primaryKey(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		lessonId: text('lesson_id')
			.notNull()
			.references(() => courseLesson.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		note: text('note').notNull().default(''),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('course_bookmark_course_user_idx').on(table.courseId, table.userId),
		index('course_bookmark_lesson_idx').on(table.lessonId)
	]
);

/** Legacy private note storage retained while older clients migrate to courseNote. */
export const courseComment = pgTable(
	'course_comment',
	{
		id: text('id').primaryKey(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		lessonId: text('lesson_id')
			.notNull()
			.references(() => courseLesson.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		anchorText: text('anchor_text').notNull(),
		body: text('body').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('course_comment_course_lesson_idx').on(table.courseId, table.lessonId)]
);

/** The canonical sentence-anchored record for learner notes and authored translations. */
export const courseNote = pgTable(
	'course_note',
	{
		id: text('id').primaryKey(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		lessonId: text('lesson_id')
			.notNull()
			.references(() => courseLesson.id, { onDelete: 'cascade' }),
		authorId: text('author_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull().default('note'),
		visibility: text('visibility').notNull().default('private'),
		source: text('source').notNull().default('manual'),
		anchorKey: text('anchor_key').notNull(),
		anchorText: text('anchor_text').notNull(),
		anchors: jsonb('anchors').$type<CourseNoteAnchor[]>().notNull(),
		body: text('body').notNull(),
		language: text('language'),
		translationIdentity: text('translation_identity'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('course_note_course_lesson_idx').on(table.courseId, table.lessonId),
		index('course_note_author_idx').on(table.authorId),
		index('course_note_anchor_idx').on(table.lessonId, table.anchorKey),
		index('course_note_translation_idx').on(table.courseId, table.kind, table.language),
		uniqueIndex('course_note_translation_identity_idx').on(table.translationIdentity),
		check(
			'course_note_private_note_check',
			sql`${table.kind} <> 'note' OR ${table.visibility} = 'private'`
		)
	]
);

/** Content-addressed AI translations can be reused across courses and batch retries. */
export const courseTranslationCache = pgTable(
	'course_translation_cache',
	{
		key: text('key').primaryKey(),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		sourceText: text('source_text').notNull(),
		sourceLanguage: text('source_language').notNull(),
		targetLanguage: text('target_language').notNull(),
		modelKey: text('model_key').notNull(),
		translation: text('translation').notNull(),
		promptVersion: integer('prompt_version').notNull().default(1),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		lastUsedAt: timestamp('last_used_at').defaultNow().notNull()
	},
	(table) => [
		index('course_translation_cache_course_idx').on(table.courseId),
		index('course_translation_cache_languages_idx').on(
			table.courseId,
			table.sourceLanguage,
			table.targetLanguage
		)
	]
);

export const courseRelations = relations(course, ({ one, many }) => ({
	owner: one(user, { fields: [course.ownerId], references: [user.id] }),
	lessons: many(courseLesson),
	mediaResources: many(courseMediaResource),
	enrollments: many(courseEnrollment),
	bookmarks: many(courseBookmark),
	comments: many(courseComment),
	notes: many(courseNote)
}));

export const courseLessonRelations = relations(courseLesson, ({ one, many }) => ({
	course: one(course, { fields: [courseLesson.courseId], references: [course.id] }),
	notes: many(courseNote)
}));

export const courseMediaResourceRelations = relations(courseMediaResource, ({ one }) => ({
	course: one(course, { fields: [courseMediaResource.courseId], references: [course.id] }),
	media: one(mediaAsset, { fields: [courseMediaResource.mediaId], references: [mediaAsset.id] })
}));

export const lessonTemplateRelations = relations(lessonTemplate, ({ one }) => ({
	owner: one(user, { fields: [lessonTemplate.ownerId], references: [user.id] })
}));

export const courseEnrollmentRelations = relations(courseEnrollment, ({ one }) => ({
	course: one(course, { fields: [courseEnrollment.courseId], references: [course.id] }),
	user: one(user, { fields: [courseEnrollment.userId], references: [user.id] })
}));

export const courseBookmarkRelations = relations(courseBookmark, ({ one }) => ({
	course: one(course, { fields: [courseBookmark.courseId], references: [course.id] }),
	lesson: one(courseLesson, { fields: [courseBookmark.lessonId], references: [courseLesson.id] }),
	user: one(user, { fields: [courseBookmark.userId], references: [user.id] })
}));

export const courseCommentRelations = relations(courseComment, ({ one }) => ({
	course: one(course, { fields: [courseComment.courseId], references: [course.id] }),
	lesson: one(courseLesson, { fields: [courseComment.lessonId], references: [courseLesson.id] }),
	user: one(user, { fields: [courseComment.userId], references: [user.id] })
}));

export const courseNoteRelations = relations(courseNote, ({ one }) => ({
	course: one(course, { fields: [courseNote.courseId], references: [course.id] }),
	lesson: one(courseLesson, { fields: [courseNote.lessonId], references: [courseLesson.id] }),
	author: one(user, { fields: [courseNote.authorId], references: [user.id] })
}));
