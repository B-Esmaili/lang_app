import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	Timecode,
	TranscribedText,
	transcriptTextSources
} from '../src/lib/domain/transcribed-text';

function text() {
	return TranscribedText.create({
		id: 'transcript.example',
		revision: 1,
		text: 'Hello world.',
		language: 'en',
		normalization: 'NFC',
		alignment: 'synced',
		durationMs: 1_000,
		tokens: [
			{ id: 'token.1', text: 'Hello', startMs: 0, endMs: 350, confidence: 0.9 },
			{ id: 'token.2', text: 'world.', startMs: 420, endMs: 850, confidence: 0.95 }
		]
	});
}

test('finds a timed token without exposing text offsets', () => {
	const transcript = text();
	assert.equal(transcript.tokenAt(Timecode.fromMilliseconds(100))?.id, 'token.1');
	assert.equal(transcript.tokenAt(Timecode.fromMilliseconds(500))?.id, 'token.2');
	assert.equal(transcript.tokenAt(Timecode.fromMilliseconds(971)), null);
	assert.deepEqual(transcript.rangeFor('token.2')?.inspect(), {
		start: { tokenId: 'token.2', edge: 'start' },
		end: { tokenId: 'token.2', edge: 'end' }
	});
});

test('editing creates a new stale alignment revision', () => {
	const edited = text().withEditedText('Hello, world!');
	assert.equal(edited.inspect().revision, 2);
	assert.equal(edited.inspect().alignment, 'stale');
	assert.equal(edited.tokenAt(Timecode.fromMilliseconds(100)), null);
});

test('expands an underreported provider duration to contain the final token', () => {
	const transcript = TranscribedText.create({
		id: 'transcript.rounding',
		revision: 1,
		text: 'Final word',
		language: 'en',
		normalization: 'NFC',
		alignment: 'synced',
		durationMs: 1_000,
		tokens: [{ id: 'token.final', text: 'word', startMs: 920, endMs: 1_004, confidence: 0.9 }]
	});

	assert.equal(transcript.inspect().durationMs, 1_004);
});

test('maps timed tokens to stable transcript source keys and offsets', () => {
	const sources = transcriptTextSources([
		{ id: 'token.1', text: 'Well,', startMs: 0, endMs: 100, confidence: 0.9 },
		{ id: 'token.2', text: 'hello.', startMs: 110, endMs: 300, confidence: 0.9 },
		{ id: 'token.3', text: 'maybe', startMs: 310, endMs: 400, confidence: 0.9 },
		{ id: 'token.4', text: 'Hi!', startMs: 410, endMs: 600, confidence: 0.9 },
		{ id: 'token.5', text: 'Again.', startMs: 610, endMs: 800, confidence: 0.9 }
	]);

	assert.deepEqual(sources, [
		{
			key: 'transcript',
			text: 'Well, hello. maybe Hi! Again.',
			tokenLocations: [
				{ tokenId: 'token.1', textOffset: 0 },
				{ tokenId: 'token.2', textOffset: 6 },
				{ tokenId: 'token.3', textOffset: 13 },
				{ tokenId: 'token.4', textOffset: 19 },
				{ tokenId: 'token.5', textOffset: 23 }
			]
		}
	]);
	assert.deepEqual(
		transcriptTextSources([
			{ id: 'token.a', text: 'go', startMs: 0, endMs: 100, confidence: 0.9 },
			{ id: 'token.b', text: 'go', startMs: 110, endMs: 200, confidence: 0.9 }
		]),
		[
			{
				key: 'transcript',
				text: 'go go',
				tokenLocations: [
					{ tokenId: 'token.a', textOffset: 0 },
					{ tokenId: 'token.b', textOffset: 3 }
				]
			}
		]
	);
});
