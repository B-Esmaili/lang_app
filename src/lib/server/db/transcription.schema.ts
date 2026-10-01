import { doublePrecision, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { TranscribedTextSnapshot } from '$lib/domain/transcribed-text';
import type { DeepgramTranscriptionArchive } from '$lib/server/deepgram';

/**
 * Content-addressed cache for speech-to-text results. Audio bytes are never
 * persisted. The cache key includes transcription options, while the snapshot
 * is the reusable, provider-aligned transcribed-text entity.
 */
export const audioTranscription = pgTable('audio_transcription', {
	cacheKey: text('cache_key').primaryKey(),
	sha256: text('sha256').notNull(),
	transcript: text('transcript').notNull(),
	transcribedText: jsonb('transcribed_text').$type<TranscribedTextSnapshot>().notNull(),
	language: text('language').notNull(),
	model: text('model').notNull(),
	confidence: doublePrecision('confidence'),
	durationSeconds: doublePrecision('duration_seconds'),
	deepgramRequestId: text('deepgram_request_id'),
	/** Unfiltered successful Deepgram JSON body and non-sensitive request options. */
	deepgramArchive: jsonb('deepgram_archive').$type<DeepgramTranscriptionArchive>(),
	byteLength: integer('byte_length').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	lastAccessedAt: timestamp('last_accessed_at').defaultNow().notNull()
});
