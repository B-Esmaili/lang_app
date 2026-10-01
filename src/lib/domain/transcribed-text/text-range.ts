/**
 * Text is addressed by stable transcript tokens rather than JavaScript string
 * offsets. A renderer may translate this to a DOM range if it needs to, but
 * storage and feature code never depend on UTF-16 code units.
 */
/** Stable provider/domain identifier; never a string position within the text. */
export type TranscriptTokenId = string;

export type TextAnchor = {
	tokenId: TranscriptTokenId;
	edge: 'start' | 'end';
};

export class TextRange {
	private constructor(
		readonly start: TextAnchor,
		readonly end: TextAnchor
	) {}

	static forToken(tokenId: TranscriptTokenId): TextRange {
		return new TextRange({ tokenId, edge: 'start' }, { tokenId, edge: 'end' });
	}

	inspect() {
		return { start: { ...this.start }, end: { ...this.end } };
	}
}
