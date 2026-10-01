import {
	Timecode,
	TranscribedText,
	type TranscribedTextSnapshot
} from '$lib/domain/transcribed-text';
import { env } from '$env/dynamic/private';
import {
	DeepgramRequestError,
	DEEPGRAM_TRANSCRIPTION_MODEL,
	requestDeepgramTranscription,
	sha256Hex
} from '$lib/server/deepgram';
import {
	CachedTranscribedTextRepository,
	PostgresTranscribedTextRepository,
	type TranscribedTextCacheEntry
} from '$lib/server/transcribed-text/repository';

export type AudioTranscriptionResult = {
	sha256: string;
	transcript: string;
	transcribedText: TranscribedTextSnapshot;
	language: string;
	model: string;
	confidence: number | null;
	durationSeconds: number | null;
	requestId: string | null;
	byteLength: number;
	cacheHit: boolean;
};

const TRANSCRIPTION_CACHE_SCHEMA_VERSION = 3;
const repository = new CachedTranscribedTextRepository(new PostgresTranscribedTextRepository());
const activeTranscriptions = new Map<string, Promise<AudioTranscriptionResult>>();

export async function transcribeMp3WithCache(
	bytes: Uint8Array,
	language: string,
	fetcher: typeof fetch = fetch
): Promise<AudioTranscriptionResult> {
	const sha256 = sha256Hex(bytes);
	const cacheKey = transcriptionCacheKey(sha256, language);
	const cached = await repository.get(cacheKey);
	if (cached) return responseFromEntry(cached, true);

	const active = activeTranscriptions.get(cacheKey);
	if (active) return { ...(await active), cacheHit: true };

	const job = transcribeAndCache({ cacheKey, sha256, bytes, language, fetcher });
	activeTranscriptions.set(cacheKey, job);
	try {
		return await job;
	} finally {
		activeTranscriptions.delete(cacheKey);
	}
}

export function transcriptionCacheKey(sha256: string, language: string): string {
	return [
		sha256,
		language.toLocaleLowerCase(),
		DEEPGRAM_TRANSCRIPTION_MODEL,
		`alignment-v${TRANSCRIPTION_CACHE_SCHEMA_VERSION}`
	].join(':');
}

async function transcribeAndCache(input: {
	cacheKey: string;
	sha256: string;
	bytes: Uint8Array;
	language: string;
	fetcher: typeof fetch;
}): Promise<AudioTranscriptionResult> {
	if (!env.DEEPGRAM_API_KEY) {
		throw new DeepgramRequestError('Deepgram transcription is not configured.', 503);
	}

	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 180_000);
	try {
		const transcription = await requestDeepgramTranscription(input.bytes, {
			apiKey: env.DEEPGRAM_API_KEY,
			language: input.language,
			fetcher: input.fetcher,
			signal: abortController.signal
		});
		const transcribedText = TranscribedText.create({
			id: `transcript.${input.cacheKey}`,
			revision: 1,
			text: transcription.transcript,
			language: transcription.language,
			normalization: 'NFC',
			alignment: transcription.tokens.length > 0 ? 'synced' : 'missing',
			durationMs:
				transcription.durationSeconds === null
					? null
					: Timecode.fromSeconds(transcription.durationSeconds).toMilliseconds(),
			tokens: transcription.tokens
		}).toSnapshot();
		const saved = await repository.save({
			cacheKey: input.cacheKey,
			sha256: input.sha256,
			transcribedText,
			model: transcription.model,
			confidence: transcription.confidence,
			durationSeconds: transcription.durationSeconds,
			requestId: transcription.requestId,
			deepgramArchive: transcription.archive,
			byteLength: input.bytes.byteLength
		});
		return responseFromEntry(saved, false);
	} finally {
		clearTimeout(timeout);
	}
}

function responseFromEntry(
	entry: TranscribedTextCacheEntry,
	cacheHit: boolean
): AudioTranscriptionResult {
	const transcribedText = TranscribedText.rehydrate(entry.transcribedText).toSnapshot();
	return {
		sha256: entry.sha256,
		transcript: transcribedText.text,
		transcribedText,
		language: transcribedText.language,
		model: entry.model,
		confidence: entry.confidence,
		durationSeconds: entry.durationSeconds,
		requestId: entry.requestId,
		byteLength: entry.byteLength,
		cacheHit
	};
}
