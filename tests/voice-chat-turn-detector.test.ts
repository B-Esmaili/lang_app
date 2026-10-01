import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	TurnDetector,
	HANDS_FREE_IDLE_MS,
	HANDS_FREE_SILENCE_MS
} from '../src/lib/features/voice-chat/turn-detector';

function feed(detector: TurnDetector, ms: number, amplitude = 0, sampleRate = 16_000, offset = 0) {
	let result: ReturnType<TurnDetector['push']> = 'listening';
	for (let elapsed = 0; elapsed < ms; elapsed += 20) {
		const samples = Float32Array.from(
			{ length: sampleRate / 50 },
			(_, i) => offset + amplitude * Math.sin((2 * Math.PI * 300 * i) / sampleRate)
		);
		result = detector.push(samples, sampleRate);
	}
	return result;
}

test('automatic turns end only after voice followed by the full silence interval', () => {
	for (const sampleRate of [16_000, 44_100, 48_000]) {
		const detector = new TurnDetector();
		assert.equal(feed(detector, 500, 0, sampleRate), 'listening');
		assert.equal(feed(detector, 600, 0.1, sampleRate), 'listening');
		assert.equal(detector.hasSpeech, true);
		assert.equal(feed(detector, HANDS_FREE_SILENCE_MS - 20, 0, sampleRate), 'listening');
		assert.equal(feed(detector, 20, 0, sampleRate), 'finished');
		assert.equal(
			feed(detector, 100, 0.1, sampleRate),
			'finished',
			'completed turns stay completed'
		);
	}
});

test('short thinking pauses do not split an answer', () => {
	const detector = new TurnDetector();
	feed(detector, 500, 0.1);
	assert.equal(feed(detector, 1_500), 'listening');
	feed(detector, 500, 0.1);
	assert.equal(feed(detector, 1_500), 'listening');
	assert.equal(feed(detector, 500), 'finished');
});

test('silence, low background noise, and microphone DC offset never send an answer', () => {
	for (const [amplitude, offset] of [
		[0, 0],
		[0.003, 0],
		[0, 0.3]
	]) {
		const detector = new TurnDetector();
		assert.equal(feed(detector, HANDS_FREE_IDLE_MS, amplitude, 16_000, offset), 'empty');
		assert.equal(detector.hasSpeech, false);
	}
});

test('isolated clicks and taps do not accumulate into a student answer', () => {
	const detector = new TurnDetector();
	for (let i = 0; i < 10; i++) {
		feed(detector, 40, 0.8);
		feed(detector, 600);
	}
	assert.equal(detector.hasSpeech, false);
	assert.equal(feed(detector, HANDS_FREE_IDLE_MS), 'empty');
});

test('short spoken answers are retained and continuous input waits for the recorder duration cap', () => {
	const detector = new TurnDetector();
	feed(detector, 220, 0.08);
	assert.equal(feed(detector, HANDS_FREE_SILENCE_MS), 'finished');
	assert.equal(feed(new TurnDetector(), 30_000, 0.08), 'listening');
});

test('invalid samples or rates cannot trigger automatic submission', () => {
	const detector = new TurnDetector();
	for (const rate of [0, NaN, -1])
		assert.equal(detector.push(new Float32Array(10), rate), 'listening');
	assert.equal(detector.push(new Float32Array([NaN, Infinity]), 16_000), 'listening');
	assert.equal(detector.hasSpeech, false);
});
