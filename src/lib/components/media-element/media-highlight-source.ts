import { RichTextHighlightSourceController } from '../rich-text/highlight-source';

/** A time range that has the same semantic ID as an automatic RichText mark. */
export type MediaCue = Readonly<{
	id: string;
	startMs: number;
	endMs: number;
}>;

/** A navigable media range, for example a sentence derived from transcript tokens. */
export type MediaSegment = Readonly<{ startMs: number; endMs: number }>;

export type MediaElementSnapshot = Readonly<{
	currentTimeMs: number;
	durationMs: number | null;
	isReady: boolean;
	isPlaying: boolean;
	error: string | null;
	activeCueIds: readonly string[];
	cueCount: number;
}>;

export type MediaElementListener = (snapshot: MediaElementSnapshot) => void;
type MediaCueActivationHandler = (cue: MediaCue) => boolean | void;

/**
 * A WaveSurfer-facing controller that implements RichText's generic highlight
 * source. It intentionally has no dependency on a particular text model.
 */
export class MediaElementHighlightSource extends RichTextHighlightSourceController {
	#cues: readonly MediaCue[] = [];
	#currentTimeMs = 0;
	#durationMs: number | null = null;
	#isReady = false;
	#isPlaying = false;
	#error: string | null = null;
	#listeners = new Set<MediaElementListener>();
	#cueActivationHandler: MediaCueActivationHandler | null = null;

	constructor(cues: readonly MediaCue[] = []) {
		super();
		this.setCues(cues);
	}

	setCues(cues: readonly MediaCue[]): void {
		this.#cues = Object.freeze(
			cues
				.filter(
					(cue) =>
						Boolean(cue.id) &&
						Number.isFinite(cue.startMs) &&
						Number.isFinite(cue.endMs) &&
						cue.startMs >= 0 &&
						cue.endMs > cue.startMs
				)
				.map((cue) => ({ ...cue }))
				.sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
		);
		this.#publishActiveCues();
		this.#notify();
	}

	setCueActivationHandler(handler: MediaCueActivationHandler | null): void {
		this.#cueActivationHandler = handler;
	}

	/** Allows RichText to seek through a semantic cue ID without knowing about media APIs. */
	activateHighlight(id: string): boolean {
		const cue = this.#cues.find((item) => item.id === id);
		if (!cue || !this.#cueActivationHandler) return false;
		return this.#cueActivationHandler(cue) !== false;
	}

	setCurrentTime(seconds: number): void {
		this.#currentTimeMs = Math.max(0, Number.isFinite(seconds) ? seconds * 1_000 : 0);
		this.#publishActiveCues();
		this.#notify();
	}

	setDuration(seconds: number): void {
		this.#durationMs = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
		this.#notify();
	}

	setReady(isReady: boolean): void {
		this.#isReady = isReady;
		this.#notify();
	}

	setPlaying(isPlaying: boolean): void {
		this.#isPlaying = isPlaying;
		this.#notify();
	}

	setError(error: Error | string | null): void {
		this.#error = error instanceof Error ? error.message : error;
		this.#isReady = false;
		this.#isPlaying = false;
		this.#publishActiveCues([]);
		this.#notify();
	}

	reset(): void {
		this.#currentTimeMs = 0;
		this.#durationMs = null;
		this.#isReady = false;
		this.#isPlaying = false;
		this.#error = null;
		this.#publishActiveCues([]);
		this.#notify();
	}

	inspectMedia(): MediaElementSnapshot {
		return {
			currentTimeMs: this.#currentTimeMs,
			durationMs: this.#durationMs,
			isReady: this.#isReady,
			isPlaying: this.#isPlaying,
			error: this.#error,
			activeCueIds: this.inspect().activeIds,
			cueCount: this.#cues.length
		};
	}

	subscribeMedia(listener: MediaElementListener): () => void {
		this.#listeners.add(listener);
		listener(this.inspectMedia());
		return () => this.#listeners.delete(listener);
	}

	#publishActiveCues(forcedIds?: readonly string[]): void {
		this.publish(
			forcedIds ??
				this.#cues
					.filter((cue) => cue.startMs <= this.#currentTimeMs && this.#currentTimeMs < cue.endMs)
					.map((cue) => cue.id)
		);
	}

	#notify(): void {
		const snapshot = this.inspectMedia();
		for (const listener of this.#listeners) listener(snapshot);
	}
}
