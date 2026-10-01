import type { TranscriptTokenSnapshot } from './types';

export type TranscriptTextSource = {
	key: string;
	text: string;
	tokenLocations: Array<{ tokenId: string; textOffset: number }>;
};

/** Builds the transcript text and records each timed token's offset within it. */
export function transcriptTextSources(
	tokens: readonly TranscriptTokenSnapshot[]
): TranscriptTextSource[] {
	let text = '';
	const tokenLocations: TranscriptTextSource['tokenLocations'] = [];
	for (const token of tokens) {
		const tokenText = token.text.trim();
		if (!tokenText) continue;
		const textOffset = text ? text.length + 1 : 0;
		text = text ? `${text} ${tokenText}` : tokenText;
		tokenLocations.push({ tokenId: token.id, textOffset });
	}
	return text ? [{ key: 'transcript', text, tokenLocations }] : [];
}
