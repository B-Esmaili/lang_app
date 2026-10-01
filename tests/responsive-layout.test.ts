import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	modeForWidth,
	relativeGridColumns,
	relativeGridSpace,
	responsiveSlots
} from '../src/lib/features/lesson-editor/layout/responsive-layout';
import type { TemplateDefinition } from '../src/lib/features/lesson-editor/model/types';

const template: TemplateDefinition = {
	id: 'test',
	name: 'Test',
	slots: [
		{ id: 'reading content', label: 'Reading' },
		{ id: 'پاسخ', label: 'Response' },
		{ id: 'unplaced', label: 'Notes' }
	],
	variants: {
		desktop: {
			columnWeights: [2, 1, 3],
			areas: [
				['reading content', 'reading content', 'پاسخ'],
				['reading content', 'reading content', 'پاسخ']
			],
			order: ['پاسخ', 'reading content'],
			gap: 'md',
			padding: 'lg'
		},
		tablet: {
			columnWeights: [1, 1],
			areas: [['reading content', 'پاسخ']],
			order: ['reading content', 'پاسخ', 'unplaced'],
			gap: 'sm'
		},
		phone: {
			columnWeights: [1],
			areas: [['reading content'], ['پاسخ'], ['unplaced']],
			order: ['reading content', 'پاسخ', 'unplaced'],
			gap: 'xs'
		}
	}
};

test('responsive modes use root-relative breakpoints', () => {
	assert.equal(modeForWidth(64 * 20, 20), 'desktop');
	assert.equal(modeForWidth(63.99 * 20, 20), 'tablet');
	assert.equal(modeForWidth(39.99 * 20, 20), 'phone');
	assert.equal(modeForWidth(40 * 20, 20), 'tablet');
});

test('CSS Grid columns retain persisted fractional proportions', () => {
	assert.equal(
		relativeGridColumns(template.variants.desktop),
		'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 3fr)'
	);
	assert.equal(
		relativeGridColumns({ ...template.variants.phone, columnWeights: [] }),
		'minmax(0, 1fr)'
	);
});

test('spacing tokens remain relative until browser layout', () => {
	assert.equal(relativeGridSpace('none'), 'calc(0rem * var(--layout-space-scale, 1))');
	assert.equal(relativeGridSpace('lg'), 'calc(1.5rem * var(--layout-space-scale, 1))');
});

test('regions retain saved reading order, rectangular spans, and safe arbitrary IDs', () => {
	const slots = responsiveSlots(template, 'desktop');
	assert.deepEqual(
		slots.map(({ slot }) => slot.id),
		['پاسخ', 'reading content', 'unplaced']
	);
	assert.deepEqual(slots[0].placement, {
		rowStart: 1,
		rowEnd: 3,
		columnStart: 3,
		columnEnd: 4
	});
	assert.deepEqual(slots[1].placement, {
		rowStart: 1,
		rowEnd: 3,
		columnStart: 1,
		columnEnd: 3
	});
	assert.deepEqual(slots[2].placement, {
		rowStart: 3,
		rowEnd: 4,
		columnStart: 1,
		columnEnd: 4
	});
});
