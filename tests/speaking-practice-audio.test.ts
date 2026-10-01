import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createWavBlob,
	resampleMono,
	validateRecording
} from '../src/lib/features/speaking-practice/audio-recorder';

function sine(
	frequency: number,
	sampleRate: number,
	seconds: number,
	amplitude = 0.3
): Float32Array {
	return Float32Array.from(
		{ length: Math.round(sampleRate * seconds) },
		(_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
	);
}

function rms(samples: Float32Array): number {
	return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
}

test('resamples common microphone rates to 16 kHz without changing duration or speech-band pitch', () => {
	for (const sourceRate of [44_100, 48_000]) {
		const original = sine(1_000, sourceRate, 0.5);
		const actual = resampleMono(original, sourceRate);
		const expected = sine(1_000, 16_000, 0.5);
		assert.equal(actual.length, 8_000);
		const errors = actual.slice(24, -24).map((value, i) => value - expected[i + 24]);
		assert.ok(rms(errors) < 0.002, 'speech-band signal should survive conversion');
	}
});

test('filters frequencies above the target Nyquist limit instead of aliasing them into speech', () => {
	const original = sine(12_000, 48_000, 0.5);
	const converted = resampleMono(original, 48_000);
	assert.ok(rms(converted.slice(24, -24)) < rms(original) * 0.02);
});

test('resampling keeps amplitude and independent buffers and rejects invalid rates', () => {
	const samples = new Float32Array(48_000).fill(0.25);
	const converted = resampleMono(samples, 48_000);
	assert.ok(converted.every((sample) => Math.abs(sample - 0.25) < 0.00001));
	const copied = resampleMono(converted, 16_000);
	copied[0] = 0;
	assert.equal(converted[0], 0.25);
	assert.throws(() => resampleMono(samples, 0), /sample rate/);
});

test('rejects silence, constant microphone offset, very short input, and an isolated tap', () => {
	assert.throws(() => validateRecording(new Float32Array(16_000)), /No clear audio/);
	assert.throws(() => validateRecording(new Float32Array(16_000).fill(0.1)), /No clear audio/);
	assert.throws(() => validateRecording(sine(300, 16_000, 0.1)), /too short/);
	const tap = new Float32Array(16_000);
	tap.set(sine(1_000, 16_000, 0.04), 8_000);
	assert.throws(() => validateRecording(tap), /No clear audio/);
	assert.doesNotThrow(() => validateRecording(sine(300, 16_000, 0.5, 0.01)));
	const corrupt = sine(300, 16_000, 0.5);
	corrupt[123] = NaN;
	assert.throws(() => validateRecording(corrupt), /could not be read/);
});

test('encodes replay as mono 16-bit WAV with the correct rate, lengths and clipped signed samples', async () => {
	const blob = createWavBlob(Float32Array.from([-2, -1, 0, 1, 2]));
	assert.equal(blob.type, 'audio/wav');
	const bytes = await blob.arrayBuffer();
	const view = new DataView(bytes);
	const text = new TextDecoder().decode(bytes);
	assert.equal(text.slice(0, 4), 'RIFF');
	assert.equal(text.slice(8, 12), 'WAVE');
	assert.equal(view.getUint16(22, true), 1);
	assert.equal(view.getUint32(24, true), 16_000);
	assert.equal(view.getUint32(28, true), 32_000);
	assert.equal(view.getUint16(34, true), 16);
	assert.equal(view.getUint32(4, true), bytes.byteLength - 8);
	assert.equal(view.getUint32(40, true), 10);
	assert.deepEqual(
		Array.from({ length: 5 }, (_, index) => view.getInt16(44 + index * 2, true)),
		[-32768, -32768, 0, 32767, 32767]
	);
});
