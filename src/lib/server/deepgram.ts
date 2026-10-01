import { createHash } from 'node:crypto';
import type { TranscriptTokenSnapshot } from '$lib/domain/transcribed-text';

export const DEEPGRAM_TRANSCRIPTION_MODEL = 'nova-3';
export const MAX_MP3_BYTES = 25 * 1024 * 1024;

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

/**
 * Durable provider provenance for one successful Deepgram request. `response`
 * is an unfiltered JSON clone of the provider body: normalized application
 * fields may evolve without discarding provider data that was already paid for.
 */
export type DeepgramTranscriptionArchive = Readonly<{
	schemaVersion: 1;
	request: Readonly<{
		endpoint: 'https://api.deepgram.com/v1/listen';
		query: Readonly<{
			model: string;
			language: string;
			smart_format: true;
			punctuate: true;
		}>;
	}>;
	response: JsonObject;
}>;

export type DeepgramTranscription = {
	transcript: string;
	tokens: TranscriptTokenSnapshot[];
	language: string;
	model: string;
	confidence: number | null;
	durationSeconds: number | null;
	requestId: string | null;
	/** Full successful provider response plus the non-sensitive request options. */
	archive: DeepgramTranscriptionArchive;
};

type DeepgramAlternative = {
	transcript?: unknown;
	confidence?: unknown;
	words?: unknown;
};

type DeepgramWord = {
	word?: unknown;
	punctuated_word?: unknown;
	start?: unknown;
	end?: unknown;
	confidence?: unknown;
};

type DeepgramChannel = {
	alternatives?: unknown;
	detected_language?: unknown;
};

type DeepgramPayload = {
	metadata?: unknown;
	results?: unknown;
};

export class DeepgramRequestError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly providerStatus?: number
	) {
		super(message);
		this.name = 'DeepgramRequestError';
	}
}

export function sha256Hex(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

export function normalizeTranscriptionLanguage(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) return 'en';
	const language = value.trim();
	if (!/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language) && language !== 'multi') {
		throw new DeepgramRequestError('Choose a valid audio language.', 400);
	}
	return language;
}

export function looksLikeMp3(bytes: Uint8Array): boolean {
	if (bytes.length < 3) return false;
	if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;

	const scanLength = Math.min(bytes.length - 3, 4096);
	for (let index = 0; index < scanLength; index += 1) {
		if (bytes[index] !== 0xff || (bytes[index + 1] & 0xe0) !== 0xe0) continue;
		const version = (bytes[index + 1] >> 3) & 0x03;
		const layer = (bytes[index + 1] >> 1) & 0x03;
		const bitrate = (bytes[index + 2] >> 4) & 0x0f;
		const sampleRate = (bytes[index + 2] >> 2) & 0x03;
		if (version !== 1 && layer !== 0 && bitrate !== 0 && bitrate !== 15 && sampleRate !== 3) {
			return true;
		}
	}
	return false;
}

export async function requestDeepgramTranscription(
	bytes: Uint8Array,
	options: {
		apiKey: string;
		language: string;
		fetcher?: typeof fetch;
		signal?: AbortSignal;
	}
): Promise<DeepgramTranscription> {
	const fetcher = options.fetcher ?? fetch;
	const endpoint = new URL('https://api.deepgram.com/v1/listen');
	endpoint.searchParams.set('model', DEEPGRAM_TRANSCRIPTION_MODEL);
	endpoint.searchParams.set('language', options.language);
	endpoint.searchParams.set('smart_format', 'true');
	endpoint.searchParams.set('punctuate', 'true');

	let response: Response;
	try {
		const requestBody = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(requestBody).set(bytes);
		response = await fetcher(endpoint, {
			method: 'POST',
			headers: {
				accept: 'application/json',
				authorization: `Token ${options.apiKey}`,
				'content-type': 'audio/mpeg'
			},
			body: requestBody,
			signal: options.signal
		});
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new DeepgramRequestError('Transcription timed out. Try a shorter file.', 504);
		}
		throw new DeepgramRequestError('The transcription service is unavailable.', 503);
	}

	const payload = (await response.json().catch(() => null)) as DeepgramPayload | null;
	if (!response.ok) {
		throw new DeepgramRequestError(
			response.status === 401 || response.status === 403
				? 'The transcription service is not configured correctly.'
				: 'Deepgram could not transcribe this audio file.',
			502,
			response.status
		);
	}

	return parseDeepgramTranscription(payload, options.language);
}

export function parseDeepgramTranscription(
	payload: DeepgramPayload | null,
	requestedLanguage: string
): DeepgramTranscription {
	if (!payload || typeof payload !== 'object') {
		throw new DeepgramRequestError('Deepgram returned an invalid response.', 502);
	}

	const results = objectValue(payload.results);
	const channels = Array.isArray(results?.channels)
		? (results.channels.filter(isObject) as DeepgramChannel[])
		: [];
	const alternatives = channels
		.map((channel) =>
			Array.isArray(channel.alternatives)
				? (channel.alternatives.find(isObject) as DeepgramAlternative | undefined)
				: undefined
		)
		.filter((alternative): alternative is DeepgramAlternative => Boolean(alternative));
	const transcripts = alternatives
		.map((alternative) =>
			typeof alternative.transcript === 'string' ? alternative.transcript.trim() : ''
		)
		.filter(Boolean);
	const confidences = alternatives
		.map((alternative) => alternative.confidence)
		.filter((confidence): confidence is number =>
			Number.isFinite(typeof confidence === 'number' ? confidence : Number.NaN)
		);
	const metadata = objectValue(payload.metadata);
	const detectedLanguage = channels.find(
		(channel) => typeof channel.detected_language === 'string'
	)?.detected_language;
	const tokens = alternatives
		.flatMap((alternative) =>
			(Array.isArray(alternative.words) ? alternative.words.filter(isObject) : []).map((word) =>
				wordToken(word as DeepgramWord)
			)
		)
		.filter((token): token is Omit<TranscriptTokenSnapshot, 'id'> => Boolean(token))
		.toSorted((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
		.map((token, index) => ({
			...token,
			id: `token.${index + 1}` as TranscriptTokenSnapshot['id']
		}));

	return {
		transcript: transcripts.join('\n\n'),
		tokens,
		language: typeof detectedLanguage === 'string' ? detectedLanguage : requestedLanguage,
		model: DEEPGRAM_TRANSCRIPTION_MODEL,
		confidence:
			confidences.length > 0
				? confidences.reduce((total, confidence) => total + confidence, 0) / confidences.length
				: null,
		durationSeconds: finiteNumber(metadata?.duration),
		requestId: typeof metadata?.request_id === 'string' ? metadata.request_id : null,
		archive: createDeepgramTranscriptionArchive(payload, requestedLanguage)
	};
}

/**
 * Creates the durable provider snapshot. The input is JSON parsed directly
 * from Deepgram, so this losslessly retains every JSON field without keeping
 * the submitted audio, request headers, or credential.
 */
export function createDeepgramTranscriptionArchive(
	payload: DeepgramPayload,
	requestedLanguage: string
): DeepgramTranscriptionArchive {
	return {
		schemaVersion: 1,
		request: {
			endpoint: 'https://api.deepgram.com/v1/listen',
			query: {
				model: DEEPGRAM_TRANSCRIPTION_MODEL,
				language: requestedLanguage,
				smart_format: true,
				punctuate: true
			}
		},
		response: cloneJsonObject(payload)
	};
}

function wordToken(word: DeepgramWord): Omit<TranscriptTokenSnapshot, 'id'> | null {
	const text =
		typeof word.punctuated_word === 'string' && word.punctuated_word.trim()
			? word.punctuated_word
			: typeof word.word === 'string'
				? word.word
				: '';
	const start = finiteNumber(word.start);
	const end = finiteNumber(word.end);
	if (!text.trim() || start === null || end === null || start < 0 || end < start) return null;
	return {
		text,
		startMs: Math.round(start * 1_000),
		endMs: Math.round(end * 1_000),
		confidence: finiteNumber(word.confidence)
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectValue(value: unknown): Record<string, unknown> | null {
	return isObject(value) ? value : null;
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cloneJsonObject(value: unknown): JsonObject {
	if (!isObject(value)) {
		throw new DeepgramRequestError('Deepgram returned an invalid response.', 502);
	}
	// Response.json supplies JSON values. A JSON round-trip produces a detached,
	// database-safe record while preserving all fields and their nested shape.
	const clone = JSON.parse(JSON.stringify(value)) as unknown;
	if (!isObject(clone)) {
		throw new DeepgramRequestError('Deepgram returned an invalid response.', 502);
	}
	return clone as JsonObject;
}
