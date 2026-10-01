import type { TranscribedTextSnapshot } from '$lib/domain/transcribed-text';
import type { MediaAssetKind } from '$lib/features/media-manager/model';

/** A course-local, normalized alias for a reusable media-library asset. */
export type CourseMediaResource = Readonly<{
	id: string;
	name: string;
	mediaId: string;
	mediaName: string;
	kind: MediaAssetKind;
	sourceUrl: string;
	mimeType: string | null;
	transcribedText: TranscribedTextSnapshot | null;
	createdAt: string;
	updatedAt: string;
}>;

export type CourseMediaCue = Readonly<{
	id: string;
	text: string;
	startMs: number;
	endMs: number;
}>;

/** Turns an author-facing resource name into a stable reference-safe alias. */
export function normalizeCourseMediaResourceName(value: string): string {
	return value
		.normalize('NFKD')
		.toLocaleLowerCase()
		.replace(/[\u0300-\u036f]/gu, '')
		.replace(/[^a-z0-9]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 80);
}

/** Converts a resource transcription into cue IDs scoped to that resource. */
export function courseMediaResourceCues(
	resource: Pick<CourseMediaResource, 'id' | 'transcribedText'>
): CourseMediaCue[] {
	const transcription = resource.transcribedText;
	if (!transcription || transcription.alignment !== 'synced') return [];
	return transcription.tokens
		.filter((token) => token.endMs > token.startMs)
		.map((token) => ({
			id: `${resource.id}:${token.id}`,
			text: token.text,
			startMs: token.startMs,
			endMs: token.endMs
		}));
}

/** Groups aligned transcript tokens into sentence-sized playback ranges. */
export function courseMediaResourceSentenceCues(
	resource: Pick<CourseMediaResource, 'transcribedText'>
): Array<{ startMs: number; endMs: number }> {
	const tokens = resource.transcribedText?.tokens ?? [];
	const ranges: Array<{ startMs: number; endMs: number }> = [];
	let startMs: number | null = null;
	let endMs = 0;
	for (const token of tokens) {
		if (token.endMs <= token.startMs) continue;
		startMs ??= token.startMs;
		endMs = token.endMs;
		if (/[.!?\u061f\u2026\u3002\uff01\uff1f]$/u.test(token.text)) {
			ranges.push({ startMs, endMs });
			startMs = null;
		}
	}
	if (startMs !== null && endMs > startMs) ranges.push({ startMs, endMs });
	return ranges;
}
