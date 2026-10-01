import { createHash } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, max, or } from 'drizzle-orm';
import {
	normalizeCourseMediaResourceName,
	type CourseMediaResource
} from '$lib/domain/course-media-resource';
import { TranscribedText } from '$lib/domain/transcribed-text';
import { MEDIA_ASSET_KINDS, type MediaAssetKind } from '$lib/features/media-manager/model';
import {
	BLANK_FRAME_TEMPLATE,
	READ_AND_RESPOND_TEMPLATE,
	type LessonDocument,
	type TemplateDefinition
} from '$lib/features/lesson-editor/model';
import {
	COURSE_STATUSES,
	COURSE_NOTE_KINDS,
	COURSE_NOTE_SOURCES,
	COURSE_NOTE_VISIBILITIES,
	courseSentenceAnchor,
	createBlankLessonDocument,
	lessonCourseSentences,
	normalizeNoteAnchor,
	noteAnchorKey,
	resolveCourseNoteVisibility,
	withoutLegacyAnnotationNotes,
	type CourseBookmark,
	type CourseBuilderData,
	type CourseComment,
	type CourseLessonRecord,
	type CourseNote,
	type CourseNoteAnchor,
	type CourseNoteKind,
	type CourseNoteSource,
	type CourseNoteVisibility,
	type CourseStatus,
	type CourseSummary,
	type LessonTemplateRecord
} from '$lib/features/course-builder';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { mediaAsset } from '$lib/server/db/media.schema';
import {
	course,
	courseBookmark,
	courseComment,
	courseEnrollment,
	courseLesson,
	courseMediaResource,
	courseNote,
	lessonTemplate
} from '$lib/server/db/course.schema';
import { looksLikeMp3 } from '$lib/server/deepgram';
import { listMediaLibrary } from '$lib/server/media-library';
import { isUploadedMediaSource, readStoredMediaFile } from '$lib/server/media-storage';
import { transcribeMp3WithCache } from '$lib/server/transcriptions';
import {
	CourseContentError,
	parseLessonDocument,
	parseTemplateDefinition,
	parseTextDirection
} from '$lib/server/course-content';

export type AppRole = 'admin' | 'teacher' | 'student';
export type CourseViewer = { id: string; role: AppRole };

export class CourseServiceError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'CourseServiceError';
	}
}

export async function listCourses(viewer: CourseViewer): Promise<CourseSummary[]> {
	const selected = {
		id: course.id,
		ownerId: course.ownerId,
		ownerName: user.name,
		title: course.title,
		description: course.description,
		subject: course.subject,
		status: course.status,
		language: course.language,
		direction: course.direction,
		accent: course.accent,
		createdAt: course.createdAt,
		updatedAt: course.updatedAt
	};

	const rows =
		viewer.role === 'student'
			? await db
					.select(selected)
					.from(course)
					.innerJoin(user, eq(course.ownerId, user.id))
					.innerJoin(
						courseEnrollment,
						and(
							eq(courseEnrollment.courseId, course.id),
							eq(courseEnrollment.userId, viewer.id),
							eq(courseEnrollment.status, 'active')
						)
					)
					.where(eq(course.status, 'published'))
					.orderBy(desc(course.updatedAt))
			: await db
					.select(selected)
					.from(course)
					.innerJoin(user, eq(course.ownerId, user.id))
					.where(viewer.role === 'admin' ? undefined : eq(course.ownerId, viewer.id))
					.orderBy(desc(course.updatedAt));

	if (rows.length === 0) return [];
	const counts = await db
		.select({ courseId: courseLesson.courseId, value: count(courseLesson.id) })
		.from(courseLesson)
		.where(
			inArray(
				courseLesson.courseId,
				rows.map((row) => row.id)
			)
		)
		.groupBy(courseLesson.courseId);
	const countByCourse = new Map(counts.map((entry) => [entry.courseId, Number(entry.value)]));
	return rows.map((row) => serializeCourse(row, countByCourse.get(row.id) ?? 0));
}

export async function getCourseBuilderData(
	courseId: string,
	viewer: CourseViewer
): Promise<CourseBuilderData> {
	const row = await accessibleCourse(courseId, viewer, viewer.role !== 'student');
	const lessons = await db
		.select()
		.from(courseLesson)
		.where(eq(courseLesson.courseId, courseId))
		.orderBy(asc(courseLesson.position), asc(courseLesson.createdAt));
	const templates = await listLessonTemplates(viewer);
	const resources = await listCourseMediaResources(courseId, viewer);
	const notes = await visibleCourseNotes(courseId, viewer);
	const mediaLibrary = viewer.role === 'student' ? undefined : await listMediaLibrary(viewer);
	return {
		course: serializeCourse(row, lessons.length),
		lessons: lessons.map(serializeLesson),
		notes,
		templates,
		resources,
		...(mediaLibrary
			? { availableMedia: mediaLibrary.assets, availableMediaFolders: mediaLibrary.folders }
			: {})
	};
}

/** Return the viewer's private notes plus author-published course translations. */
export async function listCourseNotes(
	courseId: string,
	viewer: CourseViewer
): Promise<CourseNote[]> {
	await accessibleCourse(courseId, viewer, false);
	return visibleCourseNotes(courseId, viewer);
}

/** Create a sentence-anchored note after resolving every anchor against the saved lesson. */
export async function createCourseNote(
	courseId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseNote> {
	await accessibleCourse(courseId, viewer, false);
	const prepared = await prepareCourseNote(courseId, viewer, input);
	if (prepared.visibility === 'course') {
		await accessibleCourse(courseId, viewer, true);
	}
	const [created] = await db
		.insert(courseNote)
		.values({ id: entityId('course-note'), courseId, authorId: viewer.id, ...prepared })
		.returning();
	return serializeCreatedCourseNote(created, viewer.id);
}

/**
 * Create or replace the authored translation for one canonical sentence/range and language.
 * Used by both manual author translations and the batched AI translation route.
 */
export async function upsertCourseTranslationNote(
	courseId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseNote> {
	await requireCourseAuthor(courseId, viewer);
	const source = input.source === 'ai' ? 'ai' : 'manual';
	const prepared = await prepareCourseNote(courseId, viewer, {
		...input,
		kind: 'translation',
		visibility: 'course',
		source
	});
	const [saved] = await db
		.insert(courseNote)
		.values({ id: entityId('course-note'), courseId, authorId: viewer.id, ...prepared })
		.onConflictDoUpdate({
			target: courseNote.translationIdentity,
			set: {
				authorId: viewer.id,
				anchorText: prepared.anchorText,
				anchors: prepared.anchors,
				body: prepared.body,
				source,
				updatedAt: new Date()
			}
		})
		.returning();
	return serializeCreatedCourseNote(saved, viewer.id);
}

export async function deleteCourseNote(
	courseId: string,
	noteId: string,
	viewer: CourseViewer
): Promise<void> {
	const parent = await accessibleCourse(courseId, viewer, false);
	const [existing] = await db
		.select({
			id: courseNote.id,
			authorId: courseNote.authorId,
			kind: courseNote.kind,
			visibility: courseNote.visibility
		})
		.from(courseNote)
		.where(and(eq(courseNote.id, noteId), eq(courseNote.courseId, courseId)))
		.limit(1);
	if (!existing) throw new CourseServiceError(404, 'Note not found.');
	const canModerateCourseTranslation =
		existing.kind === 'translation' &&
		existing.visibility === 'course' &&
		(viewer.role === 'admin' || (viewer.role === 'teacher' && parent.ownerId === viewer.id));
	if (existing.authorId !== viewer.id && !canModerateCourseTranslation) {
		throw new CourseServiceError(403, 'You do not have permission to delete this note.');
	}
	await db.transaction(async (transaction) => {
		await transaction.delete(courseNote).where(eq(courseNote.id, noteId));
		if (noteId.startsWith('legacy.bookmark.')) {
			await transaction
				.delete(courseBookmark)
				.where(eq(courseBookmark.id, noteId.slice('legacy.bookmark.'.length)));
		} else if (noteId.startsWith('legacy.comment.')) {
			await transaction
				.delete(courseComment)
				.where(eq(courseComment.id, noteId.slice('legacy.comment.'.length)));
		}
	});
}

/** Assert that a viewer can author course-level material such as translations. */
export async function requireCourseAuthor(courseId: string, viewer: CourseViewer): Promise<void> {
	await accessibleCourse(courseId, viewer, true);
}

export async function listCourseBookmarks(
	courseId: string,
	viewer: CourseViewer
): Promise<CourseBookmark[]> {
	await accessibleCourse(courseId, viewer, false);
	const rows = await db
		.select()
		.from(courseBookmark)
		.where(and(eq(courseBookmark.courseId, courseId), eq(courseBookmark.userId, viewer.id)))
		.orderBy(desc(courseBookmark.createdAt));
	return rows.map((row) => ({
		id: row.id,
		courseId: row.courseId,
		lessonId: row.lessonId,
		note: row.note,
		createdAt: row.createdAt.toISOString()
	}));
}

export async function createCourseBookmark(
	courseId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseBookmark> {
	await accessibleCourse(courseId, viewer, false);
	const lessonId = requiredText(input.lessonId, 'Lesson ID', 200);
	const note = optionalText(input.note, 1_000) ?? '';
	const [lesson] = await db
		.select({ id: courseLesson.id })
		.from(courseLesson)
		.where(and(eq(courseLesson.id, lessonId), eq(courseLesson.courseId, courseId)))
		.limit(1);
	if (!lesson) throw new CourseServiceError(404, 'Lesson not found in this course.');
	const created = await db.transaction(async (transaction) => {
		const [bookmark] = await transaction
			.insert(courseBookmark)
			.values({ id: entityId('course-bookmark'), courseId, lessonId, userId: viewer.id, note })
			.returning();
		await transaction.insert(courseNote).values({
			id: `legacy.bookmark.${bookmark.id}`,
			courseId,
			lessonId,
			authorId: viewer.id,
			kind: 'note',
			visibility: 'private',
			source: 'legacy',
			anchorKey: `legacy.bookmark.${bookmark.id}`,
			anchorText: '',
			anchors: [],
			body: note.trim() || 'Saved lesson',
			createdAt: bookmark.createdAt,
			updatedAt: bookmark.createdAt
		});
		return bookmark;
	});
	return {
		id: created.id,
		courseId: created.courseId,
		lessonId: created.lessonId,
		note: created.note,
		createdAt: created.createdAt.toISOString()
	};
}

export async function deleteCourseBookmark(
	courseId: string,
	bookmarkId: string,
	viewer: CourseViewer
): Promise<void> {
	await accessibleCourse(courseId, viewer, false);
	await db.transaction(async (transaction) => {
		const [deleted] = await transaction
			.delete(courseBookmark)
			.where(
				and(
					eq(courseBookmark.id, bookmarkId),
					eq(courseBookmark.courseId, courseId),
					eq(courseBookmark.userId, viewer.id)
				)
			)
			.returning({ id: courseBookmark.id });
		if (!deleted) throw new CourseServiceError(404, 'Bookmark not found.');
		await transaction.delete(courseNote).where(eq(courseNote.id, `legacy.bookmark.${bookmarkId}`));
	});
}

export async function listCourseComments(
	courseId: string,
	viewer: CourseViewer
): Promise<CourseComment[]> {
	await accessibleCourse(courseId, viewer, false);
	const rows = await db
		.select({
			id: courseComment.id,
			lessonId: courseComment.lessonId,
			anchorText: courseComment.anchorText,
			body: courseComment.body,
			authorName: user.name,
			createdAt: courseComment.createdAt
		})
		.from(courseComment)
		.innerJoin(user, eq(courseComment.userId, user.id))
		.where(and(eq(courseComment.courseId, courseId), eq(courseComment.userId, viewer.id)))
		.orderBy(desc(courseComment.createdAt));
	return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function createCourseComment(
	courseId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseComment> {
	await accessibleCourse(courseId, viewer, false);
	const lessonId = requiredText(input.lessonId, 'Lesson ID', 200);
	const anchorText = requiredText(input.anchorText, 'Selected text', 500);
	const body = requiredText(input.body, 'Comment', 2_000);
	const [lesson] = await db
		.select({ id: courseLesson.id })
		.from(courseLesson)
		.where(and(eq(courseLesson.id, lessonId), eq(courseLesson.courseId, courseId)))
		.limit(1);
	if (!lesson) throw new CourseServiceError(404, 'Lesson not found in this course.');
	const created = await db.transaction(async (transaction) => {
		const [comment] = await transaction
			.insert(courseComment)
			.values({
				id: entityId('course-comment'),
				courseId,
				lessonId,
				userId: viewer.id,
				anchorText,
				body
			})
			.returning();
		await transaction.insert(courseNote).values({
			id: `legacy.comment.${comment.id}`,
			courseId,
			lessonId,
			authorId: viewer.id,
			kind: 'note',
			visibility: 'private',
			source: 'legacy',
			anchorKey: `legacy.comment.${comment.id}`,
			anchorText,
			anchors: [{ key: `legacy.comment.${comment.id}`, text: anchorText }],
			body,
			createdAt: comment.createdAt,
			updatedAt: comment.createdAt
		});
		return comment;
	});
	const [author] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, viewer.id))
		.limit(1);
	return {
		id: created.id,
		lessonId: created.lessonId,
		anchorText: created.anchorText,
		body: created.body,
		authorName: author?.name ?? 'Learner',
		createdAt: created.createdAt.toISOString()
	};
}

export async function listCourseMediaResources(
	courseId: string,
	viewer: CourseViewer
): Promise<CourseMediaResource[]> {
	await accessibleCourse(courseId, viewer, viewer.role !== 'student');
	return courseMediaResources(courseId);
}

export async function createCourseMediaResource(
	courseId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseMediaResource> {
	await accessibleCourse(courseId, viewer, true);
	const mediaId = requiredText(input.mediaId, 'Media ID', 200);
	const rawName = requiredText(input.name, 'Resource name', 120);
	const name = normalizeCourseMediaResourceName(rawName);
	if (!name) throw new CourseServiceError(400, 'Resource names need letters or numbers.');
	const [asset] = await db
		.select()
		.from(mediaAsset)
		.where(
			viewer.role === 'admin'
				? eq(mediaAsset.id, mediaId)
				: and(eq(mediaAsset.id, mediaId), eq(mediaAsset.ownerId, viewer.id))
		)
		.limit(1);
	if (!asset) throw new CourseServiceError(404, 'Media item not found.');
	const [byName, byMedia] = await Promise.all([
		db
			.select({ id: courseMediaResource.id })
			.from(courseMediaResource)
			.where(and(eq(courseMediaResource.courseId, courseId), eq(courseMediaResource.name, name)))
			.limit(1),
		db
			.select({ id: courseMediaResource.id })
			.from(courseMediaResource)
			.where(
				and(eq(courseMediaResource.courseId, courseId), eq(courseMediaResource.mediaId, mediaId))
			)
			.limit(1)
	]);
	if (byName[0])
		throw new CourseServiceError(409, 'That normalized resource name is already in use.');
	if (byMedia[0])
		throw new CourseServiceError(409, 'This media item is already imported into the course.');
	const id = entityId('course-media-resource');
	await db.insert(courseMediaResource).values({ id, courseId, mediaId, name });
	const resource = await courseMediaResourceById(courseId, id);
	if (!resource) throw new CourseServiceError(500, 'The media resource could not be created.');
	await touchCourse(courseId);
	return resource;
}

export async function deleteCourseMediaResource(
	courseId: string,
	resourceId: string,
	viewer: CourseViewer
): Promise<void> {
	await accessibleCourse(courseId, viewer, true);
	const [deleted] = await db
		.delete(courseMediaResource)
		.where(and(eq(courseMediaResource.id, resourceId), eq(courseMediaResource.courseId, courseId)))
		.returning({ id: courseMediaResource.id });
	if (!deleted) throw new CourseServiceError(404, 'Course media resource not found.');
	await touchCourse(courseId);
}

export async function transcribeCourseMediaResource(
	courseId: string,
	resourceId: string,
	viewer: CourseViewer
): Promise<CourseMediaResource> {
	const parent = await accessibleCourse(courseId, viewer, true);
	const resource = await courseMediaResourceById(courseId, resourceId);
	if (!resource) throw new CourseServiceError(404, 'Course media resource not found.');
	if (resource.kind !== 'audio') {
		throw new CourseServiceError(400, 'Only audio resources can generate highlight timings.');
	}
	if (!isUploadedMediaSource({ id: resource.mediaId, sourceUrl: resource.sourceUrl })) {
		throw new CourseServiceError(
			400,
			'Upload an MP3 to the media library before generating timings.'
		);
	}
	const bytes = await readStoredMediaFile(resource.mediaId);
	if (!bytes) throw new CourseServiceError(404, 'The uploaded media file is unavailable.');
	if (!looksLikeMp3(bytes)) {
		throw new CourseServiceError(415, 'Automatic timings currently require an MP3 audio resource.');
	}
	const transcription = await transcribeMp3WithCache(bytes, parent.language);
	await db
		.update(courseMediaResource)
		.set({ transcribedText: TranscribedText.rehydrate(transcription.transcribedText).toSnapshot() })
		.where(eq(courseMediaResource.id, resourceId));
	const updated = await courseMediaResourceById(courseId, resourceId);
	if (!updated) throw new CourseServiceError(500, 'The media resource could not be updated.');
	await touchCourse(courseId);
	return updated;
}

export async function createCourse(
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseBuilderData> {
	assertAuthor(viewer);
	const title = requiredText(input.title, 'Course title', 180);
	const description = optionalText(input.description, 2_000) ?? '';
	const language = validLanguage(input.language ?? 'en');
	const direction = parseTextDirection(input.direction);
	const courseId = entityId('course');
	const lessonId = entityId('lesson');
	const lessonTitle = direction === 'rtl' ? 'درس بدون عنوان' : 'Untitled lesson';
	const document = createBlankLessonDocument(lessonTitle, language, direction);
	document.id = lessonId;

	await db.transaction(async (transaction) => {
		await transaction.insert(course).values({
			id: courseId,
			ownerId: viewer.id,
			title,
			description,
			subject: 'language',
			status: 'draft',
			language,
			direction
		});
		await transaction.insert(courseLesson).values({
			id: lessonId,
			courseId,
			title: lessonTitle,
			position: 0,
			document
		});
	});

	return getCourseBuilderData(courseId, viewer);
}

export async function updateCourse(
	courseId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseSummary> {
	const existing = await accessibleCourse(courseId, viewer, true);
	const changes: Partial<typeof course.$inferInsert> = {};
	if ('title' in input) changes.title = requiredText(input.title, 'Course title', 180);
	if ('description' in input) changes.description = optionalText(input.description, 2_000) ?? '';
	if ('language' in input) changes.language = validLanguage(input.language);
	if ('direction' in input) changes.direction = parseTextDirection(input.direction);
	if ('status' in input) changes.status = validStatus(input.status);
	if ('accent' in input) changes.accent = requiredText(input.accent, 'Accent', 30);
	if (Object.keys(changes).length > 0) {
		changes.updatedAt = new Date();
		await db.update(course).set(changes).where(eq(course.id, courseId));
	}
	return serializeCourse(
		{ ...existing, ...changes, updatedAt: changes.updatedAt ?? existing.updatedAt },
		await lessonCount(courseId)
	);
}

export async function deleteCourse(courseId: string, viewer: CourseViewer): Promise<void> {
	await accessibleCourse(courseId, viewer, true);
	await db.delete(course).where(eq(course.id, courseId));
}

export async function createLesson(
	courseId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseLessonRecord> {
	const parent = await accessibleCourse(courseId, viewer, true);
	const title =
		optionalText(input.title, 180) ?? (parent.direction === 'rtl' ? 'درس جدید' : 'New lesson');
	const [positionRow] = await db
		.select({ value: max(courseLesson.position) })
		.from(courseLesson)
		.where(eq(courseLesson.courseId, courseId));
	const id = entityId('lesson');
	const document = createBlankLessonDocument(
		title,
		parent.language,
		parseTextDirection(parent.direction)
	);
	document.id = id;
	const [created] = await db
		.insert(courseLesson)
		.values({
			id,
			courseId,
			title,
			position: Number(positionRow?.value ?? -1) + 1,
			document
		})
		.returning();
	return serializeLesson(created);
}

export async function updateLesson(
	courseId: string,
	lessonId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<CourseLessonRecord> {
	await accessibleCourse(courseId, viewer, true);
	const [existing] = await db
		.select()
		.from(courseLesson)
		.where(and(eq(courseLesson.id, lessonId), eq(courseLesson.courseId, courseId)))
		.limit(1);
	if (!existing) throw new CourseServiceError(404, 'Lesson not found.');

	const changes: Partial<typeof courseLesson.$inferInsert> = {};
	if ('document' in input) {
		const document = withoutLegacyAnnotationNotes(
			contentError(() => parseLessonDocument(input.document))
		);
		document.id = lessonId;
		changes.document = document;
		changes.title = document.title;
	}
	if ('title' in input) {
		changes.title = requiredText(input.title, 'Lesson title', 180);
		changes.document = withoutLegacyAnnotationNotes({
			...((changes.document ?? existing.document) as LessonDocument),
			title: changes.title
		});
	}
	changes.updatedAt = new Date();
	const [updated] = await db
		.update(courseLesson)
		.set(changes)
		.where(eq(courseLesson.id, lessonId))
		.returning();
	await db.update(course).set({ updatedAt: new Date() }).where(eq(course.id, courseId));
	return serializeLesson(updated);
}

export async function deleteLesson(
	courseId: string,
	lessonId: string,
	viewer: CourseViewer
): Promise<void> {
	await accessibleCourse(courseId, viewer, true);
	if ((await lessonCount(courseId)) <= 1) {
		throw new CourseServiceError(409, 'A course must keep at least one lesson.');
	}
	const [deleted] = await db
		.delete(courseLesson)
		.where(and(eq(courseLesson.id, lessonId), eq(courseLesson.courseId, courseId)))
		.returning({ id: courseLesson.id });
	if (!deleted) throw new CourseServiceError(404, 'Lesson not found.');
	await db.update(course).set({ updatedAt: new Date() }).where(eq(course.id, courseId));
}

export async function listLessonTemplates(viewer: CourseViewer): Promise<LessonTemplateRecord[]> {
	await ensureSystemTemplates();
	const rows = await db
		.select()
		.from(lessonTemplate)
		.where(
			viewer.role === 'admin'
				? undefined
				: or(eq(lessonTemplate.isSystem, true), eq(lessonTemplate.ownerId, viewer.id))
		)
		.orderBy(desc(lessonTemplate.isSystem), asc(lessonTemplate.name));
	return rows.map(serializeTemplate);
}

export async function createLessonTemplate(
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<LessonTemplateRecord> {
	assertAuthor(viewer);
	const rawDefinition = contentError(() => parseTemplateDefinition(input.definition));
	const id = entityId('template');
	const definition = { ...rawDefinition, id };
	const name = requiredText(input.name ?? definition.name, 'Template name', 120);
	definition.name = name;
	const description = optionalText(input.description ?? definition.description, 500) ?? '';
	definition.description = description;
	const category = optionalText(input.category, 50) ?? 'language';
	const [created] = await db
		.insert(lessonTemplate)
		.values({ id, ownerId: viewer.id, name, description, category, definition, isSystem: false })
		.returning();
	return serializeTemplate(created);
}

export async function updateLessonTemplate(
	templateId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<LessonTemplateRecord> {
	assertAuthor(viewer);
	const existing = await editableTemplate(templateId, viewer);
	const changes: Partial<typeof lessonTemplate.$inferInsert> = {};
	if ('definition' in input) {
		const definition = contentError(() => parseTemplateDefinition(input.definition));
		definition.id = templateId;
		changes.definition = definition;
		changes.name = definition.name;
		changes.description = definition.description ?? '';
	}
	if ('name' in input) changes.name = requiredText(input.name, 'Template name', 120);
	if ('description' in input) changes.description = optionalText(input.description, 500) ?? '';
	if ('category' in input) changes.category = requiredText(input.category, 'Category', 50);
	const definition = { ...(changes.definition ?? existing.definition) };
	if (changes.name) definition.name = changes.name;
	if (changes.description !== undefined) definition.description = changes.description;
	changes.definition = definition;
	changes.updatedAt = new Date();
	const [updated] = await db
		.update(lessonTemplate)
		.set(changes)
		.where(eq(lessonTemplate.id, templateId))
		.returning();
	return serializeTemplate(updated);
}

export async function deleteLessonTemplate(
	templateId: string,
	viewer: CourseViewer
): Promise<void> {
	await editableTemplate(templateId, viewer);
	await db.delete(lessonTemplate).where(eq(lessonTemplate.id, templateId));
}

export async function ensureSystemTemplates(): Promise<void> {
	for (const definition of [BLANK_FRAME_TEMPLATE, READ_AND_RESPOND_TEMPLATE]) {
		await db
			.insert(lessonTemplate)
			.values({
				id: definition.id,
				ownerId: null,
				name: definition.name,
				description: definition.description ?? '',
				category: 'language',
				definition,
				isSystem: true
			})
			.onConflictDoUpdate({
				target: lessonTemplate.id,
				set: {
					name: definition.name,
					description: definition.description ?? '',
					category: 'language',
					definition,
					isSystem: true,
					updatedAt: new Date()
				}
			});
	}
}

type PreparedCourseNote = {
	lessonId: string;
	kind: CourseNoteKind;
	visibility: CourseNoteVisibility;
	source: CourseNoteSource;
	anchorKey: string;
	anchorText: string;
	anchors: CourseNoteAnchor[];
	body: string;
	language: string | null;
	translationIdentity: string | null;
};

async function visibleCourseNotes(courseId: string, viewer: CourseViewer): Promise<CourseNote[]> {
	const rows = await db
		.select({ note: courseNote, authorName: user.name })
		.from(courseNote)
		.innerJoin(user, eq(courseNote.authorId, user.id))
		.where(
			and(
				eq(courseNote.courseId, courseId),
				or(
					eq(courseNote.authorId, viewer.id),
					and(eq(courseNote.kind, 'translation'), eq(courseNote.visibility, 'course'))
				)
			)
		)
		.orderBy(desc(courseNote.updatedAt), desc(courseNote.createdAt));
	return rows.map(({ note, authorName }) => serializeCourseNote({ ...note, authorName }));
}

async function prepareCourseNote(
	courseId: string,
	viewer: CourseViewer,
	input: Record<string, unknown>
): Promise<PreparedCourseNote> {
	const lessonId = requiredText(input.lessonId, 'Lesson ID', 200);
	const [lesson] = await db
		.select({ document: courseLesson.document })
		.from(courseLesson)
		.where(and(eq(courseLesson.id, lessonId), eq(courseLesson.courseId, courseId)))
		.limit(1);
	if (!lesson) throw new CourseServiceError(404, 'Lesson not found in this course.');

	const kind = validCourseNoteKind(input.kind ?? 'note');
	const requestedVisibility = validCourseNoteVisibility(input.visibility ?? 'private');
	const visibility = resolveCourseNoteVisibility(kind, requestedVisibility);
	const source = validCourseNoteSource(input.source ?? 'manual');
	if (visibility === 'course' && viewer.role === 'student') {
		throw new CourseServiceError(403, 'Only course authors can publish translations.');
	}
	const anchors = canonicalCourseNoteAnchors(input.anchors, lesson.document as LessonDocument);
	const language =
		input.language === undefined || input.language === null || input.language === ''
			? null
			: validLanguage(input.language);
	if (kind === 'translation' && !language) {
		throw new CourseServiceError(400, 'A translation target language is required.');
	}
	const body = requiredText(input.body, kind === 'translation' ? 'Translation' : 'Note', 20_000);
	const anchorKey =
		anchors.length === 1 ? anchors[0].key : noteAnchorKey(anchors.map((anchor) => anchor.key));
	return {
		lessonId,
		kind,
		visibility,
		source,
		anchorKey,
		anchorText: anchors.map((anchor) => anchor.text).join(' '),
		anchors,
		body,
		language,
		translationIdentity:
			kind === 'translation' && visibility === 'course'
				? createHash('sha256')
						.update(JSON.stringify({ courseId, lessonId, anchorKey, language }))
						.digest('hex')
				: null
	};
}

function canonicalCourseNoteAnchors(value: unknown, document: LessonDocument): CourseNoteAnchor[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new CourseServiceError(400, 'Select at least one sentence for this note.');
	}
	if (value.length > 100) {
		throw new CourseServiceError(400, 'A note can cover at most 100 sentences.');
	}
	const sentences = lessonCourseSentences(document);
	const resolved = value.map((candidate) => {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			throw new CourseServiceError(400, 'Every note anchor must identify a sentence.');
		}
		const raw = candidate as Record<string, unknown>;
		const text = normalizeNoteAnchor(requiredText(raw.text, 'Selected sentence', 12_000));
		const key = typeof raw.key === 'string' ? raw.key : undefined;
		const frameId = optionalAnchorText(raw.frameId, 'Frame ID');
		const widgetId = optionalAnchorText(raw.widgetId, 'Widget ID');
		const position = optionalAnchorInteger(raw.position, 'Sentence position');
		const start = optionalAnchorInteger(raw.start, 'Sentence start');
		const end = optionalAnchorInteger(raw.end, 'Sentence end');
		const prefix = optionalNormalizedAnchorText(raw.prefix);
		const suffix = optionalNormalizedAnchorText(raw.suffix);
		const matches = sentences.filter((sentence) => {
			if (key && sentence.id === key) return normalizeNoteAnchor(sentence.text) === text;
			return (
				normalizeNoteAnchor(sentence.text) === text &&
				(frameId === undefined || sentence.frameId === frameId) &&
				(widgetId === undefined || sentence.widgetId === widgetId) &&
				(position === undefined || sentence.position === position) &&
				(start === undefined || sentence.start === start) &&
				(end === undefined || sentence.end === end) &&
				(prefix === undefined || sentence.prefix === prefix) &&
				(suffix === undefined || sentence.suffix === suffix)
			);
		});
		if (matches.length === 0) {
			throw new CourseServiceError(
				409,
				'The selected sentence no longer matches the saved lesson. Refresh and try again.'
			);
		}
		if (matches.length > 1) {
			throw new CourseServiceError(
				400,
				'This sentence occurs more than once. Include its widget and position in the anchor.'
			);
		}
		return courseSentenceAnchor(matches[0]);
	});

	const unique = new Map(resolved.map((anchor) => [anchor.key, anchor]));
	if (unique.size !== resolved.length) {
		throw new CourseServiceError(400, 'A sentence can only appear once in a note selection.');
	}
	return [...unique.values()].sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
}

async function serializeCreatedCourseNote(
	note: typeof courseNote.$inferSelect,
	authorId: string
): Promise<CourseNote> {
	const [author] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, authorId))
		.limit(1);
	return serializeCourseNote({ ...note, authorName: author?.name ?? 'Learner' });
}

function serializeCourseNote(
	row: typeof courseNote.$inferSelect & { authorName: string }
): CourseNote {
	return {
		id: row.id,
		courseId: row.courseId,
		lessonId: row.lessonId,
		authorId: row.authorId,
		authorName: row.authorName,
		kind: validStoredCourseNoteKind(row.kind),
		visibility: validStoredCourseNoteVisibility(row.visibility),
		source: validStoredCourseNoteSource(row.source),
		anchorKey: row.anchorKey,
		anchorText: row.anchorText,
		anchors: row.anchors,
		body: row.body,
		language: row.language,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

async function courseMediaResources(courseId: string): Promise<CourseMediaResource[]> {
	const rows = await db
		.select({
			id: courseMediaResource.id,
			name: courseMediaResource.name,
			mediaId: mediaAsset.id,
			mediaName: mediaAsset.name,
			kind: mediaAsset.kind,
			sourceUrl: mediaAsset.sourceUrl,
			mimeType: mediaAsset.mimeType,
			transcribedText: courseMediaResource.transcribedText,
			createdAt: courseMediaResource.createdAt,
			updatedAt: courseMediaResource.updatedAt
		})
		.from(courseMediaResource)
		.innerJoin(mediaAsset, eq(courseMediaResource.mediaId, mediaAsset.id))
		.where(eq(courseMediaResource.courseId, courseId))
		.orderBy(asc(courseMediaResource.name), asc(courseMediaResource.createdAt));
	return rows.map(serializeCourseMediaResource);
}

async function courseMediaResourceById(
	courseId: string,
	resourceId: string
): Promise<CourseMediaResource | null> {
	const [row] = await db
		.select({
			id: courseMediaResource.id,
			name: courseMediaResource.name,
			mediaId: mediaAsset.id,
			mediaName: mediaAsset.name,
			kind: mediaAsset.kind,
			sourceUrl: mediaAsset.sourceUrl,
			mimeType: mediaAsset.mimeType,
			transcribedText: courseMediaResource.transcribedText,
			createdAt: courseMediaResource.createdAt,
			updatedAt: courseMediaResource.updatedAt
		})
		.from(courseMediaResource)
		.innerJoin(mediaAsset, eq(courseMediaResource.mediaId, mediaAsset.id))
		.where(and(eq(courseMediaResource.courseId, courseId), eq(courseMediaResource.id, resourceId)))
		.limit(1);
	return row ? serializeCourseMediaResource(row) : null;
}

function serializeCourseMediaResource(row: {
	id: string;
	name: string;
	mediaId: string;
	mediaName: string;
	kind: string;
	sourceUrl: string;
	mimeType: string | null;
	transcribedText: CourseMediaResource['transcribedText'];
	createdAt: Date;
	updatedAt: Date;
}): CourseMediaResource {
	if (!MEDIA_ASSET_KINDS.includes(row.kind as MediaAssetKind)) {
		throw new CourseServiceError(500, 'A course resource has an unsupported media type.');
	}
	return {
		...row,
		kind: row.kind as MediaAssetKind,
		transcribedText: row.transcribedText
			? TranscribedText.rehydrate(row.transcribedText).toSnapshot()
			: null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

async function touchCourse(courseId: string): Promise<void> {
	await db.update(course).set({ updatedAt: new Date() }).where(eq(course.id, courseId));
}

async function accessibleCourse(courseId: string, viewer: CourseViewer, write: boolean) {
	const [row] = await db
		.select({
			id: course.id,
			ownerId: course.ownerId,
			ownerName: user.name,
			title: course.title,
			description: course.description,
			subject: course.subject,
			status: course.status,
			language: course.language,
			direction: course.direction,
			accent: course.accent,
			createdAt: course.createdAt,
			updatedAt: course.updatedAt
		})
		.from(course)
		.innerJoin(user, eq(course.ownerId, user.id))
		.where(eq(course.id, courseId))
		.limit(1);
	if (!row) throw new CourseServiceError(404, 'Course not found.');
	if (viewer.role === 'admin') return row;
	if (viewer.role === 'teacher' && row.ownerId === viewer.id) return row;
	if (!write && viewer.role === 'student' && row.status === 'published') {
		const [enrollment] = await db
			.select({ status: courseEnrollment.status })
			.from(courseEnrollment)
			.where(
				and(
					eq(courseEnrollment.courseId, courseId),
					eq(courseEnrollment.userId, viewer.id),
					eq(courseEnrollment.status, 'active')
				)
			)
			.limit(1);
		if (enrollment) return row;
	}
	throw new CourseServiceError(403, 'You do not have access to this course.');
}

async function editableTemplate(templateId: string, viewer: CourseViewer) {
	const [row] = await db
		.select()
		.from(lessonTemplate)
		.where(eq(lessonTemplate.id, templateId))
		.limit(1);
	if (!row) throw new CourseServiceError(404, 'Template not found.');
	if (row.isSystem)
		throw new CourseServiceError(403, 'Built-in templates cannot be changed. Duplicate it first.');
	if (viewer.role !== 'admin' && row.ownerId !== viewer.id) {
		throw new CourseServiceError(403, 'You do not have access to this template.');
	}
	return row;
}

function assertAuthor(viewer: CourseViewer) {
	if (viewer.role !== 'admin' && viewer.role !== 'teacher') {
		throw new CourseServiceError(403, 'Teacher or administrator access is required.');
	}
}

function serializeCourse(
	row: {
		id: string;
		ownerId: string;
		ownerName: string;
		title: string;
		description: string;
		subject: string;
		status: string;
		language: string;
		direction: string;
		accent: string;
		createdAt: Date;
		updatedAt: Date;
	},
	lessonTotal: number
): CourseSummary {
	return {
		...row,
		status: validStatus(row.status),
		direction: parseTextDirection(row.direction),
		lessonCount: lessonTotal,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

function serializeLesson(row: typeof courseLesson.$inferSelect): CourseLessonRecord {
	return {
		...row,
		document: withoutLegacyAnnotationNotes(row.document as LessonDocument),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

function serializeTemplate(row: typeof lessonTemplate.$inferSelect): LessonTemplateRecord {
	return {
		...row,
		definition: row.definition as TemplateDefinition,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

async function lessonCount(courseId: string) {
	const [result] = await db
		.select({ value: count(courseLesson.id) })
		.from(courseLesson)
		.where(eq(courseLesson.courseId, courseId));
	return Number(result?.value ?? 0);
}

function validStatus(value: unknown): CourseStatus {
	if (typeof value !== 'string' || !COURSE_STATUSES.includes(value as CourseStatus)) {
		throw new CourseServiceError(400, 'Course status must be draft, published, or archived.');
	}
	return value as CourseStatus;
}

function validCourseNoteKind(value: unknown): CourseNoteKind {
	if (typeof value !== 'string' || !COURSE_NOTE_KINDS.includes(value as CourseNoteKind)) {
		throw new CourseServiceError(400, 'Note kind must be note or translation.');
	}
	return value as CourseNoteKind;
}

function validCourseNoteVisibility(value: unknown): CourseNoteVisibility | 'shared' {
	if (value === 'shared') return 'shared';
	if (
		typeof value !== 'string' ||
		!COURSE_NOTE_VISIBILITIES.includes(value as CourseNoteVisibility)
	) {
		throw new CourseServiceError(400, 'Note visibility must be private or course.');
	}
	return value as CourseNoteVisibility;
}

function validCourseNoteSource(value: unknown): CourseNoteSource {
	if (typeof value !== 'string' || !COURSE_NOTE_SOURCES.includes(value as CourseNoteSource)) {
		throw new CourseServiceError(400, 'Note source is not supported.');
	}
	return value as CourseNoteSource;
}

function validStoredCourseNoteKind(value: string): CourseNoteKind {
	if (!COURSE_NOTE_KINDS.includes(value as CourseNoteKind)) {
		throw new CourseServiceError(500, 'A saved note has an unsupported kind.');
	}
	return value as CourseNoteKind;
}

function validStoredCourseNoteVisibility(value: string): CourseNoteVisibility {
	if (value === 'shared') return 'private';
	if (!COURSE_NOTE_VISIBILITIES.includes(value as CourseNoteVisibility)) {
		throw new CourseServiceError(500, 'A saved note has an unsupported visibility.');
	}
	return value as CourseNoteVisibility;
}

function validStoredCourseNoteSource(value: string): CourseNoteSource {
	if (!COURSE_NOTE_SOURCES.includes(value as CourseNoteSource)) {
		throw new CourseServiceError(500, 'A saved note has an unsupported source.');
	}
	return value as CourseNoteSource;
}

function validLanguage(value: unknown) {
	const language = requiredText(value, 'Language', 35);
	if (!/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/u.test(language)) {
		throw new CourseServiceError(400, 'Language must be a valid BCP 47 language tag.');
	}
	return language;
}

function optionalAnchorText(value: unknown, label: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	return requiredText(value, label, 200);
}

function optionalNormalizedAnchorText(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string' || value.length > 500) {
		throw new CourseServiceError(400, 'Sentence context is invalid or too long.');
	}
	return normalizeNoteAnchor(value);
}

function optionalAnchorInteger(value: unknown, label: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		throw new CourseServiceError(400, `${label} must be a non-negative integer.`);
	}
	return value;
}

function requiredText(value: unknown, label: string, maxLength: number) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new CourseServiceError(400, `${label} is required.`);
	}
	const result = value.trim();
	if (result.length > maxLength) throw new CourseServiceError(400, `${label} is too long.`);
	return result;
}

function optionalText(value: unknown, maxLength: number): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string' || value.length > maxLength) {
		throw new CourseServiceError(400, 'A text value is invalid or too long.');
	}
	return value.trim();
}

function entityId(prefix: string) {
	return `${prefix}.${crypto.randomUUID()}`;
}

function contentError<T>(callback: () => T): T {
	try {
		return callback();
	} catch (error) {
		if (error instanceof CourseContentError) throw new CourseServiceError(400, error.message);
		throw error;
	}
}
