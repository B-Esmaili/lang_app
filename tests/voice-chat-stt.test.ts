import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	BrowserSpeechRecognition,
	type BrowserSpeechResult
} from '../src/lib/features/voice-chat/browser-speech-recognition';
import { recognizeVoiceTurn } from '../src/lib/features/voice-chat/stt-routing';
import { speechModelId } from '../src/lib/features/speaking-practice/speech-model';

const persian = 'سلام، امروز می‌خواهم فارسی صحبت کنم.';
const browser = (language: 'en' | 'fa', error: string | null = null): BrowserSpeechResult => ({
	language,
	error,
	text: language === 'fa' ? persian : 'I would like to speak English.',
	confidence: 0.9
});

test('WEB_STT permits exactly the configured local model', () => {
	assert.equal(speechModelId('english', 'moonshine'), 'onnx-community/moonshine-tiny-ONNX');
	assert.throws(() => speechModelId('persian', 'moonshine'), /Whisper is disabled/);
	for (const mode of ['english', 'persian'] as const)
		assert.equal(speechModelId(mode, 'whisper'), 'onnx-community/whisper-base');
});

for (const language of ['en', 'fa'] as const) {
	test(`${language}: Web Speech is preferred and no local model runs`, async () => {
		const result = await recognizeVoiceTurn(language, browser(language), {
			transcribe: async () => {
				throw new Error('Unexpected local transcription');
			}
		});
		assert.equal(result.text, browser(language).text);
		assert.equal(result.language, language);
		assert.match(result.provider, /^Web Speech API/);
	});
}

for (const webStt of ['whisper', 'moonshine'] as const) {
	test(`${webStt}: English fallback uses only its configured model`, async () => {
		const calls: string[] = [];
		const result = await recognizeVoiceTurn(
			'en',
			null,
			{
				transcribe: async (language) => {
					calls.push(language);
					return 'English fallback';
				}
			},
			undefined,
			webStt
		);
		assert.deepEqual(calls, ['en']);
		assert.equal(result.text, 'English fallback');
		assert.match(
			result.provider,
			new RegExp(`^${webStt === 'whisper' ? 'Whisper' : 'Moonshine'} fallback`)
		);
	});
}

test('Whisper supplies a forced Persian fallback only when Web Speech fails', async () => {
	const calls: string[] = [];
	const result = await recognizeVoiceTurn('fa', browser('fa', 'network'), {
		transcribe: async (language) => {
			calls.push(language);
			return persian;
		}
	});
	assert.deepEqual(calls, ['fa']);
	assert.equal(result.text, persian);
	assert.match(result.provider, /^Whisper fallback/);
});

test('Moonshine never loads Whisper for a Persian question', async () => {
	const noLocal = {
		transcribe: async () => {
			throw new Error('Whisper must not run');
		}
	};
	assert.equal(
		(await recognizeVoiceTurn('fa', browser('fa'), noLocal, undefined, 'moonshine')).text,
		persian
	);
	for (const candidate of [null, browser('fa', 'network'), browser('en')]) {
		await assert.rejects(
			recognizeVoiceTurn('fa', candidate, noLocal, undefined, 'moonshine'),
			/Persian speech needs Web Speech/
		);
	}
});

test('a wrong-locale browser result cannot override the selected language', async () => {
	const result = await recognizeVoiceTurn('en', browser('fa'), {
		transcribe: async (language) => {
			assert.equal(language, 'en');
			return 'English transcript';
		}
	});
	assert.equal(result.text, 'English transcript');
	assert.equal(result.language, 'en');
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
