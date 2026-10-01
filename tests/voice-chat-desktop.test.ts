import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpeechEngine, VitsSpeechEngine } from '../src/lib/features/voice-chat/tts-engine';
import {
	DesktopSpeechEngine,
	type DesktopTts
} from '../src/lib/features/voice-chat/desktop-tts-engine';
import { DEFAULT_VOICE_CHAT_VOICE } from '../src/lib/features/voice-chat/voices';

test('speech engine uses Chatterbox PCM in desktop and keeps the browser worker elsewhere', async () => {
	assert.ok(createSpeechEngine() instanceof VitsSpeechEngine); // SSR has no window.
	const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
	const target = new EventTarget() as Window;
	Object.defineProperty(globalThis, 'window', { value: target, configurable: true });
	const calls: { id: number; text: string }[] = [];
	const cancelled: number[] = [];
	const native: DesktopTts = {
		engine: 'chatterbox',
		voice: 'Voice chat agent',
		generate: async (id, text) => {
			calls.push({ id, text });
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
		for (const host of [
			{ version: 1, tts: native },
			{ version: 3, tts: native },
			{ version: 2 },
			{ version: 2, tts: { ...native, engine: 'unsupported' } },
			{ version: 2, tts: { ...native, generate: undefined } }
		]) {
			Reflect.set(target, 'aiChatDesktop', host);
			assert.ok(createSpeechEngine() instanceof VitsSpeechEngine);
		}
		target.aiChatDesktop = { version: 2, tts: native };
		const statuses: string[] = [];
		const engine = createSpeechEngine((status) => statuses.push(status.message));
		assert.equal(engine.constructor, DesktopSpeechEngine);
		const take = engine.synthesize('Hello from the desktop.', DEFAULT_VOICE_CHAT_VOICE);
		const first = calls.at(-1)!;
		assert.match(statuses[0], /Chatterbox Turbo/);
		send({ id: first.id, type: 'progress', progress: 0 });
		assert.match(statuses.at(-1)!, /Generating/);
		assert.equal(first.text, 'Hello from the desktop.');
		await assert.rejects(engine.synthesize('Overlap', DEFAULT_VOICE_CHAT_VOICE), /Wait/);
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
		const aborted = engine.synthesize('Cancel me', DEFAULT_VOICE_CHAT_VOICE);
		const abortedID = calls.at(-1)!.id;
		const rejection = assert.rejects(aborted, { name: 'AbortError' });
		engine.cancel();
		await rejection;
		assert.ok(cancelled.includes(abortedID));
		const next = createSpeechEngine();
		const recovered = next.synthesize('Next instance', DEFAULT_VOICE_CHAT_VOICE);
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
			const result = engine.synthesize('Invalid stream', DEFAULT_VOICE_CHAT_VOICE);
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
		await assert.rejects(engine.synthesize('After dispose', DEFAULT_VOICE_CHAT_VOICE), /closed/);
	} finally {
		if (previous) Object.defineProperty(globalThis, 'window', previous);
		else Reflect.deleteProperty(globalThis, 'window');
	}
});
