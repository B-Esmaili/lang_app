/** A semantic highlight produced by something outside the text component. */
export type RichTextHighlightSnapshot = Readonly<{
	/** IDs attached to `automaticHighlight` marks in a RichText document. */
	activeIds: readonly string[];
}>;

export type RichTextHighlightListener = (snapshot: RichTextHighlightSnapshot) => void;

/**
 * The only dependency RichText has on an automatic highlighter.
 *
 * Implementations may be driven by audio, video, a timer, a screen reader, or
 * any other system. IDs are semantic anchors, deliberately not text offsets.
 */
export interface RichTextHighlightSource {
	subscribe(listener: RichTextHighlightListener): () => void;
	inspect(): RichTextHighlightSnapshot;
}

/**
 * Optional capability for sources that can navigate to a semantic text anchor.
 * RichText uses this structurally, so it remains independent of media players.
 */
export interface RichTextHighlightActivationSource {
	activateHighlight(id: string): boolean | void;
}

/**
 * Small reusable base class for sources that publish automatic RichText highlights.
 * Subclasses call `publish` whenever their active anchors change.
 */
export class RichTextHighlightSourceController implements RichTextHighlightSource {
	#activeIds: readonly string[] = [];
	#listeners = new Set<RichTextHighlightListener>();

	inspect(): RichTextHighlightSnapshot {
		return { activeIds: this.#activeIds };
	}

	subscribe(listener: RichTextHighlightListener): () => void {
		this.#listeners.add(listener);
		listener(this.inspect());
		return () => this.#listeners.delete(listener);
	}

	protected publish(activeIds: Iterable<string>): void {
		const next = [...new Set([...activeIds].filter(Boolean))];
		if (
			next.length === this.#activeIds.length &&
			next.every((id, index) => id === this.#activeIds[index])
		)
			return;
		this.#activeIds = Object.freeze(next);
		const snapshot = this.inspect();
		for (const listener of this.#listeners) listener(snapshot);
	}
}
