import type { TranscribedTextSnapshot } from '$lib/domain/transcribed-text';

export type AudioTranscriptionResponse = {
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
