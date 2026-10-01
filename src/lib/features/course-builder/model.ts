import {
	BLANK_FRAME_TEMPLATE,
	LESSON_DOCUMENT_VERSION,
	createDefaultFrameAppearance,
	type LessonDocument,
	type TemplateDefinition,
	type TextDirection
} from '$lib/features/lesson-editor/model';
import type { CourseMediaResource } from '$lib/domain/course-media-resource';
import type { MediaAsset, MediaFolder } from '$lib/features/media-manager/model';
import type { CourseNote } from './course-notes';

export const COURSE_STATUSES = ['draft', 'published', 'archived'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];
export type CourseSubject = 'language' | (string & {});

export interface CourseSummary {
	id: string;
	ownerId: string;
	ownerName: string;
	title: string;
	description: string;
	subject: CourseSubject;
	status: CourseStatus;
	language: string;
	direction: TextDirection;
	accent: string;
	lessonCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface CourseLessonRecord {
	id: string;
	courseId: string;
	title: string;
	position: number;
	document: LessonDocument;
	createdAt: string;
	updatedAt: string;
}

export interface CourseBookmark {
	id: string;
	courseId: string;
	lessonId: string;
	note: string;
	createdAt: string;
}

export interface CourseComment {
	id: string;
	lessonId: string;
	anchorText: string;
	body: string;
	authorName: string;
	createdAt: string;
}

export interface CourseBuilderData {
	course: CourseSummary;
	lessons: CourseLessonRecord[];
	notes: CourseNote[];
	templates: LessonTemplateRecord[];
	resources: CourseMediaResource[];
	/** Present only while authoring; learners receive only the imported resources. */
	availableMedia?: MediaAsset[];
	/** Folder tree for browsing author-owned media while importing course resources. */
	availableMediaFolders?: MediaFolder[];
}

export interface LessonTemplateRecord {
	id: string;
	ownerId: string | null;
	name: string;
	description: string;
	category: string;
	definition: TemplateDefinition;
	isSystem: boolean;
	createdAt: string;
	updatedAt: string;
}

export type CreateCourseInput = {
	title: string;
	description?: string;
	language?: string;
	direction?: TextDirection;
};

export function createEntityId(prefix: string): string {
	const id =
		globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return `${prefix}.${id}`;
}

export function createBlankLessonDocument(
	title = 'Untitled lesson',
	language = 'en',
	direction: TextDirection = 'auto'
): LessonDocument {
	return {
		schemaVersion: LESSON_DOCUMENT_VERSION,
		id: createEntityId('lesson'),
		title,
		description: '',
		language,
		direction,
		frames: [
			{
				id: createEntityId('frame'),
				templateId: BLANK_FRAME_TEMPLATE.id,
				title: '',
				appearance: createDefaultFrameAppearance(),
				slots: { content: [] }
			}
		]
	};
}

export function cloneTemplateDefinition(
	template: TemplateDefinition,
	name = `${template.name} copy`
) {
	const id = createEntityId('template');
	return {
		...structuredClone(template),
		id,
		name
	} satisfies TemplateDefinition;
}
