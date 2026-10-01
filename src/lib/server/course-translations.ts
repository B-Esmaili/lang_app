import { createHash } from 'node:crypto';
import {
	normalizeNoteAnchor,
	type CourseNoteAnchor
} from '$lib/features/course-builder/course-notes';

export const COURSE_TRANSLATION_PROMPT_VERSION = 1;

export type CourseTranslationPromptItem = {
	id: string;
	text: string;
	prefix?: string;
	suffix?: string;
};

export type CourseTranslationResult = {
	id: string;
	translation: string;
};

export function courseTranslationCacheKey({
	courseId,
	sourceLanguage,
	targetLanguage,
	modelKey,
	anchor
}: {
	courseId: string;
	sourceLanguage: string;
	targetLanguage: string;
	modelKey: string;
	anchor: CourseNoteAnchor;
}): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				version: COURSE_TRANSLATION_PROMPT_VERSION,
				courseId,
				sourceLanguage: sourceLanguage.toLowerCase(),
				targetLanguage: targetLanguage.toLowerCase(),
				modelKey,
				text: normalizeNoteAnchor(anchor.text),
				prefix: normalizeNoteAnchor(anchor.prefix ?? ''),
				suffix: normalizeNoteAnchor(anchor.suffix ?? '')
			})
		)
		.digest('hex');
}

export function createCourseTranslationPrompt({
	items,
	sourceLanguage,
	targetLanguage
}: {
	items: readonly CourseTranslationPromptItem[];
	sourceLanguage: string;
	targetLanguage: string;
}): string {
	return [
		'You are translating sentence-sized course material for a language-learning product.',
		`Translate every item from ${sourceLanguage} into ${targetLanguage}.`,
		'Preserve meaning, tone, names, formatting, and technical terms.',
		'Use the optional surrounding context only to resolve ambiguity; do not translate or include that context.',
		'Return only valid JSON as an array of objects with exactly these string fields: "id" and "translation".',
		'Do not use Markdown fences. Return one object for every input id and keep each id unchanged.',
		'',
		JSON.stringify(items)
	].join('\n');
}

export function parseCourseTranslationResponse(
	value: string,
	expectedIds: readonly string[]
): CourseTranslationResult[] {
	const raw = value.trim().replace(/^```(?:json)?\s*|\s*```$/giu, '');
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error('The AI provider returned translations in an invalid format.');
	}

	const entries = Array.isArray(parsed)
		? parsed
		: parsed && typeof parsed === 'object' && 'translations' in parsed
			? (parsed as { translations?: unknown }).translations
			: null;
	if (!Array.isArray(entries)) {
		throw new Error('The AI provider did not return a translation list.');
	}

	const expected = new Set(expectedIds);
	const seen = new Set<string>();
	const results: CourseTranslationResult[] = [];
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
		const id = 'id' in entry && typeof entry.id === 'string' ? entry.id : '';
		const translation =
			'translation' in entry && typeof entry.translation === 'string'
				? entry.translation.trim()
				: '';
		if (!expected.has(id) || seen.has(id) || !translation || translation.length > 20_000) continue;
		seen.add(id);
		results.push({ id, translation });
	}
	if (results.length !== expected.size) {
		throw new Error('The AI provider omitted one or more requested translations.');
	}
	return expectedIds.map((id) => results.find((result) => result.id === id)!);
}
