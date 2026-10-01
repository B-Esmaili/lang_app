import { and, eq, inArray } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';
import { nativeLanguages, nativeLanguageCodes } from '$lib/domain/native-languages';
import {
	courseSentenceAnchor,
	lessonCourseSentences,
	normalizeNoteAnchor,
	type CourseNote
} from '$lib/features/course-builder/course-notes';
import { completeAiChat, AiServiceError } from '$lib/server/ai-service';
import {
	getUserTranslationServiceOptions,
	UserAiCredentialError
} from '$lib/server/ai-user-credentials';
import {
	apiFailure,
	ApiRequestError,
	assertSameOrigin,
	readJsonObject,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';
import {
	COURSE_TRANSLATION_PROMPT_VERSION,
	courseTranslationCacheKey,
	createCourseTranslationPrompt,
	parseCourseTranslationResponse,
	type CourseTranslationPromptItem,
	type CourseTranslationResult
} from '$lib/server/course-translations';
import {
	requireCourseAuthor,
	upsertCourseTranslationNote,
	type CourseViewer
} from '$lib/server/courses';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth.schema';
import { courseLesson, courseTranslationCache } from '$lib/server/db/course.schema';

const MAX_SENTENCES_PER_REQUEST = 8;
const MAX_SOURCE_CHARACTERS = 12_000;

type RequestedSentence = { id: string; text: string };

export const POST: RequestHandler = async ({ fetch, locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const viewer = requireViewer(locals);
		const courseId = requireRouteParam(params.courseId, 'Course ID');
		await requireCourseAuthor(courseId, viewer);
		const body = await readJsonObject(request);
		const lessonId = requiredString(body.lessonId, 'Lesson ID', 200);
		const [lesson] = await db
			.select({ document: courseLesson.document })
			.from(courseLesson)
			.where(and(eq(courseLesson.id, lessonId), eq(courseLesson.courseId, courseId)))
			.limit(1);
		if (!lesson) throw new ApiRequestError(404, 'Lesson not found in this course.');

		const requested = parseRequestedSentences(body.sentences);
		const canonicalById = new Map(
			lessonCourseSentences(lesson.document).map((sentence) => [sentence.id, sentence])
		);
		const sentences = requested.map((candidate) => {
			const canonical = canonicalById.get(candidate.id);
			if (
				!canonical ||
				normalizeNoteAnchor(canonical.text) !== normalizeNoteAnchor(candidate.text)
			) {
				throw new ApiRequestError(
					409,
					'One or more selected sentences changed. Refresh the lesson and select them again.'
				);
			}
			return canonical;
		});

		const targetLanguage = await resolveTargetLanguage(body.targetLanguage, viewer);
		const sourceLanguages = new Set(sentences.map((sentence) => sentence.language));
		if (sourceLanguages.size !== 1) {
			throw new ApiRequestError(400, 'Translate one source language per batch.');
		}
		const sentenceLanguage = sentences[0]?.language;
		const sourceLanguage = validLanguageCode(sentenceLanguage) ? sentenceLanguage : 'en';
		const sourceLabel = languageLabel(sourceLanguage);
		const targetLabel = languageLabel(targetLanguage);
		const aiOptions = await getUserTranslationServiceOptions(viewer.id, fetch);
		const modelKey = `${aiOptions.baseUrl ?? 'default'}|${aiOptions.model ?? 'default'}`;
		const entries = sentences.map((sentence) => {
			const anchor = courseSentenceAnchor(sentence);
			return {
				sentence,
				anchor,
				cacheKey: courseTranslationCacheKey({
					courseId,
					sourceLanguage,
					targetLanguage,
					modelKey,
					anchor
				})
			};
		});
		const cacheRows = await db
			.select({ key: courseTranslationCache.key, translation: courseTranslationCache.translation })
			.from(courseTranslationCache)
			.where(
				inArray(
					courseTranslationCache.key,
					entries.map(({ cacheKey }) => cacheKey)
				)
			);
		const cachedByKey = new Map(cacheRows.map((row) => [row.key, row.translation]));
		if (cacheRows.length) {
			await db
				.update(courseTranslationCache)
				.set({ lastUsedAt: new Date() })
				.where(
					inArray(
						courseTranslationCache.key,
						cacheRows.map(({ key }) => key)
					)
				);
		}

		const missing = entries.filter(({ cacheKey }) => !cachedByKey.has(cacheKey));
		const generated = await generateTranslations(
			missing.map(({ sentence }) => ({
				id: sentence.id,
				text: sentence.text,
				prefix: sentence.prefix,
				suffix: sentence.suffix
			})),
			sourceLabel,
			targetLabel,
			aiOptions
		);
		const generatedById = new Map(
			generated.results.map((result) => [result.id, result.translation])
		);

		const notes: CourseNote[] = [];
		let generatedCount = 0;
		for (const entry of entries) {
			const cached = cachedByKey.get(entry.cacheKey);
			const translation = cached ?? generatedById.get(entry.sentence.id);
			if (!translation) continue;
			if (!cached) {
				generatedCount += 1;
				await db
					.insert(courseTranslationCache)
					.values({
						key: entry.cacheKey,
						courseId,
						sourceText: entry.sentence.text,
						sourceLanguage,
						targetLanguage,
						modelKey,
						translation,
						promptVersion: COURSE_TRANSLATION_PROMPT_VERSION,
						lastUsedAt: new Date()
					})
					.onConflictDoUpdate({
						target: courseTranslationCache.key,
						set: { translation, lastUsedAt: new Date(), updatedAt: new Date() }
					});
			}
			notes.push(
				await upsertCourseTranslationNote(courseId, viewer, {
					lessonId,
					anchors: [entry.anchor],
					body: translation,
					language: targetLanguage,
					source: 'ai'
				})
			);
		}

		return json({
			notes,
			cached: entries.length - missing.length,
			generated: generatedCount,
			errors: generated.errors
		});
	} catch (error) {
		if (error instanceof AiServiceError || error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};

async function resolveTargetLanguage(value: unknown, viewer: CourseViewer): Promise<string> {
	if (value !== undefined && value !== null && value !== '') {
		if (!validTargetLanguage(value))
			throw new ApiRequestError(400, 'Choose a supported target language.');
		return value;
	}
	const [profile] = await db
		.select({ nativeLanguage: user.nativeLanguage })
		.from(user)
		.where(eq(user.id, viewer.id))
		.limit(1);
	if (!profile?.nativeLanguage || !validTargetLanguage(profile.nativeLanguage)) {
		throw new ApiRequestError(
			400,
			'Choose your native language in Account settings or select a target language.'
		);
	}
	return profile.nativeLanguage;
}

function parseRequestedSentences(value: unknown): RequestedSentence[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new ApiRequestError(400, 'Select at least one sentence to translate.');
	}
	if (value.length > MAX_SENTENCES_PER_REQUEST) {
		throw new ApiRequestError(
			400,
			`Translate at most ${MAX_SENTENCES_PER_REQUEST} sentences per request.`
		);
	}
	const seen = new Set<string>();
	let totalLength = 0;
	return value.map((candidate) => {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			throw new ApiRequestError(400, 'Every translation item must be a sentence.');
		}
		const row = candidate as Record<string, unknown>;
		const id = requiredString(row.id, 'Sentence ID', 300);
		const text = requiredString(row.text, 'Sentence text', MAX_SOURCE_CHARACTERS);
		if (seen.has(id))
			throw new ApiRequestError(400, 'A sentence can only appear once per request.');
		seen.add(id);
		totalLength += text.length;
		if (totalLength > MAX_SOURCE_CHARACTERS) {
			throw new ApiRequestError(
				413,
				`Selected sentences must be ${MAX_SOURCE_CHARACTERS.toLocaleString()} characters or fewer.`
			);
		}
		return { id, text };
	});
}

async function generateTranslations(
	items: readonly CourseTranslationPromptItem[],
	sourceLanguage: string,
	targetLanguage: string,
	aiOptions: Parameters<typeof completeAiChat>[1]
): Promise<{ results: CourseTranslationResult[]; errors: Array<{ id: string; error: string }> }> {
	if (!items.length) return { results: [], errors: [] };
	try {
		const response = await completeAiChat(
			{
				messages: [
					{
						role: 'user',
						content: createCourseTranslationPrompt({ items, sourceLanguage, targetLanguage })
					}
				]
			},
			aiOptions
		);
		return {
			results: parseCourseTranslationResponse(
				response,
				items.map(({ id }) => id)
			),
			errors: []
		};
	} catch (batchError) {
		if (batchError instanceof AiServiceError || batchError instanceof UserAiCredentialError) {
			throw batchError;
		}
		const results: CourseTranslationResult[] = [];
		const errors: Array<{ id: string; error: string }> = [];
		for (const item of items) {
			try {
				const response = await completeAiChat(
					{
						messages: [
							{
								role: 'user',
								content: createCourseTranslationPrompt({
									items: [item],
									sourceLanguage,
									targetLanguage
								})
							}
						]
					},
					aiOptions
				);
				results.push(parseCourseTranslationResponse(response, [item.id])[0]!);
			} catch (error) {
				if (error instanceof AiServiceError || error instanceof UserAiCredentialError) throw error;
				errors.push({
					id: item.id,
					error: error instanceof Error ? error.message : 'Translation failed.'
				});
			}
		}
		return { results, errors };
	}
}

function validTargetLanguage(value: unknown): value is string {
	return typeof value === 'string' && nativeLanguageCodes.includes(value);
}

function validLanguageCode(value: unknown): value is string {
	if (typeof value !== 'string' || !value.trim() || value.length > 35) return false;
	try {
		return Intl.getCanonicalLocales(value).length === 1;
	} catch {
		return false;
	}
}

function languageLabel(code: string): string {
	return nativeLanguages.find((language) => language.code === code)?.label ?? code;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
	const result = typeof value === 'string' ? value.trim() : '';
	if (!result) throw new ApiRequestError(400, `${label} is required.`);
	if (result.length > maxLength) throw new ApiRequestError(400, `${label} is too long.`);
	return result;
}
