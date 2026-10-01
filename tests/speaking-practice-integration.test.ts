import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	anchorRichTextDocument,
	createRichTextDocument
} from '../src/lib/components/rich-text/model';
import {
	courseMediaResourceCues,
	type CourseMediaResource
} from '../src/lib/domain/course-media-resource';
import { lessonCourseSentences } from '../src/lib/features/course-builder/course-notes';
import {
	applyEditorCommand,
	canPlaceWidget,
	createFrameFromTemplate,
	READ_AND_RESPOND_TEMPLATE,
	type LessonDocument,
	type WidgetInstance
} from '../src/lib/features/lesson-editor/model';
import {
	createWidgetContent,
	getWidgetDefinition
} from '../src/lib/features/lesson-editor/registry';
import { lessonSpeakingSentences } from '../src/lib/features/speaking-practice/lesson-sentences';
import { CourseContentError, parseLessonDocument } from '../src/lib/server/course-content';

function lesson(widgets: WidgetInstance[]): LessonDocument {
	const frame = createFrameFromTemplate('frame.lesson', READ_AND_RESPOND_TEMPLATE);
	frame.slots.lesson = widgets;
	return {
		schemaVersion: 1,
		id: 'lesson.speaking',
		title: 'Practice',
		language: 'en',
		direction: 'ltr',
		frames: [frame]
	};
}

function passage(id: string, text: string, language = 'en'): WidgetInstance<'language.passage'> {
	return {
		id,
		type: 'language.passage',
		content: { ...createWidgetContent('language.passage'), text, language }
	};
}

function audio(): WidgetInstance<'language.audio'> {
	return {
		id: 'audio',
		type: 'language.audio',
		content: {
			...createWidgetContent('language.audio'),
			sourceUrl: '/media/reference.mp3',
			transcript: 'Hello there. Welcome back.',
			transcribedText: {
				schemaVersion: 1,
				id: 'transcript',
				revision: 1,
				text: 'Hello there. Welcome back.',
				language: 'en',
				normalization: 'NFC',
				alignment: 'synced',
				durationMs: 4000,
				tokens: [
					{ id: 't1', text: 'Hello', startMs: 0, endMs: 500, confidence: null },
					{ id: 't2', text: 'there.', startMs: 600, endMs: 1200, confidence: null },
					{ id: 't3', text: 'Welcome', startMs: 2000, endMs: 2700, confidence: null },
					{ id: 't4', text: 'back.', startMs: 2800, endMs: 3500, confidence: null }
				]
			}
		}
	};
}

test('authors can add Speaking Practice to a practice slot and save sentence choices without learner data', () => {
	const source = lesson([passage('reading', 'Hello there. Welcome back.')]);
	const sentenceIds = lessonSpeakingSentences(source).map((sentence) => sentence.id);
	const widget: WidgetInstance<'language.speaking-practice'> = {
		id: 'speaking',
		type: 'language.speaking-practice',
		content: {
			...createWidgetContent('language.speaking-practice'),
			sentenceMode: 'selected',
			sentenceIds
		}
	};
	assert.equal(getWidgetDefinition(widget.type).label, 'Speaking Practice');
	assert.equal(
		canPlaceWidget(
			source,
			[READ_AND_RESPOND_TEMPLATE],
			widget.type,
			source.frames[0].id,
			'practice'
		),
		true
	);
	const inserted = applyEditorCommand(source, {
		type: 'insert-widget',
		frameId: source.frames[0].id,
		slotId: 'practice',
		widget
	});
	const saved = parseLessonDocument(JSON.parse(JSON.stringify(inserted)));
	assert.deepEqual(saved.frames[0].slots.practice[0], widget);
	assert.deepEqual(
		lessonSpeakingSentences(saved).map((sentence) => sentence.id),
		sentenceIds
	);
	assert.equal(JSON.stringify(saved).includes('recording'), false);
});

test('sentence inventory includes English lesson content and excludes assessment instructions', () => {
	const source = lesson([
		passage('en', 'Hello there. Welcome back.', 'en-GB'),
		passage('fr', 'Bonjour.', 'fr'),
		{
			id: 'response',
			type: 'language.response',
			content: { ...createWidgetContent('language.response'), prompt: 'Write your answer.' }
		},
		{
			id: 'old-speaking',
			type: 'language.pronunciation',
			content: {
				...createWidgetContent('language.pronunciation'),
				prompt: 'Repeat this.',
				targetText: 'Legacy target.'
			}
		},
		{
			id: 'speaking',
			type: 'language.speaking-practice',
			content: { ...createWidgetContent('language.speaking-practice'), instructions: 'Read aloud.' }
		},
		{
			id: 'quiz',
			type: 'content.quiz',
			content: {
				...createWidgetContent('content.quiz'),
				document: createRichTextDocument([{ text: 'Answer the question.' }])
			}
		}
	]);
	assert.deepEqual(
		lessonSpeakingSentences(source).map((sentence) => sentence.text),
		['Hello there.', 'Welcome back.']
	);
	assert.deepEqual(
		lessonSpeakingSentences(source).map((sentence) => sentence.id),
		lessonCourseSentences(source)
			.filter((sentence) => sentence.widgetId === 'en')
			.map((sentence) => sentence.id)
	);
	assert.deepEqual(
		lessonSpeakingSentences(source).map((sentence) => sentence.referenceAudio),
		[undefined, undefined]
	);
});

test('duplicate sentence selections keep their distinct stable identities when other widgets move', () => {
	const source = lesson([passage('reading', 'Hello there. Hello there.')]);
	const before = lessonSpeakingSentences(source);
	const moved = lesson([passage('earlier', 'Good morning.'), source.frames[0].slots.lesson[0]]);
	const after = lessonSpeakingSentences(moved).slice(1);
	assert.notEqual(before[0].id, before[1].id);
	assert.deepEqual(
		after.map((sentence) => sentence.id),
		before.map((sentence) => sentence.id)
	);
});

test('synced audio provides exact per-sentence reference clips and stale transcripts do not', () => {
	const widget = audio();
	assert.deepEqual(
		lessonSpeakingSentences(lesson([widget])).map((sentence) => sentence.referenceAudio),
		[
			{ url: '/media/reference.mp3', startSeconds: 0, endSeconds: 1.2 },
			{ url: '/media/reference.mp3', startSeconds: 2, endSeconds: 3.5 }
		]
	);
	widget.content.transcribedText!.alignment = 'stale';
	assert.equal(lessonSpeakingSentences(lesson([widget]))[0].referenceAudio, undefined);
});

test('edited rich-text sentences only reuse complete matching media timing cues', () => {
	const resource: CourseMediaResource = {
		id: 'resource',
		name: 'reference',
		mediaId: 'media',
		mediaName: 'Reference',
		kind: 'audio',
		sourceUrl: '/media/reference.mp3',
		mimeType: 'audio/mpeg',
		transcribedText: audio().content.transcribedText!,
		createdAt: '',
		updatedAt: ''
	};
	const text = anchorRichTextDocument(
		createRichTextDocument([{ text: 'Hello there. Welcome back.' }]),
		courseMediaResourceCues(resource)
	);
	const widget: WidgetInstance<'content.rich-text'> = {
		id: 'reading',
		type: 'content.rich-text',
		content: {
			...createWidgetContent('content.rich-text'),
			document: text,
			highlightResourceName: resource.name
		}
	};
	assert.equal(
		lessonSpeakingSentences(lesson([widget]), [resource])[1].referenceAudio?.startSeconds,
		2
	);
	widget.content.document = anchorRichTextDocument(
		createRichTextDocument([{ text: 'Hello new friend. Welcome back.' }]),
		courseMediaResourceCues(resource)
	);
	const edited = lessonSpeakingSentences(lesson([widget]), [resource]);
	assert.equal(edited[0].referenceAudio, undefined);
	assert.equal(edited[1].referenceAudio?.startSeconds, 2);
});

test('malformed sentence selections are rejected on save', () => {
	const source = lesson([
		{
			id: 'speaking',
			type: 'language.speaking-practice',
			content: createWidgetContent('language.speaking-practice')
		}
	]);
	const malformed = JSON.parse(JSON.stringify(source));
	malformed.frames[0].slots.lesson[0].content.sentenceIds = [42];
	assert.throws(() => parseLessonDocument(malformed), CourseContentError);
	malformed.frames[0].slots.lesson[0].content.sentenceIds = [];
	malformed.frames[0].slots.lesson[0].content.sentenceMode = 'unexpected';
	assert.throws(() => parseLessonDocument(malformed), CourseContentError);
});
