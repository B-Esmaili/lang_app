import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	validateTemplateDefinition,
	type LayoutPreviewMode,
	type TemplateDefinition
} from '../src/lib/features/lesson-editor/model';
import {
	COLUMN_PAIR_MAX,
	COLUMN_PAIR_MIN,
	resizeColumnPair
} from '../src/lib/features/template-editor/column-resize';
import { parseTemplateDefinition } from '../src/lib/server/course-content';

function template(weights = [2.5, 1, 1.5, 3]): TemplateDefinition {
	return {
		id: 'template.resize',
		name: 'A responsive learning layout',
		description: 'Preserve the authored content and every rectangular span.',
		slots: ['reading', 'audio', 'response', 'notes'].map((id) => ({ id, label: id })),
		variants: {
			desktop: {
				columnWeights: weights,
				areas: [
					['reading', 'reading', 'audio', 'audio'],
					['response', 'notes', 'audio', 'audio']
				],
				order: ['reading', 'audio', 'response', 'notes'],
				gap: 'lg',
				padding: 'sm'
			},
			tablet: {
				columnWeights: [3, 2],
				areas: [
					['reading', 'audio'],
					['reading', 'response'],
					['notes', 'notes']
				],
				order: ['reading', 'audio', 'response', 'notes'],
				gap: 'md',
				padding: 'xs'
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

function freezeDeep<T>(value: T): T {
	if (value && typeof value === 'object') {
		Object.freeze(value);
		for (const child of Object.values(value)) freezeDeep(child);
	}
	return value;
}

function close(actual: number, expected: number) {
	assert.ok(Math.abs(actual - expected) < 1e-10, `Expected ${actual} to be close to ${expected}`);
}

test('resizing a pair retains its total, sibling widths, spans, reading order, and device variants', () => {
	const original = freezeDeep(template());
	const updated = resizeColumnPair(original, 'desktop', 1, 0.7);
	assert.deepEqual(updated.variants.desktop.columnWeights, [2.5, 1.75, 0.75, 3]);
	assert.equal(updated.slots, original.slots);
	assert.equal(updated.variants.tablet, original.variants.tablet);
	assert.equal(updated.variants.phone, original.variants.phone);
	assert.equal(updated.variants.desktop.areas, original.variants.desktop.areas);
	assert.equal(updated.variants.desktop.order, original.variants.desktop.order);
	assert.equal(updated.variants.desktop.gap, 'lg');
	assert.equal(updated.variants.desktop.padding, 'sm');
	assert.equal(updated.name, original.name);
	assert.equal(updated.description, original.description);
	assert.deepEqual(validateTemplateDefinition(updated), []);
	assert.deepEqual(
		JSON.parse(JSON.stringify(parseTemplateDefinition(JSON.parse(JSON.stringify(updated))))),
		updated
	);
});

test('a tablet edit preserves desktop proportions and leaves phone flow independent', () => {
	const original = freezeDeep(template());
	const updated = resizeColumnPair(original, 'tablet', 0, 0.4);
	assert.deepEqual(updated.variants.tablet.columnWeights, [2, 3]);
	assert.equal(updated.variants.desktop, original.variants.desktop);
	assert.equal(updated.variants.phone, original.variants.phone);
	assert.equal(updated.variants.tablet.areas, original.variants.tablet.areas);
	assert.equal(updated.variants.tablet.order, original.variants.tablet.order);
	assert.equal(updated.variants.tablet.padding, 'xs');
	assert.deepEqual(validateTemplateDefinition(updated), []);
});

test('pointer overshoot and keyboard limits clamp each side to ten percent of its pair', () => {
	const original = freezeDeep(template());
	for (const [ratio, expected] of [
		[-5, COLUMN_PAIR_MIN],
		[0, COLUMN_PAIR_MIN],
		[0.05, COLUMN_PAIR_MIN],
		[0.95, COLUMN_PAIR_MAX],
		[1, COLUMN_PAIR_MAX],
		[9, COLUMN_PAIR_MAX]
	]) {
		const updated = resizeColumnPair(original, 'desktop', 2, ratio);
		const weights = updated.variants.desktop.columnWeights;
		close(weights[2] / (weights[2] + weights[3]), expected);
		close(weights[2] + weights[3], 4.5);
		assert.deepEqual(weights.slice(0, 2), original.variants.desktop.columnWeights.slice(0, 2));
		assert.deepEqual(validateTemplateDefinition(updated), []);
	}
});

test('large pair weights normalize every active track while retaining the requested geometry', () => {
	const original = freezeDeep(template([80, 90, 20, 10]));
	const updated = resizeColumnPair(original, 'desktop', 0, 0.9);
	const weights = updated.variants.desktop.columnWeights;
	assert.equal(weights[0], 100);
	assert.ok(weights.every((weight) => weight > 0 && weight <= 100));
	close(weights[0] / (weights[0] + weights[1]), 0.9);
	close(weights[2] / weights[3], 2);
	close((weights[0] + weights[1]) / weights[2], 170 / 20);
	close(weights[2] / weights.reduce((total, weight) => total + weight, 0), 20 / 200);
	assert.equal(updated.variants.phone, original.variants.phone);
	assert.equal(updated.variants.tablet, original.variants.tablet);
	assert.equal(updated.variants.desktop.areas, original.variants.desktop.areas);
	assert.deepEqual(
		JSON.parse(JSON.stringify(parseTemplateDefinition(JSON.parse(JSON.stringify(updated))))),
		updated
	);
	assert.deepEqual(validateTemplateDefinition(updated), []);
});

test('invalid indices, nonfinite ratios, missing devices, and single-column flow preserve identity', () => {
	const original = freezeDeep(template());
	for (const index of [-1, 0.5, 3, 4, NaN, Infinity])
		assert.equal(resizeColumnPair(original, 'desktop', index, 0.5), original);
	for (const ratio of [NaN, Infinity, -Infinity])
		assert.equal(resizeColumnPair(original, 'desktop', 0, ratio), original);
	for (const mode of ['missing', '__proto__', 'constructor'])
		assert.equal(resizeColumnPair(original, mode as LayoutPreviewMode, 0, 0.5), original);
	assert.equal(resizeColumnPair(original, 'phone', 0, 0.5), original);
});

test('malformed existing weights cannot introduce invalid numbers into a saved template', () => {
	for (const weight of [0, -1, NaN, Infinity, -Infinity, 101]) {
		const original = freezeDeep(template([2, 1, weight, 3]));
		assert.equal(resizeColumnPair(original, 'desktop', 0, 0.6), original);
	}
	const underflow = freezeDeep(template([Number.MIN_VALUE, Number.MIN_VALUE, 1, 1]));
	assert.equal(resizeColumnPair(underflow, 'desktop', 0, 0.1), underflow);
});

test('unchanged ratios and repeated clamped requests preserve reference identity', () => {
	const original = freezeDeep(template());
	assert.equal(resizeColumnPair(original, 'desktop', 0, 2.5 / 3.5), original);
	const minimum = freezeDeep(resizeColumnPair(original, 'desktop', 0, 0.1));
	assert.equal(resizeColumnPair(minimum, 'desktop', 0, -1), minimum);
	const maximum = freezeDeep(resizeColumnPair(original, 'desktop', 0, 0.9));
	assert.equal(resizeColumnPair(maximum, 'desktop', 0, 2), maximum);
});

test('sequential relative resizes remain valid and preserve unaffected siblings through normalization', () => {
	let current = freezeDeep(template([80, 90, 20, 10]));
	for (let iteration = 0; iteration < 90; iteration += 1) {
		const index = iteration % 3;
		const ratio = 0.1 + ((iteration * 17) % 81) / 100;
		const before = current.variants.desktop.columnWeights;
		const next = resizeColumnPair(current, 'desktop', index, ratio);
		const after = next.variants.desktop.columnWeights;
		close(after[index] / (after[index] + after[index + 1]), ratio);
		const siblings = before
			.map((_, column) => column)
			.filter((column) => column !== index && column !== index + 1);
		close(after[siblings[0]] / after[siblings[1]], before[siblings[0]] / before[siblings[1]]);
		close(
			(after[index] + after[index + 1]) / after[siblings[0]],
			(before[index] + before[index + 1]) / before[siblings[0]]
		);
		assert.deepEqual(validateTemplateDefinition(next), []);
		assert.equal(next.variants.desktop.areas, current.variants.desktop.areas);
		assert.equal(next.variants.phone, current.variants.phone);
		current = freezeDeep(next);
	}
});
