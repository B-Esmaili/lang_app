import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	chunkCourseSentences,
	courseSentenceAtTextOffset,
	lessonCourseSentences,
	noteAnchorKey,
	normalizeNoteAnchor,
	resolveCourseNoteVisibility,
	segmentCourseSentences,
	withoutLegacyAnnotationNotes
} from '../src/lib/features/course-builder/course-notes';
import {
	anchorRichTextDocument,
	createRichTextDocument,
	richTextAutomaticHighlightOffset
} from '../src/lib/components/rich-text/model';
import type { LessonDocument } from '../src/lib/features/lesson-editor/model';
import { transcriptTextSources } from '../src/lib/domain/transcribed-text';

test('segments course text into sentence-sized note anchors', () => {
	assert.deepEqual(segmentCourseSentences(' Hello world.  How are you? Fine! ', 'en'), [
		'Hello world.',
		'How are you?',
		'Fine!'
	]);
	assert.equal(normalizeNoteAnchor('  Hello\n\tworld. '), 'Hello world.');
	assert.equal(noteAnchorKey(['Hello world.']), noteAnchorKey([' Hello  world. ']));
});

test('keeps ordinary notes private while allowing authored course translations', () => {
	assert.equal(resolveCourseNoteVisibility('note', 'private'), 'private');
	assert.equal(resolveCourseNoteVisibility('note', 'shared'), 'private');
	assert.equal(resolveCourseNoteVisibility('note', 'course'), 'private');
	assert.equal(resolveCourseNoteVisibility('translation', 'shared'), 'private');
	assert.equal(resolveCourseNoteVisibility('translation', 'course'), 'course');
});

test('removes embedded legacy note text without mutating the saved lesson object', () => {
	const document = {
		schemaVersion: 1,
		id: 'lesson.legacy-note',
		title: 'Legacy note',
		language: 'en',
		direction: 'ltr',
		frames: [
			{
				id: 'frame.legacy-note',
				templateId: 'template.1',
				appearance: {
					border: 'none',
					surface: 'plain',
					shadow: 'none',
					radius: 'none',
					padding: 'md'
				},
				slots: {
					reading: [
						{
							id: 'passage.legacy-note',
							type: 'language.passage',
							content: {
								type: 'language.passage',
								language: 'en',
								direction: 'ltr',
								text: 'Private definition.',
								annotations: [
									{
										id: 'annotation.legacy-note',
										start: 0,
										end: 7,
										kind: 'highlight',
										note: 'Only the author should see this.'
									},
									null,
									'preserve malformed legacy data'
								]
							}
						}
					]
				}
			}
		]
	} as unknown as LessonDocument;

	const sanitized = withoutLegacyAnnotationNotes(document);
	const original = document.frames[0].slots.reading[0];
	const cleaned = sanitized.frames[0].slots.reading[0];
	assert.equal(original.type, 'language.passage');
	assert.equal(cleaned.type, 'language.passage');
	if (original.type !== 'language.passage' || cleaned.type !== 'language.passage') return;
	const originalAnnotations = (original.content as unknown as { annotations: unknown[] })
		.annotations;
	const cleanedAnnotations = (cleaned.content as unknown as { annotations: unknown[] }).annotations;
	assert.notEqual(sanitized, document);
	assert.equal('note' in (originalAnnotations[0] as object), true);
	assert.equal('note' in (cleanedAnnotations[0] as object), false);
	assert.deepEqual(cleanedAnnotations.slice(1), [null, 'preserve malformed legacy data']);

	const malformedContainer = structuredClone(document);
	const malformedWidget = malformedContainer.frames[0].slots.reading[0];
	if (malformedWidget.type !== 'language.passage') return;
	(malformedWidget.content as unknown as { annotations: unknown }).annotations = null;
	assert.equal(withoutLegacyAnnotationNotes(malformedContainer), malformedContainer);

	(malformedWidget.content as unknown as { annotations: unknown }).annotations = {
		note: 'Private object-shaped legacy note',
		keep: true
	};
	const cleanedObjectContainer = withoutLegacyAnnotationNotes(malformedContainer);
	const cleanedObjectWidget = cleanedObjectContainer.frames[0].slots.reading[0];
	if (cleanedObjectWidget.type !== 'language.passage') return;
	assert.deepEqual(
		(cleanedObjectWidget.content as unknown as { annotations: unknown }).annotations,
		{ keep: true }
	);
});

test('extracts sentence units from lesson widgets in reading order', () => {
	const sentences = lessonCourseSentences({
		schemaVersion: 1,
		id: 'lesson.document',
		title: 'Lesson',
		language: 'en',
		direction: 'ltr',
		frames: [
			{
				id: 'frame.1',
				templateId: 'template.1',
				appearance: {
					border: 'none',
					surface: 'plain',
					shadow: 'none',
					radius: 'none',
					padding: 'md'
				},
				slots: {
					reading: [
						{
							id: 'passage.1',
							type: 'language.passage',
							content: {
								type: 'language.passage',
								language: 'en',
								direction: 'ltr',
								text: 'First sentence. Second sentence?',
								annotations: []
							}
						}
					]
				}
			}
		]
	});

	assert.deepEqual(
		sentences.map(({ text, position }) => ({ text, position })),
		[
			{ text: 'First sentence.', position: 0 },
			{ text: 'Second sentence?', position: 1 }
		]
	);
	assert.deepEqual(
		chunkCourseSentences(sentences, 1).map((chunk) => chunk.length),
		[1, 1]
	);
});

test('keeps sentence identities stable when unrelated content is inserted before a widget', () => {
	const passage = {
		id: 'passage.stable',
		type: 'language.passage' as const,
		content: {
			type: 'language.passage' as const,
			language: 'en',
			direction: 'ltr' as const,
			text: 'Repeated. Repeated.',
			annotations: []
		}
	};
	const document = {
		schemaVersion: 1 as const,
		id: 'lesson.stability',
		title: 'Stable anchors',
		language: 'en',
		direction: 'ltr' as const,
		frames: [
			{
				id: 'frame.stable',
				templateId: 'template.1',
				appearance: {
					border: 'none' as const,
					surface: 'plain' as const,
					shadow: 'none' as const,
					radius: 'none' as const,
					padding: 'md' as const
				},
				slots: { reading: [passage] }
			}
		]
	};
	const before = lessonCourseSentences(document);
	const withEarlierWidget = structuredClone(document);
	withEarlierWidget.frames[0].slots.reading.unshift({
		...passage,
		id: 'passage.earlier',
		content: { ...passage.content, text: 'An earlier sentence.' }
	});
	const after = lessonCourseSentences(withEarlierWidget).filter(
		(sentence) => sentence.widgetId === passage.id
	);

	assert.deepEqual(
		after.map(({ id }) => id),
		before.map(({ id }) => id)
	);
	assert.notEqual(before[0]?.id, before[1]?.id);
});

test('resolves repeated rich-text sentences by widget-local text offset', () => {
	const richTextDocument = anchorRichTextDocument(
		createRichTextDocument([{ text: 'Repeat. Repeat.' }]),
		[
			{ id: 'cue.repeat.1', text: 'Repeat' },
			{ id: 'cue.repeat.2', text: 'Repeat' }
		]
	);
	const sentences = lessonCourseSentences({
		schemaVersion: 1,
		id: 'lesson.playback-notes',
		title: 'Playback notes',
		language: 'en',
		direction: 'ltr',
		frames: [
			{
				id: 'frame.playback-notes',
				templateId: 'template.1',
				appearance: {
					border: 'none',
					surface: 'plain',
					shadow: 'none',
					radius: 'none',
					padding: 'md'
				},
				slots: {
					reading: [
						{
							id: 'rich-text.playback-notes',
							type: 'content.rich-text',
							content: {
								type: 'content.rich-text',
								language: 'en',
								direction: 'ltr',
								blockStyle: 'prose',
								document: richTextDocument
							}
						}
					]
				}
			}
		]
	});
	const firstOffset = richTextAutomaticHighlightOffset(richTextDocument, ['cue.repeat.1']);
	const secondOffset = richTextAutomaticHighlightOffset(richTextDocument, ['cue.repeat.2']);
	assert.equal(firstOffset, 0);
	assert.equal(secondOffset, 8);

	assert.equal(
		courseSentenceAtTextOffset(sentences, 'rich-text.playback-notes', 'document', firstOffset!)
			?.occurrence,
		0
	);
	assert.equal(
		courseSentenceAtTextOffset(sentences, 'rich-text.playback-notes', 'document', secondOffset!)
			?.occurrence,
		1
	);
	assert.equal(
		courseSentenceAtTextOffset(
			sentences,
			'rich-text.playback-notes',
			'document',
			sentences[0]!.end - 1
		)?.occurrence,
		0
	);
	assert.equal(
		courseSentenceAtTextOffset(
			sentences,
			'rich-text.playback-notes',
			'document',
			sentences[0]!.end
		),
		undefined
	);
	assert.equal(courseSentenceAtTextOffset(sentences, 'rich-text.other', 'document', 2), undefined);
	assert.equal(
		courseSentenceAtTextOffset(sentences, 'rich-text.playback-notes', 'document', 19),
		undefined
	);
});

test('resolves a rich-text playback cue after decomposed Unicode and CRLF text', () => {
	const richTextDocument = anchorRichTextDocument(
		createRichTextDocument([{ text: 'Cafe\u0301.\r\nNext.' }]),
		[{ id: 'cue.next', text: 'Next' }]
	);
	const lesson: LessonDocument = {
		schemaVersion: 1,
		id: 'lesson.normalized-playback-notes',
		title: 'Normalized playback notes',
		language: 'en',
		direction: 'ltr',
		frames: [
			{
				id: 'frame.normalized-playback-notes',
				templateId: 'template.1',
				appearance: {
					border: 'none',
					surface: 'plain',
					shadow: 'none',
					radius: 'none',
					padding: 'md'
				},
				slots: {
					reading: [
						{
							id: 'rich-text.normalized-playback-notes',
							type: 'content.rich-text',
							content: {
								type: 'content.rich-text',
								language: 'en',
								direction: 'ltr',
								blockStyle: 'prose',
								document: richTextDocument
							}
						}
					]
				}
			}
		]
	};
	const sentences = lessonCourseSentences(lesson);
	const offset = richTextAutomaticHighlightOffset(richTextDocument, ['cue.next']);

	assert.equal(offset, 6);
	assert.equal(
		courseSentenceAtTextOffset(
			sentences,
			'rich-text.normalized-playback-notes',
			'document',
			offset!
		)?.text,
		'Next.'
	);
});

test('segments passage text without stripping author content', () => {
	const sentences = lessonCourseSentences({
		schemaVersion: 1,
		id: 'lesson.dialogue',
		title: 'Dialogue',
		language: 'en',
		direction: 'ltr',
		frames: [
			{
				id: 'frame.dialogue',
				templateId: 'template.1',
				appearance: {
					border: 'none',
					surface: 'plain',
					shadow: 'none',
					radius: 'none',
					padding: 'md'
				},
				slots: {
					reading: [
						{
							id: 'passage.dialogue',
							type: 'language.passage',
							content: {
								type: 'language.passage',
								language: 'en',
								direction: 'ltr',
								text: 'Mina: Welcome. Please sit.\n\nOmid: Thank you.',
								annotations: []
							}
						}
					]
				}
			}
		]
	});

	assert.deepEqual(
		sentences.map(({ text }) => text),
		['Mina: Welcome.', 'Please sit.', 'Omid: Thank you.']
	);
});

test('maps audio timing offsets into transcript sentence anchors', () => {
	const sentences = lessonCourseSentences({
		schemaVersion: 1,
		id: 'lesson.audio-transcript',
		title: 'Audio transcript',
		language: 'en',
		direction: 'ltr',
		frames: [
			{
				id: 'frame.audio-transcript',
				templateId: 'template.1',
				appearance: {
					border: 'none',
					surface: 'plain',
					shadow: 'none',
					radius: 'none',
					padding: 'md'
				},
				slots: {
					listening: [
						{
							id: 'audio.transcript',
							type: 'language.audio',
							content: {
								type: 'language.audio',
								language: 'en',
								direction: 'ltr',
								title: 'A conversation',
								sourceUrl: null,
								transcript: 'Welcome. Please sit. Thank you.',
								durationSeconds: 4,
								waveform: [],
								transcribedText: {
									schemaVersion: 1,
									id: 'transcript.audio-transcript',
									revision: 1,
									text: 'Welcome. Please sit. Thank you.',
									language: 'en',
									normalization: 'NFC',
									alignment: 'synced',
									durationMs: 4_000,
									tokens: [
										{
											id: 'token.1',
											text: 'Welcome.',
											startMs: 0,
											endMs: 900,
											confidence: 0.99
										},
										{
											id: 'token.2',
											text: 'Please sit.',
											startMs: 1_000,
											endMs: 2_000,
											confidence: 0.98
										},
										{
											id: 'token.3',
											text: 'Thank you.',
											startMs: 2_100,
											endMs: 3_200,
											confidence: 0.99
										}
									]
								}
							}
						}
					]
				}
			}
		]
	});

	assert.deepEqual(
		sentences.map(({ text, sourceKey }) => ({ text, sourceKey })),
		[
			{ text: 'Welcome.', sourceKey: 'transcript' },
			{ text: 'Please sit.', sourceKey: 'transcript' },
			{ text: 'Thank you.', sourceKey: 'transcript' }
		]
	);
	const sources = transcriptTextSources([
		{
			id: 'token.1',
			text: 'Welcome.',
			startMs: 0,
			endMs: 900,
			confidence: 0.99
		},
		{
			id: 'token.2',
			text: 'Please sit.',
			startMs: 1_000,
			endMs: 2_000,
			confidence: 0.98
		},
		{
			id: 'token.3',
			text: 'Thank you.',
			startMs: 2_100,
			endMs: 3_200,
			confidence: 0.99
		}
	]);
	const locations = new Map<string, { sourceKey: string; textOffset: number }>();
	for (const source of sources) {
		for (const location of source.tokenLocations) {
			locations.set(location.tokenId, {
				sourceKey: source.key,
				textOffset: location.textOffset
			});
		}
	}
	const second = locations.get('token.2')!;
	const third = locations.get('token.3')!;
	assert.equal(
		courseSentenceAtTextOffset(sentences, 'audio.transcript', second.sourceKey, second.textOffset)
			?.text,
		'Please sit.'
	);
	assert.equal(
		courseSentenceAtTextOffset(sentences, 'audio.transcript', third.sourceKey, third.textOffset)
			?.text,
		'Thank you.'
	);
});
