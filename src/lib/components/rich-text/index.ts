export { default as RichText } from './RichText.svelte';
export {
	RichTextHighlightSourceController,
	type RichTextHighlightListener,
	type RichTextHighlightSnapshot,
	type RichTextHighlightSource
} from './highlight-source';
export {
	createRichTextDocument,
	anchorRichTextDocument,
	emptyRichTextDocument,
	richTextAutomaticHighlightOffset,
	richTextAutomaticHighlightOffsets,
	richTextExtensions,
	type RichTextBlockTag,
	type RichTextAutomaticHighlightCue,
	type RichTextDocument,
	type RichTextFormat,
	type RichTextRun
} from './model';
