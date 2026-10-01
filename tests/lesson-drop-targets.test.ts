import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	lessonDropAt,
	type LessonDropGeometry
} from '../src/lib/features/lesson-editor/interactions/lesson-drag';
import {
	READ_AND_RESPOND_TEMPLATE,
	createFrameFromTemplate,
	type LessonDocument,
	type WidgetInstance
} from '../src/lib/features/lesson-editor/model';

const passage = (id: string): WidgetInstance => ({
	id,
	type: 'language.passage',
	content: {
		type: 'language.passage',
		text: 'می‌خوانم',
		language: 'fa',
		direction: 'rtl',
		annotations: []
	}
});
const frame = createFrameFromTemplate('a', READ_AND_RESPOND_TEMPLATE);
frame.slots.lesson = [passage('first'), passage('second'), passage('third')];
const document: LessonDocument = {
	id: 'lesson',
	schemaVersion: 1,
	language: 'fa',
	direction: 'rtl',
	title: 'Test',
	frames: [frame, createFrameFromTemplate('b', READ_AND_RESPOND_TEMPLATE)]
};
const geometry: LessonDropGeometry = {
	width: 800,
	height: 900,
	frames: [
		{ id: 'a', rect: { x: 0, y: 0, width: 800, height: 400 } },
		{ id: 'b', rect: { x: 0, y: 450, width: 800, height: 400 } }
	],
	slots: [
		{ frameId: 'a', id: 'lesson', rect: { x: 400, y: 50, width: 400, height: 350 } },
		{ frameId: 'a', id: 'practice', rect: { x: 0, y: 50, width: 350, height: 350 } },
		{ frameId: 'b', id: 'lesson', rect: { x: 400, y: 500, width: 400, height: 350 } }
	],
	widgets: ['first', 'second', 'third'].map((id, index) => ({
		id,
		frameId: 'a',
		slotId: 'lesson',
		rect: { x: 400, y: 50 + index * 100, width: 400, height: 90 }
	}))
};
const templates = [READ_AND_RESPOND_TEMPLATE];

test('moving a first widget below its siblings uses the final index after removal', () => {
	const result = lessonDropAt(
		geometry,
		document,
		templates,
		{ kind: 'widget', widgetId: 'first' },
		600,
		340
	);
	assert.equal(result.target?.kind, 'widget');
	assert.equal(result.target?.index, 2);
	assert.equal(result.target?.rect.y, 340);
});
test('insertion over an RTL column follows native DOM boxes and widget midpoints', () => {
	const result = lessonDropAt(
		geometry,
		document,
		templates,
		{ kind: 'library', widgetType: 'language.passage' },
		600,
		155
	);
	assert.deepEqual(result.target, {
		kind: 'widget',
		frameId: 'a',
		slotId: 'lesson',
		index: 1,
		rect: { x: 400, y: 150, width: 400, height: 0 }
	});
});
test('empty compatible regions accept drops, incompatible regions never redirect them', () => {
	const source = { kind: 'library' as const, widgetType: 'language.passage' };
	assert.equal(lessonDropAt(geometry, document, templates, source, 600, 600).target?.index, 0);
	assert.equal(lessonDropAt(geometry, document, templates, source, 100, 100).invalid, true);
	assert.equal(lessonDropAt(geometry, document, templates, source, 100, 100).target, undefined);
});
test('outside paper and inter-region gaps cannot move or insert widgets', () => {
	for (const [x, y] of [
		[-1, 100],
		[900, 100],
		[600, 950],
		[380, 100]
	])
		assert.equal(
			lessonDropAt(geometry, document, templates, { kind: 'widget', widgetId: 'first' }, x, y)
				.target,
			undefined
		);
});
test('frame drops use remaining frame positions and cannot accept widget regions', () => {
	assert.equal(
		lessonDropAt(geometry, document, templates, { kind: 'frame', frameId: 'a' }, 300, 840).target
			?.index,
		1
	);
	assert.equal(
		lessonDropAt(geometry, document, templates, { kind: 'frame', frameId: 'b' }, 300, 20).target
			?.index,
		0
	);
});
test('unknown widgets or templates never produce a valid destination', () => {
	assert.equal(
		lessonDropAt(geometry, document, templates, { kind: 'widget', widgetId: 'missing' }, 600, 100)
			.invalid,
		true
	);
	assert.equal(
		lessonDropAt(
			geometry,
			document,
			[],
			{ kind: 'library', widgetType: 'language.passage' },
			600,
			100
		).invalid,
		true
	);
});
