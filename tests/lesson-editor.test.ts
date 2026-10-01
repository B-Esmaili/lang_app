import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	applyEditorCommand,
	BLANK_FRAME_TEMPLATE,
	createFrameFromTemplate,
	DEFAULT_FRAME_APPEARANCE,
	EditorCommandError,
	READ_AND_RESPOND_TEMPLATE,
	SAMPLE_LESSON_DOCUMENT,
	validateTemplateDefinition,
	type TemplateDefinition,
	type WidgetInstance
} from '../src/lib/features/lesson-editor/model';
import {
	collectWidgetCategories,
	CONTENT_WIDGET_DEFINITIONS,
	createWidgetContent,
	defineWidget,
	getWidgetCategories,
	LANGUAGE_WIDGET_DEFINITIONS
} from '../src/lib/features/lesson-editor/registry';

type TestWidgetContent = {
	type: 'test.widget';
	value: string;
};

declare module '../src/lib/features/lesson-editor/model/types' {
	interface WidgetContentMap {
		'test.widget': TestWidgetContent;
	}
}

test('starts with a borderless frame and relative responsive layouts', () => {
	assert.equal(DEFAULT_FRAME_APPEARANCE.border, 'none');
	assert.equal(DEFAULT_FRAME_APPEARANCE.surface, 'transparent');
	assert.deepEqual(
		BLANK_FRAME_TEMPLATE.slots.map((slot) => slot.id),
		['content']
	);
	assert.deepEqual(BLANK_FRAME_TEMPLATE.variants.phone.areas, [['content']]);
	assert.deepEqual(READ_AND_RESPOND_TEMPLATE.variants.desktop.columnWeights, [2, 1]);
	assert.deepEqual(READ_AND_RESPOND_TEMPLATE.variants.phone.columnWeights, [1]);
	assert.deepEqual(READ_AND_RESPOND_TEMPLATE.variants.phone.areas, [['lesson'], ['practice']]);
});

test('registry exposes a generic Rich text widget alongside language-learning widgets', () => {
	assert.deepEqual(
		getWidgetCategories().map((category) => category.id),
		['content', 'language-learning']
	);
	assert.deepEqual(
		CONTENT_WIDGET_DEFINITIONS.map((definition) => definition.type),
		['content.rich-text', 'content.callout', 'content.quiz', 'content.vocabulary']
	);
	assert.deepEqual(
		LANGUAGE_WIDGET_DEFINITIONS.map((definition) => definition.type),
		[
			'language.passage',
			'language.audio',
			'language.response',
			'language.vocabulary',
			'language.speaking-practice',
			'language.pronunciation',
			'language.voice-chat'
		]
	);
	assert.deepEqual(createWidgetContent('language.passage'), {
		type: 'language.passage',
		language: 'en',
		direction: 'auto',
		text: '',
		annotations: []
	});
	assert.deepEqual(createWidgetContent('content.rich-text'), {
		type: 'content.rich-text',
		language: 'en',
		direction: 'auto',
		document: { type: 'doc', content: [{ type: 'paragraph' }] },
		highlightResourceName: undefined,
		blockStyle: 'prose'
	});
});

test('a subject pack can add a typed widget and category without editing the core model', () => {
	const definition = defineWidget({
		type: 'test.widget',
		categoryId: 'test-subject',
		label: 'Test widget',
		description: 'A declaration-merged test widget.',
		icon: 'test-shape',
		createContent: () => ({ type: 'test.widget', value: 'typed value' })
	});
	const widget: WidgetInstance<'test.widget'> = {
		id: 'widget.test.one',
		type: definition.type,
		content: definition.createContent()
	};
	const categories = collectWidgetCategories(
		[{ id: 'test-subject', label: 'Test Subject', description: 'Only supplied by this test.' }],
		[definition]
	);
	const result = applyEditorCommand(SAMPLE_LESSON_DOCUMENT, {
		type: 'insert-widget',
		frameId: 'frame.introduction',
		slotId: 'lesson',
		widget
	});

	assert.deepEqual(
		categories.map((category) => category.id),
		['test-subject']
	);
	assert.equal(result.frames[0].slots.lesson.at(-1)?.type, 'test.widget');
	assert.equal(widget.content.value, 'typed value');
});

test('commands insert and reorder frames without mutating the source document', () => {
	const source = structuredClone(SAMPLE_LESSON_DOCUMENT);
	const secondFrame = createFrameFromTemplate('frame.second', READ_AND_RESPOND_TEMPLATE);
	const inserted = applyEditorCommand(source, {
		type: 'insert-frame',
		frame: secondFrame,
		index: 0
	});
	const moved = applyEditorCommand(inserted, {
		type: 'move-frame',
		frameId: 'frame.second',
		toIndex: 1
	});

	assert.equal(source.frames.length, 1);
	assert.deepEqual(
		inserted.frames.map((frame) => frame.id),
		['frame.second', 'frame.introduction']
	);
	assert.deepEqual(
		moved.frames.map((frame) => frame.id),
		['frame.introduction', 'frame.second']
	);
});

test('commands insert and update a widget while preserving unrelated references', () => {
	const source = structuredClone(SAMPLE_LESSON_DOCUMENT);
	const originalLessonWidgets = source.frames[0].slots.lesson;
	const inserted = applyEditorCommand(source, {
		type: 'insert-widget',
		frameId: 'frame.introduction',
		slotId: 'practice',
		widget: {
			id: 'widget.response.follow-up',
			type: 'language.response',
			content: {
				type: 'language.response',
				language: 'en',
				direction: 'ltr',
				prompt: 'Use rhythm in a sentence.',
				placeholder: 'Write a sentence…',
				format: 'short-text'
			}
		}
	});
	const updated = applyEditorCommand(inserted, {
		type: 'update-widget-content',
		frameId: 'frame.introduction',
		widgetId: 'widget.response.follow-up',
		content: {
			type: 'language.response',
			language: 'ar',
			direction: 'rtl',
			prompt: 'مرحبًا بالعالم',
			placeholder: 'اكتب جملة…',
			format: 'short-text'
		}
	});

	assert.equal(source.frames[0].slots.practice.length, 1);
	assert.equal(inserted.frames[0].slots.lesson, originalLessonWidgets);
	assert.equal(updated.frames[0].slots.practice[1].content.type, 'language.response');
	assert.equal(
		updated.frames[0].slots.practice[1].content.type === 'language.response'
			? updated.frames[0].slots.practice[1].content.prompt
			: '',
		'مرحبًا بالعالم'
	);
	const updatedContent = updated.frames[0].slots.practice[1].content;
	assert.equal(updatedContent.type === 'language.response' ? updatedContent.language : '', 'ar');
	assert.equal(updatedContent.type === 'language.response' ? updatedContent.direction : '', 'rtl');
});

test('applying a template retains every widget and maps incompatible slot names safely', () => {
	const stackedTemplate: TemplateDefinition = {
		id: 'template.stacked',
		name: 'Stacked',
		slots: [{ id: 'body', label: 'Body' }],
		variants: {
			desktop: { columnWeights: [1], areas: [['body']], order: ['body'], gap: 'lg' },
			tablet: { columnWeights: [1], areas: [['body']], order: ['body'], gap: 'md' },
			phone: { columnWeights: [1], areas: [['body']], order: ['body'], gap: 'sm' }
		}
	};
	const source = structuredClone(SAMPLE_LESSON_DOCUMENT);
	const originalWidgetIds = Object.values(source.frames[0].slots)
		.flat()
		.map((widget) => widget.id);
	const result = applyEditorCommand(source, {
		type: 'apply-template',
		frameId: 'frame.introduction',
		template: stackedTemplate
	});

	assert.equal(source.frames[0].templateId, READ_AND_RESPOND_TEMPLATE.id);
	assert.equal(result.frames[0].templateId, stackedTemplate.id);
	assert.deepEqual(
		result.frames[0].slots.body.map((widget) => widget.id),
		originalWidgetIds
	);
});

test('template validation rejects malformed relative grid areas before frame creation', () => {
	const invalidTemplate = structuredClone(READ_AND_RESPOND_TEMPLATE);
	invalidTemplate.variants.phone.areas = [['lesson', 'practice']];
	const issues = validateTemplateDefinition(invalidTemplate);

	assert.ok(issues.some((validationIssue) => validationIssue.path === 'variants.phone.areas.0'));
	assert.throws(
		() => createFrameFromTemplate('frame.invalid', invalidTemplate),
		(error: unknown) =>
			error instanceof EditorCommandError && error.message.includes('variants.phone.areas.0')
	);
});

test('appearance updates merge over the borderless defaults', () => {
	const source = structuredClone(SAMPLE_LESSON_DOCUMENT);
	const result = applyEditorCommand(source, {
		type: 'update-frame-appearance',
		frameId: 'frame.introduction',
		appearance: { border: 'subtle', radius: 'lg' }
	});

	assert.equal(source.frames[0].appearance.border, 'none');
	assert.deepEqual(result.frames[0].appearance, {
		...source.frames[0].appearance,
		border: 'subtle',
		radius: 'lg'
	});
});

test('document language and direction settings update immutably', () => {
	const source = structuredClone(SAMPLE_LESSON_DOCUMENT);
	const result = applyEditorCommand(source, {
		type: 'update-document-settings',
		settings: {
			title: 'درس عربی',
			language: 'ar',
			direction: 'rtl'
		}
	});

	assert.equal(source.language, 'fa');
	assert.equal(source.title, 'پیدا کردن آهنگ زبان');
	assert.equal(result.language, 'ar');
	assert.equal(result.direction, 'rtl');
	assert.equal(result.title, 'درس عربی');
	assert.equal(result.frames, source.frames);
});

test('documents remain JSON serializable after command application', () => {
	const frame = createFrameFromTemplate('frame.empty', READ_AND_RESPOND_TEMPLATE);
	const result = applyEditorCommand(SAMPLE_LESSON_DOCUMENT, {
		type: 'insert-frame',
		frame
	});

	assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
