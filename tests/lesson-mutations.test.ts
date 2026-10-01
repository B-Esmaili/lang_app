import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	applyEditorCommand,
	canPlaceWidget,
	createFrameFromTemplate,
	EditorCommandError,
	type LessonDocument,
	type TemplateDefinition,
	type WidgetInstance
} from '../src/lib/features/lesson-editor/model';

const template: TemplateDefinition = {
	id: 'template.test',
	name: 'Reading and listening',
	slots: [
		{ id: 'reading', label: 'Reading', accepts: ['language.passage'] },
		{ id: 'open', label: 'Anything' },
		{ id: 'audio', label: 'Listening', accepts: ['language.audio'] },
		{ id: 'closed', label: 'Closed', accepts: [] }
	],
	variants: Object.fromEntries(
		['desktop', 'tablet', 'phone'].map((mode) => [
			mode,
			{
				columnWeights: [1],
				areas: [['reading'], ['open'], ['audio'], ['closed']],
				order: ['reading', 'open', 'audio', 'closed'],
				gap: 'md'
			}
		])
	) as TemplateDefinition['variants']
};

function passage(id: string): WidgetInstance<'language.passage'> {
	return {
		id,
		type: 'language.passage',
		content: {
			type: 'language.passage',
			language: 'fa',
			direction: 'rtl',
			text: `متن ${id}`,
			annotations: [{ id: `annotation.${id}`, start: 0, end: 3, kind: 'highlight', tone: 'mint' }]
		}
	};
}

function fixture(): LessonDocument {
	const first = createFrameFromTemplate('first', template);
	first.slots.reading = [passage('a'), passage('b'), passage('c'), passage('d')];
	first.slots.open = [passage('e')];
	const second = createFrameFromTemplate('second', template);
	second.slots.open = [passage('f'), passage('g')];
	const third = createFrameFromTemplate('third', template);
	const result: LessonDocument = {
		schemaVersion: 1,
		id: 'lesson.test',
		title: 'Test',
		language: 'fa',
		direction: 'rtl',
		frames: [first, second, third]
	};
	return freeze(result);
}

function freeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		Object.freeze(value);
		for (const child of Object.values(value)) freeze(child);
	}
	return value;
}

const ids = (widgets: readonly WidgetInstance[]) => widgets.map((widget) => widget.id);
const widgets = (document: LessonDocument) =>
	document.frames.flatMap((frame) => Object.values(frame.slots).flat());

test('same-region move uses the final index after removal in either direction', () => {
	const source = fixture();
	const forward = applyEditorCommand(source, {
		type: 'move-widget',
		widgetId: 'b',
		targetFrameId: 'first',
		targetSlotId: 'reading',
		toIndex: 3
	});
	assert.deepEqual(ids(forward.frames[0].slots.reading), ['a', 'c', 'd', 'b']);
	const backward = applyEditorCommand(forward, {
		type: 'move-widget',
		widgetId: 'b',
		targetFrameId: 'first',
		targetSlotId: 'reading',
		toIndex: 0
	});
	assert.deepEqual(ids(backward.frames[0].slots.reading), ['b', 'a', 'c', 'd']);
	assert.deepEqual(ids(source.frames[0].slots.reading), ['a', 'b', 'c', 'd']);
	assert.equal(backward.frames[0].slots.reading[0], source.frames[0].slots.reading[1]);
});

test('a move between regions in one frame preserves all unrelated references', () => {
	const source = fixture();
	const result = applyEditorCommand(source, {
		type: 'move-widget',
		widgetId: 'b',
		targetFrameId: 'first',
		targetSlotId: 'open',
		toIndex: 0
	});
	assert.deepEqual(ids(result.frames[0].slots.reading), ['a', 'c', 'd']);
	assert.deepEqual(ids(result.frames[0].slots.open), ['b', 'e']);
	assert.equal(result.frames[0].slots.audio, source.frames[0].slots.audio);
	assert.equal(result.frames[1], source.frames[1]);
	assert.equal(result.frames[2], source.frames[2]);
	assert.equal(result.frames[0].appearance, source.frames[0].appearance);
});

test('cross-frame move preserves the widget object and every annotation exactly', () => {
	const source = fixture();
	const moved = source.frames[0].slots.reading[2];
	const result = applyEditorCommand(source, {
		type: 'move-widget',
		widgetId: 'c',
		targetFrameId: 'second',
		targetSlotId: 'open',
		toIndex: 1
	});
	assert.deepEqual(ids(result.frames[0].slots.reading), ['a', 'b', 'd']);
	assert.deepEqual(ids(result.frames[1].slots.open), ['f', 'c', 'g']);
	assert.equal(result.frames[1].slots.open[1], moved);
	assert.equal(result.frames[1].slots.open[1].content, moved.content);
	assert.equal(result.frames[0].slots.open, source.frames[0].slots.open);
	assert.equal(result.frames[1].slots.reading, source.frames[1].slots.reading);
	assert.equal(result.frames[2], source.frames[2]);
});

test('moving the final widget out of a region retains both region keys', () => {
	const source = fixture();
	const result = applyEditorCommand(source, {
		type: 'move-widget',
		widgetId: 'e',
		targetFrameId: 'third',
		targetSlotId: 'reading',
		toIndex: 0
	});
	assert.deepEqual(result.frames[0].slots.open, []);
	assert.deepEqual(ids(result.frames[2].slots.reading), ['e']);
	assert.ok(Object.hasOwn(result.frames[0].slots, 'open'));
});

test('move indices follow insertion normalization without losing a widget', () => {
	for (const [index, expected] of [
		[-100, 0],
		[1.9, 1],
		[100, 2],
		[NaN, 2],
		[Infinity, 2],
		[-Infinity, 2]
	]) {
		const result = applyEditorCommand(fixture(), {
			type: 'move-widget',
			widgetId: 'a',
			targetFrameId: 'second',
			targetSlotId: 'open',
			toIndex: index
		});
		assert.equal(result.frames[1].slots.open[expected].id, 'a');
		assert.equal(widgets(result).length, 7);
	}
});

test('a normalized same-position move returns the exact original document', () => {
	const source = fixture();
	for (const [widgetId, index] of [
		['a', -30],
		['b', 1.9],
		['d', 99],
		['d', NaN],
		['d', Infinity]
	] as const) {
		assert.equal(
			applyEditorCommand(source, {
				type: 'move-widget',
				widgetId,
				targetFrameId: 'first',
				targetSlotId: 'reading',
				toIndex: index
			}),
			source
		);
	}
	assert.equal(
		applyEditorCommand(source, { type: 'move-frame', frameId: 'second', toIndex: 1 }),
		source
	);
});

test('invalid move targets fail before any source removal', () => {
	const source = fixture();
	const serialized = JSON.stringify(source);
	for (const [widgetId, targetFrameId, targetSlotId] of [
		['missing', 'second', 'open'],
		['a', 'missing', 'open'],
		['a', 'second', 'missing'],
		['a', 'second', 'constructor']
	]) {
		assert.throws(
			() =>
				applyEditorCommand(source, {
					type: 'move-widget',
					widgetId,
					targetFrameId,
					targetSlotId,
					toIndex: 0
				}),
			EditorCommandError
		);
		assert.equal(JSON.stringify(source), serialized);
	}
});

test('all destination indices conserve IDs and content for same-slot and cross-frame moves', () => {
	const source = fixture();
	const original = new Map(widgets(source).map((widget) => [widget.id, widget]));
	for (const widgetId of original.keys()) {
		for (const frame of source.frames) {
			for (const slotId of ['reading', 'open']) {
				for (const index of [-1, 0, 1, 3, 99]) {
					const result = applyEditorCommand(source, {
						type: 'move-widget',
						widgetId,
						targetFrameId: frame.id,
						targetSlotId: slotId,
						toIndex: index
					});
					assert.equal(widgets(result).length, original.size);
					assert.equal(new Set(widgets(result).map((widget) => widget.id)).size, original.size);
					for (const widget of widgets(result)) assert.equal(widget, original.get(widget.id));
				}
			}
		}
	}
});

test('deleting one widget preserves siblings, unrelated slots and frames', () => {
	const source = fixture();
	const result = applyEditorCommand(source, { type: 'remove-widget', widgetId: 'b' });
	assert.deepEqual(ids(result.frames[0].slots.reading), ['a', 'c', 'd']);
	assert.equal(result.frames[0].slots.open, source.frames[0].slots.open);
	assert.equal(result.frames[1], source.frames[1]);
	assert.equal(result.frames[2], source.frames[2]);
	assert.equal(result.frames[0].slots.reading[1], source.frames[0].slots.reading[2]);
	assert.throws(
		() => applyEditorCommand(source, { type: 'remove-widget', widgetId: 'missing' }),
		EditorCommandError
	);
});

test('deleting the last widget leaves a valid empty region for later insertion', () => {
	const source = fixture();
	const empty = applyEditorCommand(source, { type: 'remove-widget', widgetId: 'e' });
	assert.deepEqual(empty.frames[0].slots.open, []);
	const refilled = applyEditorCommand(empty, {
		type: 'insert-widget',
		frameId: 'first',
		slotId: 'open',
		widget: passage('new'),
		index: 0
	});
	assert.deepEqual(ids(refilled.frames[0].slots.open), ['new']);
});

test('deleting frames removes their widgets and the final empty document accepts a new frame', () => {
	let document = fixture();
	for (const frameId of ['first', 'second', 'third'])
		document = applyEditorCommand(document, { type: 'remove-frame', frameId });
	assert.deepEqual(document.frames, []);
	assert.deepEqual(widgets(document), []);
	const result = applyEditorCommand(document, {
		type: 'insert-frame',
		frame: createFrameFromTemplate('new', template)
	});
	assert.equal(result.frames.length, 1);
	assert.equal(result.frames[0].id, 'new');
});

test('explicit placement checks exact slot accepts and never redirects to a compatible neighbor', () => {
	const document = fixture();
	assert.equal(canPlaceWidget(document, [template], 'language.passage', 'first', 'reading'), true);
	assert.equal(canPlaceWidget(document, [template], 'language.audio', 'first', 'reading'), false);
	assert.equal(canPlaceWidget(document, [template], 'language.passage', 'first', 'audio'), false);
	assert.equal(canPlaceWidget(document, [template], 'language.audio', 'first', 'audio'), true);
	assert.equal(canPlaceWidget(document, [template], 'language.passage', 'first', 'closed'), false);
	assert.equal(
		canPlaceWidget(document, [template], 'future.subject-widget', 'first', 'open'),
		true
	);
});

test('explicit placement rejects missing templates, stale region definitions, and missing frame slots', () => {
	const document = fixture();
	assert.equal(canPlaceWidget(document, [], 'language.passage', 'first', 'reading'), false);
	assert.equal(
		canPlaceWidget(document, [template], 'language.passage', 'missing', 'reading'),
		false
	);
	assert.equal(canPlaceWidget(document, [template], 'language.passage', 'first', 'missing'), false);
	assert.equal(
		canPlaceWidget(document, [template], 'language.passage', 'first', 'constructor'),
		false
	);
	const changedTemplate = {
		...template,
		slots: template.slots.filter((slot) => slot.id !== 'reading')
	};
	assert.equal(
		canPlaceWidget(document, [changedTemplate], 'language.passage', 'first', 'reading'),
		false
	);
	const missingRegion = { ...document, frames: [{ ...document.frames[0], slots: { open: [] } }] };
	assert.equal(
		canPlaceWidget(missingRegion, [template], 'language.passage', 'first', 'reading'),
		false
	);
});
