import type { TranscriptTokenId } from './text-range';

export const TRANSCRIBED_TEXT_SCHEMA_VERSION = 1 as const;

export type TranscribedTextAlignment = 'synced' | 'stale' | 'missing';

export type TranscriptTokenSnapshot = {
	id: TranscriptTokenId;
	text: string;
	startMs: number;
	endMs: number;
	confidence: number | null;
};

export type TranscribedTextSnapshot = {
	schemaVersion: typeof TRANSCRIBED_TEXT_SCHEMA_VERSION;
	id: string;
	revision: number;
	text: string;
	language: string;
	normalization: 'NFC';
	alignment: TranscribedTextAlignment;
	durationMs: number | null;
	tokens: TranscriptTokenSnapshot[];
};

export type TranscribedTextInspection = {
	id: string;
	revision: number;
	language: string;
	normalization: 'NFC';
	alignment: TranscribedTextAlignment;
	tokenCount: number;
	durationMs: number | null;
};
