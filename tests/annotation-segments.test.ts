import assert from 'node:assert/strict';
import { test } from 'node:test';
import { segmentAnnotatedText } from '../src/lib/features/lesson-editor/components/widgets/annotation-segments';
import type { PassageAnnotation } from '../src/lib/features/lesson-editor/model/types';

test('preserves Persian text while splitting overlapping highlight and strong annotations', () => {
	const text = 'سلام دنیا';
	const annotations: PassageAnnotation[] = [
		{
			id: 'annotation.strong',
			start: 2,
			end: text.length,
			kind: 'strong'
		},
		{
			id: 'annotation.highlight',
			start: 0,
			end: 4,
			kind: 'highlight',
			tone: 'mint'
		}
	];

	const segments = segmentAnnotatedText(text, annotations);

	assert.deepEqual(
		segments.map(({ text: segmentText, strong, highlight }) => ({
			text: segmentText,
			strong,
			highlight
		})),
		[
			{ text: 'سل', strong: false, highlight: true },
			{ text: 'ام', strong: true, highlight: true },
			{ text: ' دنیا', strong: true, highlight: false }
		]
	);
	assert.equal(segments.map((segment) => segment.text).join(''), text);
	assert.equal(segments[1].annotationIds, 'annotation.highlight annotation.strong');
	assert.equal(segments[1].highlightTone, 'mint');
});

test('preserves Arabic letters and combining marks at annotation boundaries', () => {
	const text = 'مرحبًا بالعالم';
	const annotatedWord = 'بالعالم';
	const start = text.indexOf(annotatedWord);

	const segments = segmentAnnotatedText(text, [
		{
			id: 'annotation.arabic-word',
			start,
			end: text.length,
			kind: 'underline'
		}
	]);

	assert.equal(start > 0, true);
	assert.deepEqual(
		segments.map(({ text: segmentText, underline }) => ({ text: segmentText, underline })),
		[
			{ text: 'مرحبًا ', underline: false },
			{ text: annotatedWord, underline: true }
		]
	);
	assert.equal(segments.map((segment) => segment.text).join(''), text);
});

test('ignores invalid annotation ranges', () => {
	const text = 'plain text';
	const invalidAnnotations: PassageAnnotation[] = [
		{ id: 'negative', start: -1, end: 2, kind: 'strong' },
		{ id: 'empty', start: 2, end: 2, kind: 'highlight' },
		{ id: 'reversed', start: 6, end: 3, kind: 'underline' },
		{ id: 'past-end', start: 0, end: text.length + 1, kind: 'vocabulary' }
	];

	assert.deepEqual(segmentAnnotatedText(text, invalidAnnotations), [
		{
			start: 0,
			end: text.length,
			text,
			annotationIds: '',
			strong: false,
			emphasis: false,
			highlight: false,
			highlightTone: undefined,
			underline: false,
			vocabulary: false
		}
	]);
});

test('returns one unmarked segment for plain text and no segments for empty text', () => {
	assert.deepEqual(segmentAnnotatedText('No annotations', []), [
		{
			start: 0,
			end: 14,
			text: 'No annotations',
			annotationIds: '',
			strong: false,
			emphasis: false,
			highlight: false,
			highlightTone: undefined,
			underline: false,
			vocabulary: false
		}
	]);
	assert.deepEqual(segmentAnnotatedText('', []), []);
});
