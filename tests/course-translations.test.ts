import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	courseTranslationCacheKey,
	createCourseTranslationPrompt,
	parseCourseTranslationResponse
} from '../src/lib/server/course-translations';

test('translation cache keys include location context and model identity', () => {
	const input = {
		courseId: 'course.1',
		sourceLanguage: 'en',
		targetLanguage: 'fa',
		modelKey: 'https://provider.example|model-a',
		anchor: {
			key: 'one',
			text: 'The bank is closed.',
			widgetId: 'passage.1',
			prefix: 'We arrived late.',
			suffix: 'Come back tomorrow.'
		}
	};
	assert.equal(courseTranslationCacheKey(input), courseTranslationCacheKey(input));
	assert.notEqual(
		courseTranslationCacheKey(input),
		courseTranslationCacheKey({
			...input,
			anchor: { ...input.anchor, prefix: 'They walked by the river.' }
		})
	);
});

test('translation prompt and parser preserve sentence identities', () => {
	const items = [
		{ id: 'sentence.1', text: 'Hello.' },
		{ id: 'sentence.2', text: 'How are you?' }
	];
	const prompt = createCourseTranslationPrompt({
		items,
		sourceLanguage: 'English',
		targetLanguage: 'Persian'
	});
	assert.match(prompt, /sentence\.1/u);
	assert.deepEqual(
		parseCourseTranslationResponse(
			'```json\n[{"id":"sentence.1","translation":"سلام."},{"id":"sentence.2","translation":"حال شما چطور است؟"}]\n```',
			items.map(({ id }) => id)
		),
		[
			{ id: 'sentence.1', translation: 'سلام.' },
			{ id: 'sentence.2', translation: 'حال شما چطور است؟' }
		]
	);
	assert.throws(
		() =>
			parseCourseTranslationResponse(
				'[{"id":"sentence.1","translation":"سلام."}]',
				items.map(({ id }) => id)
			),
		/omitted/u
	);
});
