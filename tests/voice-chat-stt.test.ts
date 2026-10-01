import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	BrowserSpeechRecognition,
	type BrowserSpeechResult
} from '../src/lib/features/voice-chat/browser-speech-recognition';
import { recognizeVoiceTurn } from '../src/lib/features/voice-chat/stt-routing';

const persian = 'سلام، امروز می‌خواهم فارسی صحبت کنم.';
const browser = (language: 'en' | 'fa', error: string | null = null): BrowserSpeechResult => ({
	language,
	error,
	text: language === 'fa' ? persian : 'I would like to speak English.',
	confidence: 0.9
});

for (const language of ['en', 'fa'] as const) {
	test(`${language}: working Web Speech skips every local model`, async () => {
		const result = await recognizeVoiceTurn(language, browser(language), {
			detect: async () => {
				throw new Error('Unexpected detection');
			},
			transcribe: async () => {
				throw new Error('Unexpected local transcription');
			}
		});
		assert.equal(result.text, browser(language).text);
		assert.equal(result.language, language);
		assert.equal(result.requiresReview, false);
		assert.match(result.provider, /^Web Speech API/);
	});
	for (const failure of [null, 'network', 'not-allowed', 'language-not-supported', 'timeout']) {
		test(`${language}: ${failure ?? 'missing API'} falls back only to its own language`, async () => {
			const calls: string[] = [];
			const result = await recognizeVoiceTurn(
				language,
				failure ? browser(language, failure) : null,
				{
					detect: async () => {
						throw new Error('Explicit language must skip detection');
					},
					transcribe: async (selected) => {
						calls.push(selected);
						return selected === 'fa' ? persian : 'English fallback';
					}
				}
			);
			assert.deepEqual(calls, [language]);
			assert.equal(result.language, language);
			assert.equal(result.text, language === 'fa' ? persian : 'English fallback');
			assert.match(
				result.provider,
				language === 'fa' ? /^Whisper fallback/ : /^Moonshine fallback/
			);
		});
	}
}

test('Auto keeps the preferred Persian browser transcript and performs detection only', async () => {
	const result = await recognizeVoiceTurn('auto', browser('fa'), {
		detect: async () => ({
			text: '',
			language: 'fa',
			confidence: 0.9,
			languageProbabilities: { fa: 0.9, en: 0.01 }
		}),
		transcribe: async () => {
			throw new Error('Do not replace good Persian Web Speech with Whisper');
		}
	});
	assert.equal(result.text, persian);
	assert.equal(result.requiresReview, false);
});

test('Auto ignores browser confidence when independent audio evidence is English', async () => {
	const calls: string[] = [];
	const result = await recognizeVoiceTurn(
		'auto',
		{ ...browser('fa'), confidence: 1 },
		{
			detect: async () => ({
				text: '',
				language: 'en',
				confidence: 0.95,
				languageProbabilities: { fa: 0.01, en: 0.95 }
			}),
			transcribe: async (language) => {
				calls.push(language);
				return 'English fallback';
			}
		}
	);
	assert.deepEqual(calls, ['en']);
	assert.equal(result.language, 'en');
	assert.equal(result.text, 'English fallback');
	assert.equal(result.candidates?.fa, persian);
	assert.match(result.provider, /^Moonshine fallback/);
});

test('uncertain Auto results preserve both transcripts and require a choice', async () => {
	const result = await recognizeVoiceTurn('auto', browser('fa'), {
		detect: async () => ({
			text: '',
			language: 'fa',
			confidence: 0.46,
			languageProbabilities: { fa: 0.46, en: 0.45 }
		}),
		transcribe: async () => 'English candidate'
	});
	assert.equal(result.requiresReview, true);
	assert.deepEqual(result.candidates, { en: 'English candidate', fa: persian });
});

test('language detection failure retains Web Speech but never auto-sends it', async () => {
	const result = await recognizeVoiceTurn('auto', browser('fa'), {
		detect: async () => {
			throw new Error('Model unavailable');
		},
		transcribe: async () => {
			throw new Error('Model unavailable');
		}
	});
	assert.equal(result.requiresReview, true);
	assert.equal(result.text, persian);
});

test('a failed Persian fallback never silently substitutes English', async () => {
	await assert.rejects(
		recognizeVoiceTurn('auto', browser('en'), {
			detect: async () => ({
				text: '',
				language: 'fa',
				confidence: 0.9,
				languageProbabilities: { fa: 0.9, en: 0.01 }
			}),
			transcribe: async (language) => {
				assert.equal(language, 'fa');
				throw new Error('Persian unavailable');
			}
		}),
		/Persian unavailable/
	);
});

test('review preserves an available alternative after the selected local provider fails', async () => {
	const result = await recognizeVoiceTurn(
		'auto',
		browser('en'),
		{
			detect: async () => ({
				text: '',
				language: 'fa',
				confidence: 0.9,
				languageProbabilities: { fa: 0.9, en: 0.01 }
			}),
			transcribe: async () => {
				throw new Error('Persian model unavailable');
			}
		},
		true
	);
	assert.equal(result.requiresReview, true);
	assert.equal(result.text, browser('en').text);
	assert.equal(result.candidates?.fa, '');
});

test('empty and wrong-locale browser results use the explicitly selected language fallback', async () => {
	for (const result of [{ ...browser('fa'), text: ' ' }, browser('en')]) {
		const transcript = await recognizeVoiceTurn('fa', result, {
			detect: async () => {
				throw new Error('Unexpected detection');
			},
			transcribe: async (language) => {
				assert.equal(language, 'fa');
				return persian;
			}
		});
		assert.equal(transcript.text, persian);
	}
});

test('cancellation during classification does not start another recognizer', async () => {
	await assert.rejects(
		recognizeVoiceTurn('auto', browser('fa'), {
			detect: async () => {
				throw new DOMException('Cancelled', 'AbortError');
			},
			transcribe: async () => {
				throw new Error('Unexpected fallback');
			}
		}),
		{ name: 'AbortError' }
	);
});

test('browser sessions keep updated transcripts across normal ends and stop deadlines', async () => {
	const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
	class FakeRecognition {
		static current: FakeRecognition;
		lang = '';
		continuous = false;
		interimResults = false;
		maxAlternatives = 0;
		onresult:
			| ((event: {
					resultIndex: number;
					results: { isFinal: boolean; 0: { transcript: string; confidence: number } }[];
			  }) => void)
			| null = null;
		onerror: ((event: { error: string }) => void) | null = null;
		onend: (() => void) | null = null;
		aborted = false;
		constructor() {
			FakeRecognition.current = this;
		}
		start() {}
		stop() {
			this.onend?.();
		}
		abort() {
			this.aborted = true;
			this.onend?.();
		}
	}
	Object.defineProperty(globalThis, 'window', {
		value: { SpeechRecognition: FakeRecognition },
		configurable: true
	});
	try {
		for (const language of ['en', 'fa'] as const) {
			const session = new BrowserSpeechRecognition(language);
			assert.equal(session.start(), true);
			const recognition = FakeRecognition.current;
			assert.equal(recognition.lang, language === 'en' ? 'en-US' : 'fa-IR');
			assert.equal(recognition.interimResults, true);
			recognition.onresult?.({
				resultIndex: 0,
				results: [
					{ isFinal: true, 0: { transcript: browser(language).text, confidence: 0.9 } },
					{ isFinal: false, 0: { transcript: 'unfinished', confidence: 1 } }
				]
			});
			// The service revises an interim segment without repeating earlier final text.
			recognition.onresult?.({
				resultIndex: 1,
				results: [
					{ isFinal: true, 0: { transcript: browser(language).text, confidence: 0.9 } },
					{ isFinal: true, 0: { transcript: 'updated', confidence: 0.8 } },
					{ isFinal: false, 0: { transcript: 'withdrawn', confidence: 1 } }
				]
			});
			// An interim result can also be withdrawn from the end of the result list.
			recognition.onresult?.({
				resultIndex: 2,
				results: [
					{ isFinal: true, 0: { transcript: browser(language).text, confidence: 0.9 } },
					{ isFinal: true, 0: { transcript: 'updated', confidence: 0.8 } }
				]
			});
			// Recognition may end normally before the recorder's silence timer fires.
			recognition.onend?.();
			const result = await session.stop();
			assert.equal(result.text, `${browser(language).text} updated`);
			assert.equal(result.error, null);
			assert.equal(recognition.onresult, null);
		}
		const interim = new BrowserSpeechRecognition('fa');
		interim.start();
		FakeRecognition.current.onresult?.({
			resultIndex: 0,
			results: [{ isFinal: false, 0: { transcript: persian, confidence: 0 } }]
		});
		FakeRecognition.current.onend?.();
		assert.equal((await interim.stop()).text, persian);
		assert.equal((await interim.stop()).error, null);
		// Cancelling an already-ended session must also discard its saved transcript.
		interim.abort();
		assert.equal((await interim.stop()).text, '');
		assert.equal((await interim.stop()).error, 'aborted');

		const delayed = new BrowserSpeechRecognition('fa');
		delayed.start();
		const delayedRecognition = FakeRecognition.current;
		delayedRecognition.onresult?.({
			resultIndex: 0,
			results: [{ isFinal: false, 0: { transcript: 'unfinished', confidence: 0 } }]
		});
		delayedRecognition.stop = () => {
			setTimeout(() => {
				delayedRecognition.onresult?.({
					resultIndex: 0,
					results: [{ isFinal: true, 0: { transcript: persian, confidence: 0.9 } }]
				});
				delayedRecognition.onend?.();
			}, 0);
		};
		assert.equal((await delayed.stop()).text, persian);

		const failed = new BrowserSpeechRecognition('fa');
		failed.start();
		FakeRecognition.current.onresult?.({
			resultIndex: 0,
			results: [{ isFinal: true, 0: { transcript: 'partial', confidence: 1 } }]
		});
		FakeRecognition.current.onerror?.({ error: 'network' });
		assert.equal((await failed.stop()).text, '');
		assert.equal((await failed.stop()).error, 'network');
		assert.equal(FakeRecognition.current.aborted, true);
		const ended = new BrowserSpeechRecognition('en');
		ended.start();
		FakeRecognition.current.onend?.();
		assert.equal((await ended.stop()).error, null);
		assert.equal((await ended.stop()).text, '');
		const cancelled = new BrowserSpeechRecognition('fa');
		cancelled.start();
		FakeRecognition.current.onresult?.({
			resultIndex: 0,
			results: [{ isFinal: false, 0: { transcript: persian, confidence: 0 } }]
		});
		FakeRecognition.current.stop = () => {};
		const pending = cancelled.stop();
		cancelled.abort();
		assert.equal(FakeRecognition.current.aborted, true);
		assert.equal((await pending).error, 'aborted');
		assert.equal((await cancelled.stop()).text, '');
		for (const text of ['', persian]) {
			const timedOut = new BrowserSpeechRecognition('fa');
			timedOut.start();
			FakeRecognition.current.onresult?.({
				resultIndex: 0,
				results: [{ isFinal: false, 0: { transcript: text, confidence: 0 } }]
			});
			FakeRecognition.current.stop = () => {};
			const result = await timedOut.stop();
			assert.equal(result.error, text ? null : 'timeout');
			assert.equal(result.text, text);
			assert.equal(FakeRecognition.current.aborted, true);
		}
	} finally {
		if (previous) Object.defineProperty(globalThis, 'window', previous);
		else Reflect.deleteProperty(globalThis, 'window');
	}
});
