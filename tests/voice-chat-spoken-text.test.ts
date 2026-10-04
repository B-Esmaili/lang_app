import test from 'node:test';
import assert from 'node:assert/strict';
import { spokenTextAt } from '../src/lib/features/voice-chat/spoken-text';

test('reveals complete words according to playback, keeping the rest hidden', () => {
	const reply = 'Hello there. Let us practice English.';
	assert.equal(spokenTextAt(reply, 0), 'Hello ');
	assert.equal(spokenTextAt(reply, 0.5), 'Hello there. Let ');
	assert.equal(spokenTextAt(reply, 0.99), 'Hello there. Let us practice ');
	assert.equal(spokenTextAt(reply, 1), reply);
	assert.equal(spokenTextAt(reply, Number.NaN), 'Hello ');
});
