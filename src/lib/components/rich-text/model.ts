import { Mark, Node, type JSONContent } from '@tiptap/core';

export type RichTextDocument = JSONContent;
export type RichTextBlockTag = 'p' | 'div';
export type RichTextFormat = 'strong' | 'emphasis' | 'underline' | 'highlight';

/** A context-free word cue that can be attached to matching rich-text words. */
export type RichTextAutomaticHighlightCue = Readonly<{ id: string; text: string }>;

/** A portable inline run used to create a RichText document without offsets. */
export type RichTextRun = Readonly<{
	text: string;
	formats?: readonly RichTextFormat[];
	/** Stable semantic IDs that an automatic highlight source may activate. */
	automaticHighlightIds?: readonly string[];
}>;

const RichTextDoc = Node.create({ name: 'doc', topNode: true, content: 'block+' });
const RichTextText = Node.create({ name: 'text', group: 'inline' });
const RichTextHardBreak = Node.create({
	name: 'hardBreak',
	inline: true,
	group: 'inline',
	selectable: false,
	parseHTML: () => [{ tag: 'br' }],
	renderHTML: () => ['br'],
	renderText: () => '\n'
});

const RichTextParagraph = Node.create({
	name: 'paragraph',
	group: 'block',
	content: 'inline*',
	marks: '_',
	parseHTML: () => [{ tag: 'p' }, { tag: 'div[data-rich-text-paragraph]' }],
	renderHTML: () => ['p', { 'data-rich-text-paragraph': '' }, 0]
});

const Strong = Mark.create({
	name: 'strong',
	parseHTML: () => [{ tag: 'strong' }, { tag: 'b' }],
	renderHTML: () => ['strong', 0]
});
const Emphasis = Mark.create({
	name: 'emphasis',
	parseHTML: () => [{ tag: 'em' }, { tag: 'i' }],
	renderHTML: () => ['em', 0]
});
const Underline = Mark.create({
	name: 'underline',
	parseHTML: () => [{ tag: 'u' }],
	renderHTML: () => ['u', 0]
});
const Highlight = Mark.create({
	name: 'highlight',
	parseHTML: () => [{ tag: 'mark[data-rich-text-highlight]' }],
	renderHTML: () => ['mark', { 'data-rich-text-highlight': '' }, 0]
});

/**
 * Persistent semantic anchors. The live visual treatment is added with a
 * ProseMirror decoration, so media state never mutates the document itself.
 */
const AutomaticHighlight = Mark.create({
	name: 'automaticHighlight',
	excludes: '',
	inclusive: false,
	addAttributes: () => ({ id: { default: null } }),
	parseHTML: () => [
		{
			tag: '[data-rich-text-automatic-highlight]',
			getAttrs: (element) => ({ id: element.getAttribute('data-rich-text-automatic-highlight') })
		}
	],
	renderHTML: ({ mark }) => [
		'span',
		{ 'data-rich-text-automatic-highlight': String(mark.attrs.id ?? '') },
		0
	]
});

export const richTextExtensions = [
	RichTextDoc,
	RichTextParagraph,
	RichTextText,
	RichTextHardBreak,
	Strong,
	Emphasis,
	Underline,
	Highlight,
	AutomaticHighlight
];

export function emptyRichTextDocument(): RichTextDocument {
	return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * Creates a document from semantic runs. Newlines become hard breaks and do
 * not need to be represented as implementation-specific document positions.
 */
export function createRichTextDocument(runs: readonly RichTextRun[]): RichTextDocument {
	const content: JSONContent[] = [];
	for (const run of runs) {
		const marks = [
			...(run.formats ?? []).map((type) => ({ type })),
			...(run.automaticHighlightIds ?? [])
				.filter(Boolean)
				.map((id) => ({ type: 'automaticHighlight', attrs: { id } }))
		];
		for (const [index, piece] of run.text.split('\n').entries()) {
			if (index) content.push({ type: 'hardBreak', ...(marks.length ? { marks } : {}) });
			if (piece) content.push({ type: 'text', text: piece, ...(marks.length ? { marks } : {}) });
		}
	}
	return {
		type: 'doc',
		content: [{ type: 'paragraph', ...(content.length ? { content } : {}) }]
	};
}

/**
 * Anchors matching rich-text words to semantic cue IDs without storing any
 * media-specific offsets in the document. Existing automatic anchors are
 * replaced so an author can safely regenerate them after editing the text.
 */
export function anchorRichTextDocument(
	document: RichTextDocument,
	cues: readonly RichTextAutomaticHighlightCue[]
): RichTextDocument {
	// RichText documents can arrive through Svelte state proxies. They are JSON by
	// contract, so a JSON clone keeps this model framework-agnostic and proxy-safe.
	const copy = JSON.parse(JSON.stringify(document)) as RichTextDocument;
	const textNodes: JSONContent[] = [];
	collectTextNodes(copy, textNodes);
	const cueWords = cues
		.map((cue) => ({ ...cue, normalized: normalizeWord(cue.text) }))
		.filter((cue) => cue.id && cue.normalized);
	const anchors = new Map<JSONContent, Array<{ start: number; end: number; id: string }>>();
	let cueIndex = 0;

	for (const node of textNodes) {
		const text = node.text ?? '';
		for (const word of textWords(text)) {
			const normalized = normalizeWord(word.text);
			if (!normalized) continue;
			const match = cueWords.findIndex(
				(cue, index) => index >= cueIndex && index < cueIndex + 48 && cue.normalized === normalized
			);
			if (match < 0) continue;
			cueIndex = match + 1;
			const ranges = anchors.get(node) ?? [];
			ranges.push({ start: word.start, end: word.end, id: cueWords[match].id });
			anchors.set(node, ranges);
		}
	}

	return transformAutomaticAnchors(copy, anchors);
}

/**
 * Indexes semantic cue IDs by normalized plain-text offset. Building the index
 * once lets playback change words without walking a large document on every
 * media time update.
 */
export function richTextAutomaticHighlightOffsets(
	document: RichTextDocument
): ReadonlyMap<string, number> {
	const pieces: string[] = [];
	const rawOffsets = new Map<string, number>();
	let rawOffset = 0;

	const append = (text: string) => {
		pieces.push(text);
		rawOffset += text.length;
	};
	const visit = (node: JSONContent) => {
		if (node.type === 'text') {
			for (const mark of node.marks ?? []) {
				if (mark.type !== 'automaticHighlight') continue;
				const id = String(mark.attrs?.id ?? '');
				if (id && !rawOffsets.has(id)) rawOffsets.set(id, rawOffset);
			}
			append(node.text ?? '');
			return;
		}
		if (node.type === 'hardBreak') {
			append('\n');
			return;
		}
		for (const child of node.content ?? []) visit(child);
		if (node.type === 'paragraph') append('\n');
	};

	visit(document);
	const normalizedOffsets = normalizedTextOffsets(pieces.join(''), [...rawOffsets.values()]);
	return new Map(
		[...rawOffsets].map(([id, offset]) => [id, normalizedOffsets.get(offset) ?? offset] as const)
	);
}

/** Finds the normalized plain-text offset of the first active semantic cue. */
export function richTextAutomaticHighlightOffset(
	document: RichTextDocument,
	activeIds: readonly string[]
): number | null {
	const offsets = richTextAutomaticHighlightOffsets(document);
	for (const id of activeIds) {
		const offset = offsets.get(id);
		if (offset !== undefined) return offset;
	}
	return null;
}

function normalizedTextOffsets(text: string, rawOffsets: readonly number[]): Map<number, number> {
	const targets = [...new Set(rawOffsets)]
		.filter((offset) => Number.isInteger(offset) && offset >= 0 && offset <= text.length)
		.sort((left, right) => left - right);
	const result = new Map<number, number>();
	if (!targets.length) return result;

	if (typeof Intl.Segmenter !== 'function') {
		for (const offset of targets) {
			result.set(offset, normalizePlainText(text.slice(0, offset)).length);
		}
		return result;
	}

	const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	let targetIndex = 0;
	let normalizedOffset = 0;
	for (const { segment, index } of segmenter.segment(text)) {
		const segmentEnd = index + segment.length;
		while (targetIndex < targets.length && targets[targetIndex] < segmentEnd) {
			const target = targets[targetIndex];
			result.set(
				target,
				normalizedOffset + normalizePlainText(segment.slice(0, Math.max(0, target - index))).length
			);
			targetIndex += 1;
		}
		normalizedOffset += normalizePlainText(segment).length;
	}
	while (targetIndex < targets.length) {
		result.set(targets[targetIndex], normalizedOffset);
		targetIndex += 1;
	}
	return result;
}

function normalizePlainText(text: string): string {
	return text.normalize('NFC').replace(/\r\n?/gu, '\n');
}

function collectTextNodes(node: JSONContent, target: JSONContent[]): void {
	if (node.type === 'text' && node.text) target.push(node);
	for (const child of node.content ?? []) collectTextNodes(child, target);
}

function transformAutomaticAnchors(
	node: JSONContent,
	anchors: ReadonlyMap<JSONContent, readonly { start: number; end: number; id: string }[]>
): JSONContent {
	if (node.type === 'text' && node.text) {
		const ranges = anchors.get(node) ?? [];
		const baseMarks = (node.marks ?? []).filter((mark) => mark.type !== 'automaticHighlight');
		if (!ranges.length)
			return { ...node, ...(baseMarks.length ? { marks: baseMarks } : { marks: [] }) };
		const pieces: JSONContent[] = [];
		let cursor = 0;
		for (const range of ranges) {
			if (range.start > cursor) {
				pieces.push(textPiece(node, node.text.slice(cursor, range.start), baseMarks));
			}
			pieces.push(
				textPiece(node, node.text.slice(range.start, range.end), [
					...baseMarks,
					{ type: 'automaticHighlight', attrs: { id: range.id } }
				])
			);
			cursor = range.end;
		}
		if (cursor < node.text.length) pieces.push(textPiece(node, node.text.slice(cursor), baseMarks));
		return { type: 'text', text: '', content: pieces };
	}
	return {
		...node,
		...(node.content
			? { content: node.content.flatMap((child) => expandTextNode(child, anchors)) }
			: {})
	};
}

function expandTextNode(
	node: JSONContent,
	anchors: ReadonlyMap<JSONContent, readonly { start: number; end: number; id: string }[]>
): JSONContent[] {
	if (node.type !== 'text' || !node.text) return [transformAutomaticAnchors(node, anchors)];
	const ranges = anchors.get(node) ?? [];
	const baseMarks = (node.marks ?? []).filter((mark) => mark.type !== 'automaticHighlight');
	if (!ranges.length) return [textPiece(node, node.text, baseMarks)];
	const pieces: JSONContent[] = [];
	let cursor = 0;
	for (const range of ranges) {
		if (range.start > cursor)
			pieces.push(textPiece(node, node.text.slice(cursor, range.start), baseMarks));
		pieces.push(
			textPiece(node, node.text.slice(range.start, range.end), [
				...baseMarks,
				{ type: 'automaticHighlight', attrs: { id: range.id } }
			])
		);
		cursor = range.end;
	}
	if (cursor < node.text.length) pieces.push(textPiece(node, node.text.slice(cursor), baseMarks));
	return pieces;
}

function textPiece(node: JSONContent, text: string, marks: JSONContent['marks']): JSONContent {
	return { ...node, text, ...(marks?.length ? { marks } : { marks: [] }) };
}

function textWords(text: string): Array<{ text: string; start: number; end: number }> {
	return [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’-]*/gu)].map((match) => ({
		text: match[0],
		start: match.index ?? 0,
		end: (match.index ?? 0) + match[0].length
	}));
}

function normalizeWord(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, '');
}
