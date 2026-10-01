import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	READ_AND_RESPOND_TEMPLATE,
	validateTemplateDefinition,
	type LayoutGap,
	type LayoutPreviewMode,
	type TemplateDefinition
} from '../src/lib/features/lesson-editor/model';
import {
	applyLayoutPreset,
	createBlankTemplate,
	getOrderedSlots,
	insertRegion,
	insertRegionAndReflow,
	isRegionFullWidth,
	LAYOUT_PRESETS,
	MAX_TEMPLATE_REGIONS,
	removeRegion,
	reorderRegion,
	setColumnWeight,
	setLayoutGap,
	setLayoutPadding,
	setRegionFullWidth,
	type DropPlacement,
	type LayoutPresetId
} from '../src/lib/features/template-editor/model';
import { parseTemplateDefinition } from '../src/lib/server/course-content';

function assertValid(definition: TemplateDefinition) {
	assert.deepEqual(validateTemplateDefinition(definition), []);
}

function freezeDeep<T>(value: T): T {
	if (value && typeof value === 'object') {
		Object.freeze(value);
		for (const child of Object.values(value)) freezeDeep(child);
	}
	return value;
}

function spanningTemplate(): TemplateDefinition {
	const slots = ['reading', 'audio', 'response', 'notes'].map((id) => ({ id, label: id }));
	return {
		id: 'template.spanning',
		name: 'Spanning learning layout',
		slots,
		variants: {
			desktop: {
				columnWeights: [2.5, 1, 1.5],
				areas: [
					['reading', 'reading', 'audio'],
					['response', 'notes', 'audio']
				],
				order: ['reading', 'audio', 'response', 'notes'],
				gap: 'xl'
			},
			tablet: {
				columnWeights: [3, 2],
				areas: [
					['reading', 'audio'],
					['reading', 'response'],
					['notes', 'notes']
				],
				order: ['reading', 'audio', 'response', 'notes'],
				gap: 'md'
			},
			phone: {
				columnWeights: [1],
				areas: [['audio'], ['reading'], ['notes'], ['response']],
				order: ['audio', 'reading', 'notes', 'response'],
				gap: 'sm'
			}
		}
	};
}

test('blank templates have independent responsive layouts and can roundtrip as JSON', () => {
	const definition = createBlankTemplate('template.new');
	assertValid(definition);
	assert.equal(definition.id, 'template.new');
	assert.notEqual(definition.variants.desktop, definition.variants.tablet);
	assert.notEqual(definition.variants.tablet.areas, definition.variants.phone.areas);
	assert.equal(createBlankTemplate(' ').id, 'template.draft');
	assert.deepEqual(JSON.parse(JSON.stringify(definition)), definition);
});

test('ordered regions follow each device and tolerate missing, duplicate, or stale order entries', () => {
	const definition = spanningTemplate();
	assert.deepEqual(
		getOrderedSlots(definition, 'phone').map((slot) => slot.id),
		['audio', 'reading', 'notes', 'response']
	);
	definition.variants.phone.order = ['audio', 'audio', 'missing'];
	assert.deepEqual(
		getOrderedSlots(definition, 'phone').map((slot) => slot.id),
		['audio', 'reading', 'response', 'notes']
	);
});

test('dragging reassigns rectangular positions only on the active device and preserves fractional widths', () => {
	const definition = freezeDeep(spanningTemplate());
	const updated = reorderRegion(definition, 'desktop', 'notes', 'reading', 'before');
	assert.deepEqual(updated.variants.desktop.order, ['notes', 'reading', 'audio', 'response']);
	assert.deepEqual(updated.variants.desktop.areas, [
		['notes', 'notes', 'reading'],
		['audio', 'response', 'reading']
	]);
	assert.equal(updated.variants.desktop.columnWeights, definition.variants.desktop.columnWeights);
	assert.equal(updated.variants.tablet, definition.variants.tablet);
	assert.equal(updated.variants.phone, definition.variants.phone);
	assert.equal(updated.slots, definition.slots);
	assertValid(updated);
	const restored = reorderRegion(updated, 'desktop', 'notes', 'response', 'after');
	assert.deepEqual(restored, definition);
});

test('an insertion retains custom spans, relative widths, and individual responsive reading orders', () => {
	const definition = freezeDeep(spanningTemplate());
	const slot = { id: 'vocabulary', label: 'واژه‌ها', description: 'مفردات' };
	const updated = insertRegion(definition, slot, 'tablet');
	for (const mode of ['desktop', 'tablet', 'phone'] as const) {
		assert.deepEqual(updated.variants[mode].areas.slice(0, -1), definition.variants[mode].areas);
		assert.deepEqual(updated.variants[mode].order, [...definition.variants[mode].order, slot.id]);
		assert.equal(updated.variants[mode].columnWeights, definition.variants[mode].columnWeights);
		assert.deepEqual(
			updated.variants[mode].areas.at(-1),
			definition.variants[mode].columnWeights.map(() => slot.id)
		);
	}
	assertValid(updated);
	assert.deepEqual(removeRegion(updated, slot.id), definition);
	slot.label = 'Caller changed the palette entry';
	assert.equal(updated.slots.at(-1)?.label, 'واژه‌ها');
});

test('imported layouts align visible positions with the requested reading order when dragged', () => {
	const definition = structuredClone(READ_AND_RESPOND_TEMPLATE);
	definition.variants.desktop.order = ['practice', 'lesson'];
	freezeDeep(definition);

	// The lesson is already visibly before practice; update reading order without swapping it away.
	const alignedReading = reorderRegion(definition, 'desktop', 'lesson', 'practice', 'before');
	assert.deepEqual(alignedReading.variants.desktop.order, ['lesson', 'practice']);
	assert.deepEqual(alignedReading.variants.desktop.areas, [['lesson', 'practice']]);

	// A drop that is already true in reading order must still move the visible region into position.
	const alignedPositions = reorderRegion(definition, 'desktop', 'practice', 'lesson', 'before');
	assert.deepEqual(alignedPositions.variants.desktop.order, ['practice', 'lesson']);
	assert.deepEqual(alignedPositions.variants.desktop.areas, [['practice', 'lesson']]);
	assert.equal(
		alignedPositions.variants.desktop.columnWeights,
		definition.variants.desktop.columnWeights
	);
	assert.equal(alignedPositions.variants.tablet, definition.variants.tablet);
	assert.equal(alignedPositions.variants.phone, definition.variants.phone);
	assertValid(alignedReading);
	assertValid(alignedPositions);
});

test('palette drops insert at the selected device target and append on the other devices', () => {
	const definition = freezeDeep(spanningTemplate());
	const updated = insertRegion(
		definition,
		{ id: 'new', label: 'New region' },
		'phone',
		'reading',
		'before'
	);
	assert.deepEqual(updated.variants.phone.order, ['audio', 'new', 'reading', 'notes', 'response']);
	assert.deepEqual(updated.variants.desktop.order, [...definition.variants.desktop.order, 'new']);
	assert.deepEqual(updated.variants.tablet.areas.slice(0, -1), definition.variants.tablet.areas);
	assertValid(updated);
});

test('removing a region expands whole neighboring edges without destroying unaffected spans or weights', () => {
	const definition = freezeDeep(spanningTemplate());
	const updated = removeRegion(definition, 'notes');
	assert.deepEqual(updated.variants.desktop.areas, [
		['reading', 'reading', 'audio'],
		['response', 'response', 'audio']
	]);
	assert.deepEqual(updated.variants.tablet.areas, [
		['reading', 'audio'],
		['reading', 'response']
	]);
	assert.deepEqual(updated.variants.phone.order, ['audio', 'reading', 'response']);
	for (const mode of ['desktop', 'tablet', 'phone'] as const)
		assert.equal(updated.variants[mode].columnWeights, definition.variants[mode].columnWeights);
	assertValid(updated);
});

test('removing a column region keeps the existing column ratios by expanding remaining regions', () => {
	const definition = freezeDeep(structuredClone(READ_AND_RESPOND_TEMPLATE));
	const updated = removeRegion(definition, 'practice');
	assert.deepEqual(updated.variants.desktop.columnWeights, [2, 1]);
	assert.deepEqual(updated.variants.desktop.areas, [['lesson', 'lesson']]);
	assert.deepEqual(updated.variants.tablet.columnWeights, [3, 2]);
	assert.deepEqual(updated.variants.phone.areas, [['lesson']]);
	assertValid(updated);
});

test('deleting the center of interlocking rectangles produces a valid layout with the same ratios', () => {
	let definition = createBlankTemplate('template.pinwheel');
	definition.slots = ['a', 'b', 'c', 'd', 'center'].map((id) => ({ id, label: id }));
	for (const mode of ['desktop', 'tablet', 'phone'] as const) {
		definition.variants[mode] = {
			columnWeights: [2, 1, 3],
			areas: [
				['a', 'a', 'b'],
				['c', 'center', 'b'],
				['c', 'd', 'd']
			],
			order: ['a', 'b', 'c', 'd', 'center'],
			gap: 'md'
		};
	}
	assertValid(definition);
	definition = freezeDeep(definition);
	const updated = removeRegion(definition, 'center');
	assertValid(updated);
	assert.deepEqual(updated.variants.desktop.columnWeights, [2, 1, 3]);
	assert.deepEqual(updated.variants.desktop.order, ['a', 'b', 'c', 'd']);
});

test('layout presets honor active reading order and gap while leaving other devices unchanged', () => {
	const definition = freezeDeep(spanningTemplate());
	const updated = applyLayoutPreset(definition, 'phone', 'sidebar');
	assert.deepEqual(updated.variants.phone.columnWeights, [2, 1]);
	assert.deepEqual(updated.variants.phone.areas, [
		['audio', 'reading'],
		['notes', 'response']
	]);
	assert.equal(updated.variants.phone.gap, 'sm');
	assert.equal(updated.variants.desktop, definition.variants.desktop);
	assert.equal(updated.variants.tablet, definition.variants.tablet);
	assert.equal(applyLayoutPreset(updated, 'phone', 'sidebar'), updated);
	assertValid(updated);
});

test('compositional presets cover lead, focus, rail, timeline, and asymmetric structures', () => {
	let definition = createBlankTemplate('template.patterns');
	for (let count = 2; count <= 6; count += 1)
		definition = insertRegion(
			definition,
			{ id: `region-${count}`, label: `Region ${count}` },
			'desktop'
		);
	const originalTablet = definition.variants.tablet;
	const originalPhone = definition.variants.phone;

	const hero = applyLayoutPreset(definition, 'desktop', 'hero');
	assert.deepEqual(hero.variants.desktop.columnWeights, [2, 1]);
	assert.deepEqual(hero.variants.desktop.areas.slice(0, 2), [
		['content', 'content'],
		['region-2', 'region-3']
	]);

	const focus = applyLayoutPreset(definition, 'desktop', 'focus');
	assert.deepEqual(focus.variants.desktop.columnWeights, [1, 1]);
	assert.deepEqual(focus.variants.desktop.areas.slice(0, 3), [
		['content', 'content'],
		['region-2', 'region-2'],
		['region-3', 'region-4']
	]);

	const magazine = applyLayoutPreset(definition, 'desktop', 'magazine');
	assert.deepEqual(magazine.variants.desktop.columnWeights, [1, 1]);
	assert.deepEqual(magazine.variants.desktop.areas.slice(0, 2), [
		['content', 'content'],
		['region-2', 'region-3']
	]);

	const rail = applyLayoutPreset(definition, 'desktop', 'rail');
	assert.deepEqual(rail.variants.desktop.columnWeights, [1, 2, 1]);
	assert.deepEqual(rail.variants.desktop.areas[0], ['content', 'region-2', 'region-3']);

	const timeline = applyLayoutPreset(definition, 'desktop', 'timeline');
	assert.deepEqual(timeline.variants.desktop.columnWeights, [1, 3]);
	assert.deepEqual(timeline.variants.desktop.areas[0], ['content', 'region-2']);

	const asymmetric = applyLayoutPreset(definition, 'desktop', 'asymmetric');
	assert.deepEqual(asymmetric.variants.desktop.columnWeights, [3, 2, 1]);
	assert.deepEqual(asymmetric.variants.desktop.areas[0], ['content', 'region-2', 'region-3']);

	for (const arranged of [hero, focus, magazine, rail, timeline, asymmetric]) {
		assertValid(arranged);
		assert.equal(arranged.variants.tablet, originalTablet);
		assert.equal(arranged.variants.phone, originalPhone);
	}
});

test('adding a region reflows standard patterns on every responsive variant', () => {
	let definition = createBlankTemplate('template.reflow');
	for (let count = 2; count <= 4; count += 1)
		definition = insertRegion(
			definition,
			{ id: `region-${count}`, label: `Region ${count}` },
			'desktop'
		);
	definition = applyLayoutPreset(definition, 'desktop', 'hero');
	definition = applyLayoutPreset(definition, 'tablet', 'rail');
	const updated = insertRegionAndReflow(
		definition,
		{ id: 'new-region', label: 'New region' },
		'desktop'
	);

	assert.deepEqual(updated.variants.desktop.areas, [
		['content', 'content'],
		['region-2', 'region-3'],
		['region-4', 'new-region']
	]);
	assert.deepEqual(updated.variants.tablet.areas, [
		['content', 'region-2', 'region-3'],
		['region-4', 'new-region', 'new-region']
	]);
	assert.deepEqual(updated.variants.phone.areas.slice(-2), [['region-4'], ['new-region']]);
	assertValid(updated);
});

test('width and spacing edits accept relative units and preserve all other layout properties', () => {
	const definition = freezeDeep(spanningTemplate());
	const weighted = setColumnWeight(definition, 'tablet', 1, 0.75);
	const updated = setLayoutGap(weighted, 'tablet', 'none');
	assert.deepEqual(updated.variants.tablet.columnWeights, [3, 0.75]);
	assert.equal(updated.variants.tablet.areas, definition.variants.tablet.areas);
	assert.equal(updated.variants.tablet.order, definition.variants.tablet.order);
	assert.equal(updated.variants.tablet.gap, 'none');
	assert.equal(updated.variants.phone, definition.variants.phone);
	assert.equal(updated.variants.desktop, definition.variants.desktop);
	assertValid(updated);
	assert.deepEqual(JSON.parse(JSON.stringify(updated)), updated);
});

test('optional inner padding stays backward compatible and changes only the selected device', () => {
	const original = freezeDeep(spanningTemplate());
	assert.equal(setLayoutPadding(original, 'tablet', 'none'), original);
	const updated = setLayoutPadding(original, 'tablet', 'lg');
	assert.equal(updated.variants.tablet.padding, 'lg');
	assert.equal(updated.variants.tablet.areas, original.variants.tablet.areas);
	assert.equal(updated.variants.tablet.columnWeights, original.variants.tablet.columnWeights);
	assert.equal(updated.variants.tablet.order, original.variants.tablet.order);
	assert.equal(updated.variants.desktop, original.variants.desktop);
	assert.equal(updated.variants.phone, original.variants.phone);
	assert.equal(setLayoutPadding(updated, 'tablet', 'lg'), updated);
	assert.equal(setLayoutPadding(updated, 'tablet', '2rem' as LayoutGap), updated);
	assert.equal(setLayoutPadding(updated, 'missing' as LayoutPreviewMode, 'sm'), updated);
	assert.equal(setLayoutPadding(updated, 'tablet', 'none').variants.tablet.padding, 'none');
	assertValid(updated);
	const json = JSON.parse(JSON.stringify(updated));
	assert.deepEqual(json, updated);
	assert.equal(parseTemplateDefinition(json).variants.tablet.padding, 'lg');
	assert.equal(Object.hasOwn(parseTemplateDefinition(original).variants.desktop, 'padding'), false);
	for (const padding of ['2rem', 'wide', null, 16, '', false]) {
		const invalid = structuredClone(json);
		(invalid.variants.tablet as Record<string, unknown>).padding = padding;
		assert.throws(() => parseTemplateDefinition(invalid), /padding/);
	}
});

test('all layout operations retain saved inner padding unless padding itself is changed', () => {
	const original = freezeDeep(setLayoutPadding(spanningTemplate(), 'desktop', 'sm'));
	const operations = [
		applyLayoutPreset(original, 'desktop', 'split'),
		reorderRegion(original, 'desktop', 'audio', 'notes', 'after'),
		setColumnWeight(original, 'desktop', 0, 1.25),
		setLayoutGap(original, 'desktop', 'xs'),
		insertRegion(original, { id: 'new', label: 'New region' }, 'desktop'),
		removeRegion(original, 'notes'),
		setRegionFullWidth(original, 'desktop', 'reading', true)
	];
	for (const updated of operations) {
		assert.equal(updated.variants.desktop.padding, 'sm');
		assert.equal(
			parseTemplateDefinition(JSON.parse(JSON.stringify(updated))).variants.desktop.padding,
			'sm'
		);
		assertValid(updated);
	}
});

test('full-row control creates the video tablet arrangement without changing content or other devices', () => {
	let definition = createBlankTemplate('template.video-layout');
	definition = insertRegion(definition, { id: 'audio', label: 'Audio' }, 'tablet');
	definition = insertRegion(definition, { id: 'response', label: 'Response' }, 'tablet');
	definition = applyLayoutPreset(definition, 'tablet', 'split');
	definition = freezeDeep(setLayoutPadding(definition, 'tablet', 'md'));
	const arranged = setRegionFullWidth(definition, 'tablet', 'content', true);
	assert.deepEqual(arranged.variants.tablet.areas, [
		['content', 'content'],
		['audio', 'response']
	]);
	assert.equal(arranged.variants.tablet.columnWeights, definition.variants.tablet.columnWeights);
	assert.equal(arranged.variants.tablet.order, definition.variants.tablet.order);
	assert.equal(arranged.variants.tablet.padding, 'md');
	assert.equal(arranged.variants.tablet.gap, definition.variants.tablet.gap);
	assert.equal(arranged.variants.desktop, definition.variants.desktop);
	assert.equal(arranged.variants.phone, definition.variants.phone);
	assert.equal(arranged.slots, definition.slots);
	assert.equal(isRegionFullWidth(arranged, 'tablet', 'content'), true);
	assert.equal(isRegionFullWidth(arranged, 'tablet', 'audio'), false);
	assert.equal(isRegionFullWidth(arranged, 'tablet', 'response'), false);
	assert.equal(setRegionFullWidth(arranged, 'tablet', 'content', true), arranged);
	assert.equal(setRegionFullWidth(arranged, 'tablet', 'audio', false), arranged);
	assertValid(arranged);
});

test('full-row controls preserve complex geometry on redundant requests and handle invalid input', () => {
	const definition = freezeDeep(spanningTemplate());
	assert.equal(setRegionFullWidth(definition, 'desktop', 'reading', false), definition);
	assert.equal(setRegionFullWidth(definition, 'tablet', 'notes', true), definition);
	assert.equal(setRegionFullWidth(definition, 'phone', 'reading', false), definition);
	assert.equal(setRegionFullWidth(definition, 'desktop', 'missing', true), definition);
	assert.equal(
		setRegionFullWidth(definition, 'missing' as LayoutPreviewMode, 'reading', true),
		definition
	);
	assert.equal(isRegionFullWidth(definition, 'phone', 'reading'), true);
	assert.equal(isRegionFullWidth(definition, 'desktop', 'missing'), false);
	assert.equal(isRegionFullWidth(definition, 'missing' as LayoutPreviewMode, 'reading'), false);
});

test('full-row toggles stay rectangular and can return every region to a shared row', () => {
	let definition = createBlankTemplate('template.full-width-sequence');
	for (let count = 2; count <= MAX_TEMPLATE_REGIONS; count += 1) {
		definition = insertRegion(
			definition,
			{ id: `region-${count}`, label: `Region ${count}` },
			'desktop'
		);
		for (const preset of LAYOUT_PRESETS.filter((item) => item.columnWeights.length > 1)) {
			const arranged = applyLayoutPreset(definition, 'desktop', preset.id);
			for (const slot of arranged.slots) {
				const full = setRegionFullWidth(arranged, 'desktop', slot.id, true);
				assert.equal(isRegionFullWidth(full, 'desktop', slot.id), true);
				assertValid(full);
				const shared = setRegionFullWidth(full, 'desktop', slot.id, false);
				assert.equal(isRegionFullWidth(shared, 'desktop', slot.id), false);
				assertValid(shared);
				assert.deepEqual(shared.variants.desktop.order, arranged.variants.desktop.order);
				assert.equal(shared.variants.phone, arranged.variants.phone);
				assert.equal(shared.variants.tablet, arranged.variants.tablet);
			}
		}
	}
});

test('invalid and redundant operations are safe reference-preserving no-ops', () => {
	const definition = freezeDeep(spanningTemplate());
	assert.equal(reorderRegion(definition, 'desktop', 'reading', 'audio', 'before'), definition);
	assert.equal(reorderRegion(definition, 'desktop', 'reading', 'reading', 'after'), definition);
	assert.equal(reorderRegion(definition, 'desktop', 'missing', 'audio', 'before'), definition);
	assert.equal(reorderRegion(definition, 'desktop', 'reading', 'missing', 'after'), definition);
	assert.equal(
		reorderRegion(definition, 'desktop', 'reading', 'audio', 'invalid' as DropPlacement),
		definition
	);
	assert.equal(removeRegion(definition, 'missing'), definition);
	assert.equal(
		insertRegion(definition, { id: 'reading', label: 'Duplicate' }, 'desktop'),
		definition
	);
	assert.equal(insertRegion(definition, { id: '', label: 'Empty id' }, 'desktop'), definition);
	assert.equal(insertRegion(definition, { id: 'new', label: ' ' }, 'desktop'), definition);
	assert.equal(
		insertRegion(definition, { id: 'new', label: 'New' }, 'desktop', 'missing'),
		definition
	);
	assert.equal(applyLayoutPreset(definition, 'desktop', 'invalid' as LayoutPresetId), definition);
	assert.equal(applyLayoutPreset(definition, 'invalid' as LayoutPreviewMode, 'stack'), definition);
	for (const weight of [0, -1, NaN, Infinity, 101])
		assert.equal(setColumnWeight(definition, 'desktop', 0, weight), definition);
	for (const index of [-1, 0.5, 100])
		assert.equal(setColumnWeight(definition, 'desktop', index, 1), definition);
	assert.equal(setColumnWeight(definition, 'desktop', 0, 2.5), definition);
	assert.equal(setLayoutGap(definition, 'desktop', 'xl'), definition);
	assert.equal(setLayoutGap(definition, 'desktop', 'invalid' as LayoutGap), definition);
	const blank = freezeDeep(createBlankTemplate('template.empty'));
	assert.equal(removeRegion(blank, 'content'), blank);
});

test('every preset remains rectangular across region counts and sequential insert, drag, delete operations', () => {
	let definition = createBlankTemplate('template.sequence');
	for (let count = 2; count <= MAX_TEMPLATE_REGIONS; count += 1) {
		definition = insertRegion(
			definition,
			{ id: `region-${count}`, label: `Region ${count}` },
			'desktop'
		);
		for (const preset of LAYOUT_PRESETS) {
			const arranged = applyLayoutPreset(definition, 'desktop', preset.id);
			assertValid(arranged);
			const reordered = reorderRegion(arranged, 'desktop', `region-${count}`, 'content', 'before');
			assertValid(reordered);
			for (const slot of arranged.slots) assertValid(removeRegion(reordered, slot.id));
		}
	}
	assert.equal(definition.slots.length, MAX_TEMPLATE_REGIONS);
	assert.equal(
		insertRegion(definition, { id: 'overflow', label: 'Overflow' }, 'desktop'),
		definition
	);
	while (definition.slots.length > 1) {
		definition = removeRegion(definition, definition.slots.at(-1)!.id);
		assertValid(definition);
	}
	assert.deepEqual(definition, createBlankTemplate('template.sequence'));
});
