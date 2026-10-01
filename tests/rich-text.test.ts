import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createTextSchema,
	mapTextOffset,
	normalizePastedText,
	readRichText,
	richTextJSON,
	sameRichText
} from '../src/lib/features/lesson-editor/components/widgets/rich-text/model';
import type { PassageAnnotation } from '../src/lib/features/lesson-editor/model/types';

test('Persian, Arabic, line breaks, and overlapping annotations round-trip without loss', () => {
	const text = 'می‌خواهم زبان بیاموزم\nمرحباً بالعالم';
	const annotations: PassageAnnotation[] = [
		{ id: 'strong.fa', start: 0, end: 9, kind: 'strong' },
		{ id: 'highlight.overlap', start: 3, end: 17, kind: 'highlight', tone: 'mint' },
		{ id: 'vocabulary.ar', start: text.indexOf('مرحباً'), end: text.length, kind: 'vocabulary' }
	];
	const schema = createTextSchema('p');
	const result = readRichText(schema.nodeFromJSON(richTextJSON(text, annotations)));
	assert.equal(result.text, text);
	assert.equal(sameRichText(result, { text, annotations }), true);
});

test('invalid annotation ranges do not corrupt the editable document', () => {
	const schema = createTextSchema();
	const result = readRichText(
		schema.nodeFromJSON(
			richTextJSON('سلام', [
				{ id: 'bad', start: -1, end: 100, kind: 'highlight' },
				{ id: 'valid', start: 0, end: 4, kind: 'underline' }
			])
		)
	);
	assert.deepEqual(result, {
		text: 'سلام',
		annotations: [{ id: 'valid', start: 0, end: 4, kind: 'underline' }]
	});
});

test('plain-text paste normalizes newlines according to the widget shape', () => {
	assert.equal(normalizePastedText('one\r\nدو\rthree', true), 'one\nدو\nthree');
	assert.equal(normalizePastedText('one\r\nدو\u2028three', false), 'one دو three');
});

test('external history snapshots map a caret across inserted and removed text', () => {
	assert.equal(mapTextOffset('hello world', 'hello kind world', 11), 16);
	assert.equal(mapTextOffset('hello kind world', 'hello world', 16), 11);
	assert.equal(mapTextOffset('سلام دنیا', 'درود دنیا', 8), 8);
});
