/** One history owner keeps frame, widget, and inline text changes coherent. */
export const TEXT_HISTORY_CONTEXT = Symbol('learning-studio-text-history');

export type TextHistoryController = {
	undo: () => void;
	redo: () => void;
	/** Separate formatting/paste from a preceding burst of typing. */
	breakGroup?: () => void;
};
