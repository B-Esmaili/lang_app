import type { LessonDocument, WidgetInstance } from '$lib/features/lesson-editor/model';
import { transcriptTextSources } from '$lib/domain/transcribed-text';
import type { JSONContent } from '@tiptap/core';

export const COURSE_NOTE_KINDS = ['note', 'translation'] as const;
export const COURSE_NOTE_VISIBILITIES = ['private', 'course'] as const;
export const COURSE_NOTE_SOURCES = ['manual', 'ai', 'explanation', 'legacy'] as const;

export type CourseNoteKind = (typeof COURSE_NOTE_KINDS)[number];
export type CourseNoteVisibility = (typeof COURSE_NOTE_VISIBILITIES)[number];
export type CourseNoteSource = (typeof COURSE_NOTE_SOURCES)[number];

/** Ordinary notes are private; only authored translations may be course-visible. */
export function resolveCourseNoteVisibility(
	kind: CourseNoteKind,
	// Accept the removed legacy value so old callers still resolve it safely.
	requested: CourseNoteVisibility | 'shared'
): CourseNoteVisibility {
	if (kind === 'note') return 'private';
	return requested === 'course' ? 'course' : 'private';
}

function legacyAnnotationContainer(widget: WidgetInstance): unknown {
	if (widget.type !== 'language.passage') return null;
	return (widget.content as { annotations?: unknown }).annotations;
}

function isLegacyAnnotationWithNote(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value) && 'note' in value;
}

function containsLegacyAnnotationNote(value: unknown): boolean {
	return Array.isArray(value)
		? value.some(isLegacyAnnotationWithNote)
		: isLegacyAnnotationWithNote(value);
}

/** Removes pre-consolidation annotation notes before lesson content is sent to a client. */
export function withoutLegacyAnnotationNotes(document: LessonDocument): LessonDocument {
	const containsLegacyNote = document.frames.some((frame) =>
		Object.values(frame.slots).some((widgets) =>
			widgets.some((widget) => containsLegacyAnnotationNote(legacyAnnotationContainer(widget)))
		)
	);
	if (!containsLegacyNote) return document;

	const sanitized = structuredClone(document);
	for (const frame of sanitized.frames) {
		for (const widgets of Object.values(frame.slots)) {
			for (const widget of widgets) {
				const annotations = legacyAnnotationContainer(widget);
				if (Array.isArray(annotations)) {
					for (const annotation of annotations) {
						if (isLegacyAnnotationWithNote(annotation)) delete annotation.note;
					}
				} else if (isLegacyAnnotationWithNote(annotations)) {
					delete annotations.note;
				}
			}
		}
	}
	return sanitized;
}

export type CourseNote = {
	id: string;
	courseId: string;
	lessonId: string;
	authorId: string;
	authorName: string;
	kind: CourseNoteKind;
	visibility: CourseNoteVisibility;
	source: CourseNoteSource;
	anchorKey: string;
	anchorText: string;
	anchors: CourseNoteAnchor[];
	body: string;
	language: string | null;
	createdAt: string;
	updatedAt: string;
};

export type CourseNoteAnchor = {
	key: string;
	text: string;
	frameId?: string;
	widgetId?: string;
	sourceKey?: string;
	occurrence?: number;
	sourceLanguage?: string;
	sourceDirection?: 'auto' | 'ltr' | 'rtl';
	position?: number;
	start?: number;
	end?: number;
	prefix?: string;
	suffix?: string;
};

export type CourseSentence = {
	id: string;
	text: string;
	widgetId: string;
	frameId: string;
	sourceKey: string;
	occurrence: number;
	language: string;
	direction: 'auto' | 'ltr' | 'rtl';
	position: number;
	start: number;
	end: number;
	prefix: string;
	suffix: string;
};

export function normalizeNoteAnchor(text: string): string {
	return text.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function noteAnchorKey(sentences: readonly string[]): string {
	const normalized = sentences.map(normalizeNoteAnchor).filter(Boolean).join('\n');
	let left = 0xdeadbeef;
	let right = 0x41c6ce57;
	for (let index = 0; index < normalized.length; index += 1) {
		const code = normalized.charCodeAt(index);
		left = Math.imul(left ^ code, 0x9e3779b1);
		right = Math.imul(right ^ code, 0x5bd1e995);
	}
	left =
		Math.imul(left ^ (left >>> 16), 0x85ebca6b) ^ Math.imul(right ^ (right >>> 13), 0xc2b2ae35);
	right =
		Math.imul(right ^ (right >>> 16), 0x85ebca6b) ^ Math.imul(left ^ (left >>> 13), 0xc2b2ae35);
	return `sentence.${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0)
		.toString(16)
		.padStart(8, '0')}`;
}

/**
 * Produces a stable, location-aware identity for one sentence. Text alone is not
 * sufficient because a lesson can contain the same sentence more than once.
 */
export function sentenceAnchorKey(
	anchor: Pick<CourseNoteAnchor, 'text' | 'widgetId' | 'sourceKey' | 'occurrence'>
): string {
	return noteAnchorKey([
		anchor.widgetId ?? '',
		anchor.sourceKey ?? 'main',
		normalizeNoteAnchor(anchor.text),
		String(anchor.occurrence ?? 0)
	]);
}

export function courseSentenceAnchor(sentence: CourseSentence): CourseNoteAnchor {
	return {
		key: sentence.id,
		text: sentence.text,
		frameId: sentence.frameId,
		widgetId: sentence.widgetId,
		sourceKey: sentence.sourceKey,
		occurrence: sentence.occurrence,
		sourceLanguage: sentence.language,
		sourceDirection: sentence.direction,
		position: sentence.position,
		start: sentence.start,
		end: sentence.end,
		prefix: sentence.prefix,
		suffix: sentence.suffix
	};
}

/** Resolves a stable sentence unit from a plain-text offset inside one widget source. */
export function courseSentenceAtTextOffset(
	sentences: readonly CourseSentence[],
	widgetId: string,
	sourceKey: string,
	offset: number
): CourseSentence | undefined {
	if (!Number.isFinite(offset) || offset < 0) return undefined;
	return sentences.find(
		(sentence) =>
			sentence.widgetId === widgetId &&
			sentence.sourceKey === sourceKey &&
			sentence.start <= offset &&
			offset < sentence.end
	);
}

export function segmentCourseSentences(text: string, language = 'en'): string[] {
	return segmentCourseSentenceRanges(text, language).map(({ text: sentence }) => sentence);
}

export function segmentCourseSentenceRanges(
	text: string,
	language = 'en'
): Array<{ text: string; start: number; end: number }> {
	const normalized = text.normalize('NFC').replace(/\r\n?/gu, '\n');
	if (!normalized) return [];
	if (typeof Intl.Segmenter === 'function') {
		let segmenter: Intl.Segmenter;
		try {
			segmenter = new Intl.Segmenter(language, { granularity: 'sentence' });
		} catch {
			segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
		}
		return [...segmenter.segment(normalized)].flatMap(({ segment, index }) => {
			const leading = segment.match(/^\s*/u)?.[0].length ?? 0;
			const trailing = segment.match(/\s*$/u)?.[0].length ?? 0;
			const start = index + leading;
			const end = index + segment.length - trailing;
			const sentence = normalizeNoteAnchor(normalized.slice(start, end));
			return sentence ? [{ text: sentence, start, end }] : [];
		});
	}
	const matcher =
		/[^.!?\u061f\u2026\u3002\uff01\uff1f]+[.!?\u061f\u2026\u3002\uff01\uff1f]+|[^.!?\u061f\u2026\u3002\uff01\uff1f]+$/gu;
	return [...normalized.matchAll(matcher)].flatMap((match) => {
		const raw = match[0];
		const leading = raw.match(/^\s*/u)?.[0].length ?? 0;
		const trailing = raw.match(/\s*$/u)?.[0].length ?? 0;
		const start = (match.index ?? 0) + leading;
		const end = (match.index ?? 0) + raw.length - trailing;
		const sentence = normalizeNoteAnchor(normalized.slice(start, end));
		return sentence ? [{ text: sentence, start, end }] : [];
	});
}

export function lessonCourseSentences(document: LessonDocument): CourseSentence[] {
	const sentences: CourseSentence[] = [];
	let position = 0;
	for (const frame of document.frames) {
		for (const widgets of Object.values(frame.slots)) {
			for (const widget of widgets) {
				const language = widget.content.language ?? document.language;
				const direction = widget.content.direction ?? document.direction;
				for (const source of widgetSourceTexts(widget)) {
					const occurrences = new Map<string, number>();
					for (const sentence of segmentCourseSentenceRanges(source.text, language)) {
						const normalizedText = normalizeNoteAnchor(sentence.text);
						const occurrence = occurrences.get(normalizedText) ?? 0;
						occurrences.set(normalizedText, occurrence + 1);
						const anchor = {
							text: sentence.text,
							widgetId: widget.id,
							frameId: frame.id,
							sourceKey: source.key,
							occurrence,
							language,
							direction,
							position,
							start: sentence.start,
							end: sentence.end,
							prefix: normalizeNoteAnchor(
								source.text.slice(Math.max(0, sentence.start - 32), sentence.start)
							),
							suffix: normalizeNoteAnchor(source.text.slice(sentence.end, sentence.end + 32))
						};
						sentences.push({
							...anchor,
							id: sentenceAnchorKey(anchor)
						});
						position += 1;
					}
				}
			}
		}
	}
	return sentences;
}

export function chunkCourseSentences<T>(sentences: readonly T[], size = 5): T[][] {
	const chunkSize = Math.max(1, Math.floor(size));
	const chunks: T[][] = [];
	for (let index = 0; index < sentences.length; index += chunkSize) {
		chunks.push(sentences.slice(index, index + chunkSize));
	}
	return chunks;
}

type WidgetSourceText = { key: string; text: string };

function widgetSourceTexts(widget: WidgetInstance): WidgetSourceText[] {
	switch (widget.type) {
		case 'language.passage':
			return [{ key: 'passage', text: widget.content.text }];
		case 'language.audio': {
			const snapshot = widget.content.transcribedText;
			if (!snapshot) return [{ key: 'transcript', text: widget.content.transcript }];
			if (snapshot.alignment === 'synced' && snapshot.tokens.length) {
				return transcriptTextSources(snapshot.tokens).map(({ key, text }) => ({ key, text }));
			}
			return [{ key: 'transcript', text: snapshot.text }];
		}
		case 'language.response':
			return [{ key: 'prompt', text: widget.content.prompt }];
		case 'language.vocabulary':
			return widget.content.entries.flatMap((entry) => [
				{ key: `entry.${entry.id}.definition`, text: entry.definition },
				...(entry.example ? [{ key: `entry.${entry.id}.example`, text: entry.example }] : [])
			]);
		case 'language.pronunciation':
			return [{ key: 'target', text: widget.content.targetText || widget.content.prompt }];
		case 'content.rich-text':
		case 'content.callout':
		case 'content.quiz':
		case 'content.vocabulary':
			return [{ key: 'document', text: richTextPlainText(widget.content.document) }];
		default:
			return [];
	}
}

function richTextPlainText(node: JSONContent): string {
	if (node.type === 'text') return node.text ?? '';
	if (node.type === 'hardBreak') return '\n';
	const pieces = (node.content ?? []).map((child) => richTextPlainText(child));
	return node.type === 'paragraph' ? `${pieces.join('')}\n` : pieces.join('');
}
