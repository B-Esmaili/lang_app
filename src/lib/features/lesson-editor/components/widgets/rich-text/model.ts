import { Mark, Node, getSchema, type JSONContent } from '@tiptap/core';
import {
	type Mark as ProseMirrorMark,
	type Node as ProseMirrorNode,
	type Schema
} from '@tiptap/pm/model';
import { Plugin, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type {
	PassageAnnotation,
	PassageAnnotationKind,
	PassageAnnotationTone
} from '../../../model/types';

export type TextTag = 'div' | 'p' | 'h2' | 'h3' | 'span';
export type RichTextValue = { text: string; annotations: PassageAnnotation[] };
const kinds = new Set<PassageAnnotationKind>([
	'strong',
	'emphasis',
	'highlight',
	'underline',
	'vocabulary'
]);
const tones = new Set<PassageAnnotationTone>(['yellow', 'mint', 'lavender', 'blue']);

const TextDocument = Node.create({ name: 'doc', topNode: true, content: 'paragraph' });
const TextNode = Node.create({ name: 'text', group: 'inline' });
const HardBreak = Node.create({
	name: 'hardBreak',
	inline: true,
	group: 'inline',
	selectable: false,
	parseHTML: () => [{ tag: 'br' }],
	renderHTML: () => ['br'],
	renderText: () => '\n'
});

/** One non-exclusive mark retains overlapping annotations of the same or different kinds. */
const Annotation = Mark.create({
	name: 'annotation',
	excludes: '',
	inclusive: false,
	spanning: true,
	addAttributes: () => ({
		id: { default: null },
		kind: { default: 'highlight' },
		tone: { default: null }
	}),
	parseHTML: () => [
		{
			tag: '[data-passage-annotation]',
			getAttrs: (element) => {
				const kind = element.getAttribute('data-kind') as PassageAnnotationKind;
				const tone = element.getAttribute('data-tone') as PassageAnnotationTone;
				return {
					id: element.getAttribute('data-passage-annotation') || newAnnotationId(),
					kind: kinds.has(kind) ? kind : 'highlight',
					tone: tones.has(tone) ? tone : null
				};
			}
		}
	],
	renderHTML: ({ mark }) => {
		const kind = mark.attrs.kind as PassageAnnotationKind;
		const tag =
			kind === 'strong'
				? 'strong'
				: kind === 'emphasis'
					? 'em'
					: kind === 'highlight'
						? 'mark'
						: kind === 'underline'
							? 'u'
							: 'span';
		return [
			tag,
			{
				'data-passage-annotation': mark.attrs.id,
				'data-kind': kind,
				...(mark.attrs.tone ? { 'data-tone': mark.attrs.tone } : {}),
				class: `editable-mark-${kind}`
			},
			0
		];
	}
});

export function textExtensions(tag: TextTag = 'div') {
	return [
		TextDocument,
		Node.create({
			name: 'paragraph',
			group: 'block',
			content: 'inline*',
			marks: '_',
			parseHTML: () => [{ tag }],
			renderHTML: () => [tag, { 'data-text-block': '' }, 0]
		}),
		TextNode,
		HardBreak,
		Annotation
	];
}

export function createTextSchema(tag: TextTag = 'div'): Schema {
	return getSchema(textExtensions(tag));
}

export function richTextJSON(
	text: string,
	annotations: readonly PassageAnnotation[] = []
): JSONContent {
	const valid = annotations.filter(
		(annotation) =>
			annotation.id &&
			kinds.has(annotation.kind) &&
			Number.isInteger(annotation.start) &&
			Number.isInteger(annotation.end) &&
			annotation.start >= 0 &&
			annotation.end > annotation.start &&
			annotation.end <= text.length
	);
	const boundaries = [
		...new Set([0, text.length, ...valid.flatMap(({ start, end }) => [start, end])])
	].sort((a, b) => a - b);
	const content: JSONContent[] = [];
	for (let index = 0; index < boundaries.length - 1; index++) {
		const start = boundaries[index];
		const end = boundaries[index + 1];
		const marks = valid
			.filter((annotation) => annotation.start <= start && annotation.end >= end)
			.map((annotation) => ({ type: 'annotation', attrs: annotationAttributes(annotation) }));
		const pieces = text.slice(start, end).split('\n');
		for (const [at, piece] of pieces.entries()) {
			if (at) content.push({ type: 'hardBreak', ...(marks.length ? { marks } : {}) });
			if (piece) content.push({ type: 'text', text: piece, ...(marks.length ? { marks } : {}) });
		}
	}
	return { type: 'doc', content: [{ type: 'paragraph', content }] };
}

function annotationAttributes(annotation: PassageAnnotation) {
	return {
		id: annotation.id,
		kind: annotation.kind,
		tone: annotation.tone ?? null
	};
}

type MarkRange = { start: number; end: number; mark: ProseMirrorMark };

/** Offsets use UTF-16, matching the saved document and ProseMirror text positions. */
function annotationRanges(doc: ProseMirrorNode): { text: string; ranges: MarkRange[] } {
	let text = '';
	const ranges: MarkRange[] = [];
	const lastById = new Map<string, MarkRange>();
	doc.firstChild?.forEach((node) => {
		const value = node.isText ? node.text! : node.type.name === 'hardBreak' ? '\n' : '';
		const start = text.length;
		text += value;
		for (const mark of node.marks) {
			if (mark.type.name !== 'annotation' || !mark.attrs.id || !value) continue;
			const id = String(mark.attrs.id);
			const previous = lastById.get(id);
			if (previous && previous.end === start && previous.mark.eq(mark)) previous.end = text.length;
			else {
				const range = { start, end: text.length, mark };
				ranges.push(range);
				lastById.set(id, range);
			}
		}
	});
	return { text, ranges };
}

export function readRichText(doc: ProseMirrorNode): RichTextValue {
	const { text, ranges } = annotationRanges(doc);
	return {
		text,
		annotations: ranges.map(({ start, end, mark }) => ({
			id: String(mark.attrs.id),
			start,
			end,
			kind: mark.attrs.kind as PassageAnnotationKind,
			...(mark.attrs.tone !== null ? { tone: mark.attrs.tone as PassageAnnotationTone } : {})
		}))
	};
}

export function sameRichText(left: RichTextValue, right: RichTextValue): boolean {
	if (left.text !== right.text || left.annotations.length !== right.annotations.length)
		return false;
	const ordered = (annotations: PassageAnnotation[]) =>
		annotations
			.map((annotation) => [
				annotation.id,
				annotation.start,
				annotation.end,
				annotation.kind,
				annotation.tone ?? null
			])
			.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
	return JSON.stringify(ordered(left.annotations)) === JSON.stringify(ordered(right.annotations));
}

/** Clearing the middle of a mark creates independently addressable saved ranges. */
export function normalizeAnnotationIds(state: EditorState): Transaction | null {
	const { ranges } = annotationRanges(state.doc);
	const seen = new Set<string>();
	let transaction: Transaction | null = null;
	for (const range of ranges) {
		const id = String(range.mark.attrs.id);
		if (seen.has(id)) {
			transaction ??= state.tr;
			transaction.removeMark(range.start + 1, range.end + 1, range.mark);
			transaction.addMark(
				range.start + 1,
				range.end + 1,
				range.mark.type.create({
					...range.mark.attrs,
					id: newAnnotationId()
				})
			);
		} else seen.add(id);
	}
	return transaction;
}

export function annotationIntegrityPlugin(): Plugin {
	return new Plugin({
		appendTransaction: (transactions, _old, state) =>
			transactions.some((transaction) => transaction.docChanged)
				? normalizeAnnotationIds(state)
				: null
	});
}

export function selectionHasAnnotation(
	state: EditorState,
	kind: PassageAnnotationKind,
	tone?: PassageAnnotationTone
): boolean {
	const { from, to, empty } = state.selection;
	if (empty) return false;
	let covered = 0;
	state.doc.nodesBetween(from, to, (node, position) => {
		if (!node.isInline) return;
		if (
			node.marks.some(
				(mark) =>
					mark.type.name === 'annotation' &&
					mark.attrs.kind === kind &&
					(tone === undefined ||
						mark.attrs.tone === tone ||
						(tone === 'yellow' && mark.attrs.tone === null))
			)
		) {
			covered += Math.max(0, Math.min(to, position + node.nodeSize) - Math.max(from, position));
		}
	});
	return covered >= to - from;
}

export function annotationTransaction(
	state: EditorState,
	kind: PassageAnnotationKind | 'clear',
	tone: PassageAnnotationTone = 'yellow'
): Transaction | null {
	const { from, to, empty } = state.selection;
	if (empty) return null;
	const transaction = state.tr;
	const remove =
		kind === 'clear' ||
		selectionHasAnnotation(state, kind, kind === 'highlight' ? tone : undefined);
	state.doc.nodesBetween(from, to, (node) => {
		for (const mark of node.marks) {
			if (mark.type.name === 'annotation' && (kind === 'clear' || mark.attrs.kind === kind))
				transaction.removeMark(from, to, mark);
		}
	});
	if (!remove)
		transaction.addMark(
			from,
			to,
			state.schema.marks.annotation.create({
				id: newAnnotationId(),
				kind,
				tone: kind === 'highlight' ? tone : null
			})
		);
	return transaction;
}

/** Replace an external snapshot through ProseMirror while preserving a sensible caret. */
export function reconcileRichText(state: EditorState, next: RichTextValue): Transaction | null {
	const previous = readRichText(state.doc);
	if (sameRichText(previous, next)) return null;
	const document = state.schema.nodeFromJSON(richTextJSON(next.text, next.annotations));
	const transaction = state.tr.replaceWith(0, state.doc.content.size, document.content);
	const anchor = mapTextOffset(previous.text, next.text, Math.max(0, state.selection.anchor - 1));
	const head = mapTextOffset(previous.text, next.text, Math.max(0, state.selection.head - 1));
	transaction.setSelection(TextSelection.create(transaction.doc, anchor + 1, head + 1));
	return transaction.setMeta('preventUpdate', true).setMeta('addToHistory', false);
}

export function mapTextOffset(previous: string, next: string, offset: number): number {
	let prefix = 0;
	while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix])
		prefix++;
	let suffix = 0;
	while (
		suffix < previous.length - prefix &&
		suffix < next.length - prefix &&
		previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
	)
		suffix++;
	const oldEnd = previous.length - suffix;
	const newEnd = next.length - suffix;
	if (offset <= prefix) return Math.min(offset, next.length);
	if (offset >= oldEnd)
		return Math.max(0, Math.min(next.length, offset + next.length - previous.length));
	return newEnd;
}

export function normalizePastedText(text: string, multiline: boolean): string {
	return multiline
		? text.replace(/\r\n?/g, '\n')
		: text.replace(/(?:\r\n?|\n|\u2028|\u2029)+/g, ' ');
}

export function newAnnotationId(): string {
	const id =
		globalThis.crypto?.randomUUID?.() ??
		`${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
	return `annotation.${id}`;
}
