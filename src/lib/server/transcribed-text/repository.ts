import type { TranscribedTextSnapshot } from '$lib/domain/transcribed-text';
import type { DeepgramTranscriptionArchive } from '$lib/server/deepgram';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { audioTranscription } from '$lib/server/db/schema';

export type TranscribedTextCacheEntry = {
	cacheKey: string;
	sha256: string;
	transcribedText: TranscribedTextSnapshot;
	model: string;
	confidence: number | null;
	durationSeconds: number | null;
	requestId: string | null;
	/** Full provider response retained for future server-side enrichment. */
	deepgramArchive: DeepgramTranscriptionArchive | null;
	byteLength: number;
};

export interface TranscribedTextRepository {
	get(cacheKey: string): Promise<TranscribedTextCacheEntry | null>;
	save(entry: TranscribedTextCacheEntry): Promise<TranscribedTextCacheEntry>;
}

export class PostgresTranscribedTextRepository implements TranscribedTextRepository {
	async get(cacheKey: string): Promise<TranscribedTextCacheEntry | null> {
		const [row] = await db
			.select()
			.from(audioTranscription)
			.where(eq(audioTranscription.cacheKey, cacheKey))
			.limit(1);
		if (!row) return null;

		await db
			.update(audioTranscription)
			.set({ lastAccessedAt: new Date() })
			.where(eq(audioTranscription.cacheKey, cacheKey));
		return entryFromRow(row);
	}

	async save(entry: TranscribedTextCacheEntry): Promise<TranscribedTextCacheEntry> {
		const [inserted] = await db
			.insert(audioTranscription)
			.values({
				cacheKey: entry.cacheKey,
				sha256: entry.sha256,
				transcript: entry.transcribedText.text,
				transcribedText: entry.transcribedText,
				language: entry.transcribedText.language,
				model: entry.model,
				confidence: entry.confidence,
				durationSeconds: entry.durationSeconds,
				deepgramRequestId: entry.requestId,
				deepgramArchive: entry.deepgramArchive,
				byteLength: entry.byteLength
			})
			.onConflictDoNothing({ target: audioTranscription.cacheKey })
			.returning();
		if (inserted) return entryFromRow(inserted);

		const raced = await this.get(entry.cacheKey);
		if (!raced) throw new Error('The transcribed text could not be cached.');
		return raced;
	}
}

/** A small process-local read-through cache in front of the durable repository. */
export class CachedTranscribedTextRepository implements TranscribedTextRepository {
	private readonly values = new Map<string, TranscribedTextCacheEntry>();

	constructor(
		private readonly durable: TranscribedTextRepository,
		private readonly capacity = 100
	) {}

	async get(cacheKey: string): Promise<TranscribedTextCacheEntry | null> {
		const memory = this.values.get(cacheKey);
		if (memory) {
			this.values.delete(cacheKey);
			this.values.set(cacheKey, memory);
			return structuredClone(memory);
		}

		const durable = await this.durable.get(cacheKey);
		if (!durable) return null;
		this.remember(durable);
		return structuredClone(durable);
	}

	async save(entry: TranscribedTextCacheEntry): Promise<TranscribedTextCacheEntry> {
		const saved = await this.durable.save(entry);
		this.remember(saved);
		return structuredClone(saved);
	}

	private remember(entry: TranscribedTextCacheEntry) {
		this.values.delete(entry.cacheKey);
		this.values.set(entry.cacheKey, structuredClone(entry));
		while (this.values.size > this.capacity) {
			const oldest = this.values.keys().next().value;
			if (oldest === undefined) return;
			this.values.delete(oldest);
		}
	}
}

function entryFromRow(row: typeof audioTranscription.$inferSelect): TranscribedTextCacheEntry {
	return {
		cacheKey: row.cacheKey,
		sha256: row.sha256,
		transcribedText: row.transcribedText,
		model: row.model,
		confidence: row.confidence,
		durationSeconds: row.durationSeconds,
		requestId: row.deepgramRequestId,
		deepgramArchive: row.deepgramArchive,
		byteLength: row.byteLength
	};
}
