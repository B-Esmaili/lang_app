import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createCourseExplainPrompt,
	isCourseExplainAction
} from '../src/lib/server/course-explains';

test('recognizes the supported course explanation actions', () => {
	assert.equal(isCourseExplainAction('grammar'), true);
	assert.equal(isCourseExplainAction('translate'), true);
	assert.equal(isCourseExplainAction('elevate'), true);
	assert.equal(isCourseExplainAction('explain'), false);
	assert.equal(isCourseExplainAction(null), false);
});

test('builds a grammar-focused prompt without translating the passage', () => {
	const prompt = createCourseExplainPrompt({
		action: 'grammar',
		text: 'If I had known, I would have called.'
	});
	assert.match(prompt, /Explain the grammar/i);
	assert.match(prompt, /Do not translate/i);
	assert.match(prompt, /If I had known/);
});

test('builds a translation prompt for the configured native language', () => {
	const prompt = createCourseExplainPrompt({
		action: 'translate',
		text: 'Hello',
		nativeLanguage: 'Persian'
	});
	assert.match(prompt, /into Persian/i);
	assert.match(prompt, /Return only the translation/i);
});

test('builds an advanced-vocabulary rewrite prompt', () => {
	const prompt = createCourseExplainPrompt({ action: 'elevate', text: 'A good idea.' });
	assert.match(prompt, /more advanced, natural vocabulary/i);
	assert.match(prompt, /Return only the rewritten passage/i);
});
