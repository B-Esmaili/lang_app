import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	courseMediaResourceCues,
	normalizeCourseMediaResourceName
} from '../src/lib/domain/course-media-resource';
import { anchorRichTextDocument } from '../src/lib/components/rich-text/model';

test('normalizes course media aliases and scopes their timing cue IDs', () => {
	assert.equal(normalizeCourseMediaResourceName(' Lesson Narration 01 '), 'lesson-narration-01');
	assert.equal(normalizeCourseMediaResourceName('Lesson & Intro'), 'lesson-intro');
	assert.deepEqual(
		courseMediaResourceCues({
			id: 'course-media-resource.1',
			transcribedText: {
				schemaVersion: 1,
				id: 'transcript.1',
				revision: 1,
				text: 'Hello',
				language: 'en',
				normalization: 'NFC',
				alignment: 'synced',
				durationMs: 600,
				tokens: [{ id: 'token.1', text: 'Hello', startMs: 0, endMs: 500, confidence: 0.9 }]
			}
		}),
		[
			{
				id: 'course-media-resource.1:token.1',
				text: 'Hello',
				startMs: 0,
				endMs: 500
			}
		]
	);
});

test('anchors matching rich-text words using cue IDs rather than text positions', () => {
	const document = anchorRichTextDocument(
		{
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello, world!' }] }]
		},
		[
			{ id: 'resource.1:token.1', text: 'Hello' },
			{ id: 'resource.1:token.2', text: 'world.' }
		]
	);
	assert.deepEqual(document, {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [
					{
						type: 'text',
						text: 'Hello',
						marks: [{ type: 'automaticHighlight', attrs: { id: 'resource.1:token.1' } }]
					},
					{ type: 'text', text: ', ', marks: [] },
					{
						type: 'text',
						text: 'world',
						marks: [{ type: 'automaticHighlight', attrs: { id: 'resource.1:token.2' } }]
					},
					{ type: 'text', text: '!', marks: [] }
				]
			}
		]
	});
});
