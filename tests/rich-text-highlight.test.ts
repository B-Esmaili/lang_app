import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RichTextHighlightSourceController } from '../src/lib/components/rich-text/highlight-source';
import {
	createRichTextDocument,
	richTextAutomaticHighlightOffset,
	richTextAutomaticHighlightOffsets
} from '../src/lib/components/rich-text/model';
import { MediaElementHighlightSource } from '../src/lib/components/media-element/media-highlight-source';

class TestHighlightSource extends RichTextHighlightSourceController {
	activate(ids: readonly string[]) {
		this.publish(ids);
	}
}

test('a generic RichText source publishes semantic anchor IDs and supports inspection', () => {
	const source = new TestHighlightSource();
	const observed: string[][] = [];
	const unsubscribe = source.subscribe(({ activeIds }) => observed.push([...activeIds]));

	source.activate(['word.1', 'word.1', 'word.2']);
	unsubscribe();
	source.activate(['word.3']);

	assert.deepEqual(observed, [[], ['word.1', 'word.2']]);
	assert.deepEqual(source.inspect(), { activeIds: ['word.3'] });
});

test('a media source implements the RichText source contract using half-open time cues', () => {
	const source = new MediaElementHighlightSource([
		{ id: 'word.2', startMs: 400, endMs: 800 },
		{ id: 'word.1', startMs: 0, endMs: 400 },
		{ id: '', startMs: 0, endMs: 20 }
	]);
	const observed: string[][] = [];
	source.subscribe(({ activeIds }) => observed.push([...activeIds]));

	source.setCurrentTime(0.2);
	assert.deepEqual(source.inspect().activeIds, ['word.1']);
	source.setCurrentTime(0.4);
	assert.deepEqual(source.inspect().activeIds, ['word.2']);
	source.setCurrentTime(0.8);
	assert.deepEqual(source.inspect().activeIds, []);
	assert.deepEqual(observed, [['word.1'], ['word.2'], []]);
	assert.equal(source.inspectMedia().cueCount, 2);
});

test('RichText documents carry automatic highlights as stable mark IDs, not offsets', () => {
	assert.deepEqual(
		createRichTextDocument([
			{ text: 'Hello ', formats: ['strong'] },
			{ text: 'world', automaticHighlightIds: ['word.2'] }
		]),
		{
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						{ type: 'text', text: 'Hello ', marks: [{ type: 'strong' }] },
						{
							type: 'text',
							text: 'world',
							marks: [{ type: 'automaticHighlight', attrs: { id: 'word.2' } }]
						}
					]
				}
			]
		}
	);
});

test('resolves active cue offsets across formatting and paragraph boundaries', () => {
	const document = {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'First. Repeat. ' },
					{
						type: 'text',
						text: 'Repeat',
						marks: [
							{ type: 'strong' },
							{ type: 'automaticHighlight', attrs: { id: 'word.repeat.2' } }
						]
					},
					{ type: 'text', text: '.' }
				]
			},
			{
				type: 'paragraph',
				content: [
					{
						type: 'text',
						text: 'بعدی؟',
						marks: [{ type: 'automaticHighlight', attrs: { id: 'word.rtl' } }]
					}
				]
			}
		]
	};

	assert.equal(richTextAutomaticHighlightOffset(document, ['word.repeat.2']), 15);
	assert.equal(richTextAutomaticHighlightOffset(document, ['word.rtl']), 23);
	assert.equal(richTextAutomaticHighlightOffset(document, ['missing']), null);
});

test('cue offsets use the same NFC and line-ending normalization as course sentences', () => {
	const document = createRichTextDocument([
		{ text: 'Cafe\u0301.\r\n' },
		{ text: 'Next.', automaticHighlightIds: ['word.next'] }
	]);
	const offsets = richTextAutomaticHighlightOffsets(document);

	assert.equal(offsets.get('word.next'), 6);
	assert.equal(richTextAutomaticHighlightOffset(document, ['word.next']), 6);
});

test('media playback snapshots retain cue identity while exposing play and pause state', () => {
	const source = new MediaElementHighlightSource([{ id: 'word.1', startMs: 0, endMs: 500 }]);
	const observed: Array<{ isPlaying: boolean; activeCueIds: readonly string[] }> = [];
	const unsubscribe = source.subscribeMedia(({ isPlaying, activeCueIds }) =>
		observed.push({ isPlaying, activeCueIds })
	);

	source.setCurrentTime(0.2);
	source.setPlaying(true);
	source.setPlaying(false);
	unsubscribe();

	assert.deepEqual(observed.at(-2), { isPlaying: true, activeCueIds: ['word.1'] });
	assert.deepEqual(observed.at(-1), { isPlaying: false, activeCueIds: ['word.1'] });
});
