import { TextRange, type TranscriptTokenId } from './text-range';
import { Timecode } from './timecode';
import {
	TRANSCRIBED_TEXT_SCHEMA_VERSION,
	type TranscriptTokenSnapshot,
	type TranscribedTextInspection,
	type TranscribedTextSnapshot
} from './types';

export class TranscribedText {
	private constructor(private readonly value: TranscribedTextSnapshot) {}

	static create(input: Omit<TranscribedTextSnapshot, 'schemaVersion'>): TranscribedText {
		return new TranscribedText(
			normalizeSnapshot({ ...input, schemaVersion: TRANSCRIBED_TEXT_SCHEMA_VERSION })
		);
	}

	static rehydrate(snapshot: TranscribedTextSnapshot): TranscribedText {
		if (snapshot.schemaVersion !== TRANSCRIBED_TEXT_SCHEMA_VERSION) {
			throw new RangeError(
				`Unsupported transcribed-text schema version: ${snapshot.schemaVersion}`
			);
		}
		return new TranscribedText(normalizeSnapshot(snapshot));
	}

	toSnapshot(): TranscribedTextSnapshot {
		return structuredClone(this.value);
	}

	inspect(): TranscribedTextInspection {
		return {
			id: this.value.id,
			revision: this.value.revision,
			language: this.value.language,
			normalization: this.value.normalization,
			alignment: this.value.alignment,
			tokenCount: this.value.tokens.length,
			durationMs: this.value.durationMs
		};
	}

	text(): string {
		return this.value.text;
	}

	tokens(): readonly TranscriptTokenSnapshot[] {
		return this.value.tokens;
	}

	/** Finds the active cue without exposing text offsets to callers. */
	tokenAt(position: Timecode, trailingWindowMs = 120): TranscriptTokenSnapshot | null {
		if (this.value.alignment !== 'synced' || this.value.tokens.length === 0) return null;
		const elapsed = position.toMilliseconds();
		let low = 0;
		let high = this.value.tokens.length - 1;
		let candidate = -1;

		while (low <= high) {
			const middle = Math.floor((low + high) / 2);
			if (this.value.tokens[middle].startMs <= elapsed) {
				candidate = middle;
				low = middle + 1;
			} else {
				high = middle - 1;
			}
		}

		const token = candidate >= 0 ? this.value.tokens[candidate] : undefined;
		return token && elapsed <= token.endMs + trailingWindowMs ? token : null;
	}

	rangeFor(tokenId: TranscriptTokenId): TextRange | null {
		return this.value.tokens.some((token) => token.id === tokenId)
			? TextRange.forToken(tokenId)
			: null;
	}

	/** Editing text invalidates provider alignment but preserves it for review/regeneration. */
	withEditedText(text: string): TranscribedText {
		return TranscribedText.create({
			...this.value,
			revision: this.value.revision + 1,
			text,
			alignment: this.value.tokens.length > 0 ? 'stale' : this.value.alignment
		});
	}
}

function normalizeSnapshot(snapshot: TranscribedTextSnapshot): TranscribedTextSnapshot {
	if (!snapshot.id.trim()) throw new RangeError('A transcribed text needs an id.');
	if (!snapshot.language.trim()) throw new RangeError('A transcribed text needs a language.');
	if (!Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
		throw new RangeError('A transcribed text revision must be a positive integer.');
	}

	let previousStart = 0;
	let furthestEnd = 0;
	const ids = new Set<string>();
	const tokens = snapshot.tokens.map((token, index) => {
		if (!token.id || ids.has(token.id))
			throw new RangeError('Transcript token ids must be unique.');
		ids.add(token.id);
		if (!token.text.trim()) throw new RangeError('Transcript tokens need text.');
		if (!Number.isInteger(token.startMs) || !Number.isInteger(token.endMs)) {
			throw new RangeError('Transcript token timing must use whole milliseconds.');
		}
		if (token.startMs < previousStart || token.endMs < token.startMs) {
			throw new RangeError(`Transcript token ${index + 1} has invalid timing.`);
		}
		previousStart = token.startMs;
		furthestEnd = Math.max(furthestEnd, token.endMs);
		return {
			...token,
			text: token.text.normalize('NFC'),
			confidence: Number.isFinite(token.confidence) ? token.confidence : null
		};
	});

	const reportedDurationMs = snapshot.durationMs;
	if (reportedDurationMs !== null && (!Number.isInteger(reportedDurationMs) || reportedDurationMs < 0)) {
		throw new RangeError('Transcript duration must be a non-negative whole millisecond value.');
	}
	// Providers can report a duration that is a few milliseconds shorter than a
	// final token after their floating-point timestamps are rounded. Preserve all
	// timed words by storing the duration that covers both values.
	const durationMs =
		reportedDurationMs === null ? null : Math.max(reportedDurationMs, furthestEnd);

	return {
		...snapshot,
		id: snapshot.id.trim(),
		text: snapshot.text.normalize('NFC'),
		language: snapshot.language.trim(),
		normalization: 'NFC',
		durationMs,
		tokens
	};
}
