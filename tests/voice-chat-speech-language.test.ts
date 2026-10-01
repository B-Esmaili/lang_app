import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	LANGUAGE_SELECTION_THRESHOLDS,
	needsLanguageReview,
	scoreSpeechLanguage,
	selectSpeechLanguage
} from '../src/lib/features/speaking-practice/speech-language';
import { selectVoiceChatLanguage } from '../src/lib/features/voice-chat/speech-language-selection';

const tokens = { '<|en|>': 0, '<|fa|>': 1, '<|ur|>': 2 };

test('a slight preference for Persian remains Persian and requires review', () => {
	const detection = scoreSpeechLanguage([0, 0.19, -20], tokens);
	assert.equal(detection.language, 'fa');
	assert.ok(detection.confidence > 0.54 && detection.confidence < 0.56);
	assert.equal(needsLanguageReview(detection), true);
});

test('another likely language cannot inflate English confidence', () => {
	const detection = scoreSpeechLanguage([2, -3, 8], tokens);
	// Comparing en/fa alone would wrongly report over 99% English confidence.
	assert.ok(detection.confidence < 0.01);
	assert.equal(needsLanguageReview(detection), true);
});

test('diagnostics expose both language probabilities using the full language distribution', () => {
	const detection = scoreSpeechLanguage([0, Math.log(2), Math.log(7)], tokens);
	assert.ok(detection.languageProbabilities);
	assert.ok(Math.abs(detection.languageProbabilities.en - 0.1) < 1e-10);
	assert.ok(Math.abs(detection.languageProbabilities.fa - 0.2) < 1e-10);
	assert.equal(detection.confidence, detection.languageProbabilities.fa);
});

test('clear English and Persian results can be sent automatically', () => {
	for (const [scores, language] of [
		[[8, -2, -3], 'en'],
		[[-2, 8, -3], 'fa']
	] as const) {
		const detection = scoreSpeechLanguage(scores, tokens);
		assert.equal(detection.language, language);
		assert.equal(needsLanguageReview(detection), false);
	}
});

test('ties, missing tokens, and invalid scores never become confident English', () => {
	for (const scores of [[0, 0, 0], [NaN, 1, 2], [1, Infinity, 2], []]) {
		assert.equal(needsLanguageReview(scoreSpeechLanguage(scores, tokens)), true);
	}
	assert.deepEqual(scoreSpeechLanguage([1, 2], { '<|en|>': 0 }), { language: null, confidence: 0 });
});

test('the reported Persian and English examples auto-select from the score gap', () => {
	for (const [probabilities, language] of [
		[{ en: 0.018709766922851104, fa: 0.05942510632895759 }, 'fa'],
		[{ en: 0.5525406930662076, fa: 0.000049716576361523384 }, 'en']
	] as const) {
		const selection = selectSpeechLanguage(probabilities);
		assert.equal(selection.language, language);
		assert.equal(selection.requiresReview, false);
		assert.ok(selection.scoreRatio! >= LANGUAGE_SELECTION_THRESHOLDS.minimumScoreRatio);
	}
});

test('nearby scores require an explicit choice in either direction', () => {
	for (const probabilities of [
		{ en: 0.45, fa: 0.46 },
		{ en: 0.46, fa: 0.45 },
		{ en: 0.49, fa: 0.49 },
		{ en: 0.59, fa: 0.2 }
	]) {
		assert.equal(selectSpeechLanguage(probabilities).requiresReview, true);
	}
});

test('the three-times threshold is inclusive and symmetric', () => {
	for (const probabilities of [
		{ en: 0.375, fa: 0.125 },
		{ en: 0.125, fa: 0.375 },
		{ en: 0.3, fa: 0.1 },
		{ en: 0.1, fa: 0.3 }
	]) {
		assert.equal(selectSpeechLanguage(probabilities).requiresReview, false);
	}
	assert.equal(selectSpeechLanguage({ en: 0.374, fa: 0.125 }).requiresReview, true);
});

test('a large ratio still requires a meaningful absolute gap', () => {
	for (const probabilities of [
		{ en: 0.0004, fa: 0.000001 },
		{ en: 0, fa: 0.009 },
		{ en: 0, fa: 0 }
	]) {
		assert.equal(selectSpeechLanguage(probabilities).requiresReview, true);
	}
	assert.equal(selectSpeechLanguage({ en: 0, fa: 0.01 }).requiresReview, false);
	assert.equal(selectSpeechLanguage({ en: 0.01, fa: 0 }).requiresReview, false);
});

test('missing or invalid pairs never fall back to the old winning confidence', () => {
	assert.equal(needsLanguageReview({ language: 'en', confidence: 0.99 }), true);
	for (const probabilities of [
		undefined,
		{ en: NaN, fa: 0.5 },
		{ en: 0.5, fa: Infinity },
		{ en: -0.1, fa: 0.5 },
		{ en: 0.1, fa: 1.1 },
		{ en: 0.9, fa: 0.3 }
	]) {
		assert.deepEqual(selectSpeechLanguage(probabilities), {
			language: null,
			requiresReview: true,
			absoluteGap: null,
			scoreRatio: null
		});
	}
});

test('browser transcript confidence never overrides Whisper language evidence', () => {
	for (const confidence of [0, 0.5, 0.9284, 1, null, NaN, Infinity, -0.1, 1.1]) {
		const english = selectVoiceChatLanguage(
			{ en: 0.99, fa: 0.001 },
			{ text: '\u200Fhow are you', confidence }
		);
		assert.equal(english.language, 'en');
		assert.equal(english.requiresReview, false);
		assert.equal(english.source, 'whisper-probabilities');

		const persian = selectVoiceChatLanguage({ en: 0.001, fa: 0.99 }, { text: 'سلام', confidence });
		assert.equal(persian.language, 'fa');
		assert.equal(persian.requiresReview, false);
		assert.equal(persian.source, 'whisper-probabilities');
	}
});

test('uncertain or missing Whisper evidence always requires an explicit choice', () => {
	for (const probabilities of [{ en: 0.45, fa: 0.46 }, undefined]) {
		const selection = selectVoiceChatLanguage(probabilities, {
			text: 'سلام',
			confidence: 0.99
		});
		assert.deepEqual(selection, {
			...selectSpeechLanguage(probabilities),
			source: 'whisper-probabilities'
		});
		assert.equal(selection.requiresReview, true);
	}
});

test('a confident Persian decision without a Persian transcript requires review', () => {
	for (const text of ['', '   ']) {
		const selection = selectVoiceChatLanguage({ en: 0.001, fa: 0.99 }, { text, confidence: 0.95 });
		assert.equal(selection.language, 'fa');
		assert.equal(selection.requiresReview, true);
		assert.equal(selection.source, 'whisper-probabilities');
	}
});
