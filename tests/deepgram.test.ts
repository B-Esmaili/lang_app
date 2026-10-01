import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	DeepgramRequestError,
	looksLikeMp3,
	normalizeTranscriptionLanguage,
	parseDeepgramTranscription,
	requestDeepgramTranscription,
	sha256Hex
} from '../src/lib/server/deepgram';

test('creates stable SHA-256 cache keys from the complete audio bytes', () => {
	assert.equal(
		sha256Hex(new TextEncoder().encode('abc')),
		'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
	);
});

test('accepts ID3 and MPEG frame headers while rejecting unrelated files', () => {
	assert.equal(looksLikeMp3(Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0x00])), true);
	assert.equal(looksLikeMp3(Uint8Array.from([0x00, 0xff, 0xfb, 0x90, 0x64])), true);
	assert.equal(looksLikeMp3(new TextEncoder().encode('not audio')), false);
});

test('normalizes supported language tags and rejects malformed values', () => {
	assert.equal(normalizeTranscriptionLanguage(' fa '), 'fa');
	assert.equal(normalizeTranscriptionLanguage('en-US'), 'en-US');
	assert.equal(normalizeTranscriptionLanguage('multi'), 'multi');
	assert.equal(normalizeTranscriptionLanguage(null), 'en');
	assert.throws(
		() => normalizeTranscriptionLanguage('../secret'),
		(error: unknown) => error instanceof DeepgramRequestError && error.status === 400
	);
});

test('extracts channel transcripts and metadata from a Deepgram response', () => {
	assert.deepEqual(
		parseDeepgramTranscription(
			{
				metadata: { request_id: 'request-1', duration: 12.5 },
				results: {
					channels: [
						{
							detected_language: 'en',
							alternatives: [{ transcript: 'First channel.', confidence: 0.9 }]
						},
						{ alternatives: [{ transcript: 'Second channel.', confidence: 0.8 }] }
					]
				}
			},
			'en'
		),
		{
			transcript: 'First channel.\n\nSecond channel.',
			tokens: [],
			language: 'en',
			model: 'nova-3',
			confidence: 0.8500000000000001,
			durationSeconds: 12.5,
			requestId: 'request-1',
			archive: {
				schemaVersion: 1,
				request: {
					endpoint: 'https://api.deepgram.com/v1/listen',
					query: { model: 'nova-3', language: 'en', smart_format: true, punctuate: true }
				},
				response: {
					metadata: { request_id: 'request-1', duration: 12.5 },
					results: {
						channels: [
							{
								detected_language: 'en',
								alternatives: [{ transcript: 'First channel.', confidence: 0.9 }]
							},
							{ alternatives: [{ transcript: 'Second channel.', confidence: 0.8 }] }
						]
					}
				}
			}
		}
	);
});

test('archives every Deepgram JSON field without persisting the audio or credential', () => {
	const payload = {
		metadata: { request_id: 'request-archive', duration: 1.2, extra_metadata: 'kept' },
		results: {
			channels: [
				{
					alternatives: [
						{
							transcript: 'Hello.',
							words: [{ word: 'hello', punctuated_word: 'Hello.', start: 0, end: 0.4 }],
							paragraphs: {
								transcript: 'Hello.',
								paragraphs: [{ sentences: [{ text: 'Hello.' }] }]
							}
						}
					]
				}
			],
			utterances: [{ transcript: 'Hello.', start: 0, end: 0.4, speaker: 0 }],
			entities: [{ value: 'Hello', type: 'Greeting' }]
		},
		provider_extension: { future: ['retained', { exactly: true }] }
	};

	const transcription = parseDeepgramTranscription(payload, 'en-US');

	assert.deepEqual(transcription.archive.response, payload);
	assert.deepEqual(transcription.archive.request, {
		endpoint: 'https://api.deepgram.com/v1/listen',
		query: { model: 'nova-3', language: 'en-US', smart_format: true, punctuate: true }
	});
});

test('retains word timing as reusable transcript tokens', () => {
	const result = parseDeepgramTranscription(
		{
			metadata: { duration: 2 },
			results: {
				channels: [
					{
						alternatives: [
							{
								transcript: 'Hello world.',
								words: [
									{
										word: 'hello',
										punctuated_word: 'Hello',
										start: 0.1,
										end: 0.42,
										confidence: 0.91
									},
									{
										word: 'world',
										punctuated_word: 'world.',
										start: 0.5,
										end: 0.9,
										confidence: 0.95
									}
								]
							}
						]
					}
				]
			}
		},
		'en'
	);

	assert.deepEqual(result.tokens, [
		{ id: 'token.1', text: 'Hello', startMs: 100, endMs: 420, confidence: 0.91 },
		{ id: 'token.2', text: 'world.', startMs: 500, endMs: 900, confidence: 0.95 }
	]);
});

test('sends MP3 bytes to the prerecorded endpoint without exposing options in the body', async () => {
	let called = false;
	const fetcher: typeof fetch = async (input, init) => {
		called = true;
		const url = new URL(String(input));
		assert.equal(url.origin + url.pathname, 'https://api.deepgram.com/v1/listen');
		assert.equal(url.searchParams.get('model'), 'nova-3');
		assert.equal(url.searchParams.get('language'), 'fa');
		assert.equal(url.searchParams.get('smart_format'), 'true');
		assert.equal(new Headers(init?.headers).get('authorization'), 'Token test-key');
		assert.equal(new Headers(init?.headers).get('content-type'), 'audio/mpeg');
		assert.ok(init?.body instanceof ArrayBuffer);
		return Response.json({
			metadata: { request_id: 'request-2', duration: 2 },
			results: { channels: [{ alternatives: [{ transcript: 'سلام', confidence: 0.99 }] }] }
		});
	};

	const result = await requestDeepgramTranscription(Uint8Array.from([0x49, 0x44, 0x33]), {
		apiKey: 'test-key',
		language: 'fa',
		fetcher
	});
	assert.equal(called, true);
	assert.equal(result.transcript, 'سلام');
	assert.equal(result.language, 'fa');
});

test('maps provider authorization failures to a safe gateway error', async () => {
	await assert.rejects(
		requestDeepgramTranscription(Uint8Array.from([0x49, 0x44, 0x33]), {
			apiKey: 'bad-key',
			language: 'en',
			fetcher: async () => Response.json({ error: 'provider detail' }, { status: 401 })
		}),
		(error: unknown) =>
			error instanceof DeepgramRequestError &&
			error.status === 502 &&
			error.providerStatus === 401 &&
			!error.message.includes('provider detail')
	);
});
