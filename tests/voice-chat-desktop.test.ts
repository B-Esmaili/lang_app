import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
	createSpeechEngine,
	speechVoiceFor,
	streamingEngine,
	VitsSpeechEngine
} from '../src/lib/features/voice-chat/tts-engine';
import {
	MIN_STREAM_START_SECONDS,
	streamStartSeconds
} from '../src/lib/features/voice-chat/stream-buffer';
import {
	DesktopSpeechEngine,
	desktopVoices,
	resolveDesktopVoice,
	type DesktopTts
} from '../src/lib/features/voice-chat/desktop-tts-engine';
import {
	DEFAULT_VOICE_CHAT_VOICE,
	DESKTOP_VOICE_CHAT_VOICES
} from '../src/lib/features/voice-chat/voices';

const voices = DESKTOP_VOICE_CHAT_VOICES.map(({ id, label, age, gender }) => ({
	id,
	label,
	age,
	gender
}));

test('the web desktop catalog matches the voices the desktop app bundles', () => {
	const catalog = JSON.parse(
		readFileSync(new URL('../../desktop-app/voices/voices.json', import.meta.url), 'utf8')
	) as { default: string; voices: { id: string; label: string; age: string; gender: string }[] };
	assert.deepEqual(
		catalog.voices.map(({ id, label, age, gender }) => ({ id, label, age, gender })),
		voices
	);
	assert.equal(catalog.default, 'young-female');
});

test('desktop voices are limited to those both the host and accounts know', () => {
	const native = {
		voices: [
			{ id: 'senior-male', label: 'Grandpa', age: 'senior', gender: 'male' },
			{ id: 'unknown-voice', label: 'Extra', age: 'young', gender: 'male' },
			{ id: 'child-female', label: '', age: 'child', gender: 'female' }
		],
		defaultVoice: 'senior-male'
	} as unknown as DesktopTts;
	assert.deepEqual(
		desktopVoices(native).map((voice) => [voice.id, voice.label]),
		[
			['child-female', 'Girl (child, Mandarin-accented English)'],
			['senior-male', 'Grandpa']
		]
	);
	assert.equal(resolveDesktopVoice(native, 'child-female'), 'child-female');
	assert.equal(resolveDesktopVoice(native, 'young-female'), 'senior-male'); // Not offered here.
});

test('speech engine uses Pocket TTS PCM in desktop and keeps the browser worker elsewhere', async () => {
	assert.ok(createSpeechEngine() instanceof VitsSpeechEngine); // SSR has no window.
	const preferences = {
		voiceId: DEFAULT_VOICE_CHAT_VOICE,
		desktopVoiceId: 'senior-female' as const
	};
	assert.equal(speechVoiceFor(preferences), DEFAULT_VOICE_CHAT_VOICE);
	const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
	const target = new EventTarget() as Window;
	Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
	const calls: { id: number; text: string; voice: string }[] = [];
	const cancelled: number[] = [];
	const native: DesktopTts = {
		version: 2,
		engine: 'pocket-tts',
		voices,
		defaultVoice: 'young-female',
		generate: async (id, text, voice) => {
			calls.push({ id, text, voice });
		},
		cancel: async (id) => {
			cancelled.push(id);
		}
	};
	const send = (detail: Record<string, unknown>) =>
		target.dispatchEvent(new CustomEvent('desktop-tts-audio', { detail }));
	const chunk = (id: number, values = [0.25, -0.25], sampleRate = 24000) => {
		const bytes = new Uint8Array(values.length * 4);
		const view = new DataView(bytes.buffer);
		values.forEach((value, i) => view.setFloat32(i * 4, value, true));
		send({
			id,
			type: 'chunk',
			pcm: btoa(String.fromCharCode(...bytes)),
			sampleRate,
			progress: 0.5
		});
	};
	try {
		assert.ok(createSpeechEngine() instanceof VitsSpeechEngine);
		// Older hosts (Chatterbox, tts version 1) and malformed hosts keep browser speech.
		for (const host of [
			{ version: 1, tts: native },
			{ version: 3, tts: native },
			{ version: 2 },
			{ version: 2, tts: { ...native, version: 1 } },
			{ version: 2, tts: { ...native, engine: 'chatterbox', voice: 'Voice chat agent' } },
			{ version: 2, tts: { ...native, generate: undefined } },
			{ version: 2, tts: { ...native, voices: [] } },
			{ version: 2, tts: { ...native, voices: [{ id: 'unknown' }] } }
		]) {
			Reflect.set(target, 'aiChatDesktop', host);
			assert.ok(createSpeechEngine() instanceof VitsSpeechEngine);
		}
		target.aiChatDesktop = { version: 2, tts: native };
		assert.equal(speechVoiceFor(preferences), 'senior-female');
		const statuses: string[] = [];
		const engine = createSpeechEngine((status) => statuses.push(status.message));
		assert.equal(engine.constructor, DesktopSpeechEngine);
		const take = engine.synthesize('Hello from the desktop.', 'child-male');
		const first = calls.at(-1)!;
		assert.match(statuses[0], /Pocket TTS/);
		assert.equal(first.voice, 'child-male');
		send({ id: first.id, type: 'progress', progress: 0 });
		assert.match(statuses.at(-1)!, /Generating/);
		assert.equal(first.text, 'Hello from the desktop.');
		await assert.rejects(engine.synthesize('Overlap', 'child-male'), /Wait/);
		chunk(first.id - 1); // Stale/unrelated events must not contaminate the WAV.
		chunk(first.id);
		chunk(first.id, [0.5]);
		send({ id: first.id, type: 'complete', sampleRate: 24000, sampleCount: 3 });
		const blob = await take;
		assert.equal(blob.type, 'audio/wav');
		const wav = new DataView(await blob.arrayBuffer());
		assert.equal(wav.getUint32(24, true), 24000);
		assert.equal(wav.getUint32(40, true), 6);
		assert.equal(wav.getInt16(44, true), 8192);
		assert.equal(wav.getInt16(46, true), -8192);
		assert.equal(wav.getInt16(48, true), 16384);
		// A browser voice ID or stale preference falls back to the host default.
		const fallback = engine.synthesize('Fallback voice', DEFAULT_VOICE_CHAT_VOICE);
		assert.equal(calls.at(-1)!.voice, 'young-female');
		const fallbackID = calls.at(-1)!.id;
		chunk(fallbackID);
		send({ id: fallbackID, type: 'complete', sampleRate: 24000, sampleCount: 2 });
		await fallback;
		const aborted = engine.synthesize('Cancel me', 'young-male');
		const abortedID = calls.at(-1)!.id;
		const rejection = assert.rejects(aborted, { name: 'AbortError' });
		engine.cancel();
		await rejection;
		assert.ok(cancelled.includes(abortedID));
		const next = createSpeechEngine();
		const recovered = next.synthesize('Next instance', 'young-male');
		const nextID = calls.at(-1)!.id;
		assert.ok(nextID > abortedID);
		chunk(abortedID);
		chunk(nextID);
		send({ id: nextID, type: 'complete', sampleRate: 24000, sampleCount: 2 });
		await recovered;
		next.dispose();
		for (const fault of ['truncated', 'nan', 'rate', 'native-error', 'rejected-binding']) {
			if (fault === 'rejected-binding')
				native.generate = async () => {
					throw 'Native engine busy';
				};
			const result = engine.synthesize('Invalid stream', 'young-male');
			const failed = assert.rejects(result, /incomplete|Invalid|unavailable|busy/);
			const id = calls.at(-1)!.id;
			if (fault === 'nan') chunk(id, [NaN]);
			if (fault === 'rate') {
				chunk(id);
				chunk(id, [0.5], 16000);
			}
			if (fault === 'truncated') {
				chunk(id);
				send({ id, type: 'complete', sampleRate: 24000, sampleCount: 3 });
			}
			if (fault === 'native-error') send({ id, type: 'error', message: 'Voice unavailable' });
			await failed;
		}
		engine.dispose();
		await assert.rejects(engine.synthesize('After dispose', 'young-male'), /closed/);
	} finally {
		if (previous) Object.defineProperty(globalThis, 'window', previous);
		else Reflect.deleteProperty(globalThis, 'window');
	}
});

test('streamed playback starts early when generation is fast and waits when it is slow', () => {
	const start = (received: number, elapsed: number, progress: number | null, lastChunk = 0.16) =>
		streamStartSeconds({ received, elapsed, progress, lastChunk });
	assert.equal(start(0, 0.1, null), Infinity);
	// About five times real time (this PC): start after the second chunk, about 0.5 s of audio.
	assert.ok(start(0.16, 0.05, 0.04) > 0.16);
	assert.ok(start(0.48, 0.12, 0.12, 0.32) <= 0.48);
	assert.equal(start(0.48, 0.12, 0.12, 0.32), MIN_STREAM_START_SECONDS);
	// Twice real time: the buffer must outlast the next (larger) chunk's generation.
	assert.ok(start(1, 0.5, 0.25, 0.64) > MIN_STREAM_START_SECONDS);
	assert.ok(start(2, 1, 0.5, 0.96) <= 2);
	// Slower than real time: buffer most of the shortfall before starting.
	const slow = start(1, 1.25, 0.25, 0.64);
	assert.ok(slow > 0.75 && slow < 3, `slow start ${slow}`);
	// Without a progress estimate a slow host assumes a long reply.
	assert.ok(start(1, 1.25, null, 0.64) > slow);
});

test('desktop streaming hands decoded chunks to playback only when the host streams', async () => {
	const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
	const target = new EventTarget() as Window;
	Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
	const calls: number[] = [];
	const host: DesktopTts = {
		version: 2,
		engine: 'pocket-tts',
		voices,
		defaultVoice: 'young-female',
		generate: async (id) => {
			calls.push(id);
		},
		cancel: async () => {}
	};
	const send = (detail: Record<string, unknown>) =>
		target.dispatchEvent(new CustomEvent('desktop-tts-audio', { detail }));
	const chunk = (id: number, values: number[], progress: number) => {
		const bytes = new Uint8Array(values.length * 4);
		const view = new DataView(bytes.buffer);
		values.forEach((value, i) => view.setFloat32(i * 4, value, true));
		send({
			id,
			type: 'chunk',
			pcm: btoa(String.fromCharCode(...bytes)),
			sampleRate: 24000,
			progress
		});
	};
	try {
		assert.equal(streamingEngine(new DesktopSpeechEngine(host)), null); // No capability.
		assert.equal(
			streamingEngine(new DesktopSpeechEngine({ ...host, streaming: { version: 2 } })),
			null
		);
		assert.equal(streamingEngine(new VitsSpeechEngine()), null);
		const engine = new DesktopSpeechEngine({ ...host, streaming: { version: 1 } });
		assert.equal(streamingEngine(engine), engine);
		const received: { samples: number[]; rate: number; progress: number | null }[] = [];
		const take = engine.synthesizeStream('Stream this reply.', 'young-male', (piece) =>
			received.push({
				samples: [...piece.samples],
				rate: piece.sampleRate,
				progress: piece.progress
			})
		);
		const id = calls.at(-1)!;
		chunk(id - 1, [0.9], 0.1); // Unrelated events are ignored.
		chunk(id, [0.25, -0.25], 0.4);
		assert.equal(received.length, 1); // Delivered before generation completes.
		chunk(id, [2], 0.9); // Out-of-range PCM is clamped for playback and the WAV.
		send({ id, type: 'complete', sampleRate: 24000, sampleCount: 3 });
		const wav = new DataView(await (await take).arrayBuffer());
		assert.deepEqual(received, [
			{ samples: [0.25, -0.25], rate: 24000, progress: 0.4 },
			{ samples: [1], rate: 24000, progress: 0.9 }
		]);
		assert.equal(wav.getInt16(48, true), 32767);
		// A failing consumer stops generation instead of leaving the host speaking.
		const failing = engine.synthesizeStream('Fail while playing.', 'young-male', () => {
			throw new Error('Playback failed');
		});
		chunk(calls.at(-1)!, [0.1], 0.5);
		await assert.rejects(failing, /Playback failed/);
	} finally {
		if (previous) Object.defineProperty(globalThis, 'window', previous);
		else Reflect.deleteProperty(globalThis, 'window');
	}
});
