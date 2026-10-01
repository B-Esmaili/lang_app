import type {
	LayoutGap,
	LayoutPreviewMode,
	TemplateDefinition,
	TemplateLayout,
	TemplateSlotDefinition
} from '../lesson-editor/model/types';

export type LayoutPresetId =
	| 'stack'
	| 'split'
	| 'sidebar'
	| 'hero'
	| 'focus'
	| 'magazine'
	| 'rail'
	| 'timeline'
	| 'three'
	| 'asymmetric';
export type DropPlacement = 'before' | 'after';

type LayoutPreset = {
	id: LayoutPresetId;
	label: string;
	description: string;
	columnWeights: readonly number[];
	/** Some compositions need enough regions to show their intended rhythm. */
	minimumRegions?: number;
	/** Optional area arrangement for patterns that mix full-width and flowing rows. */
	buildAreas?: (order: string[], columns: number) => string[][];
};

export const MAX_TEMPLATE_REGIONS = 12;
export const LAYOUT_PRESETS: ReadonlyArray<LayoutPreset> = [
	{ id: 'stack', label: 'Stack', description: 'One calm reading flow', columnWeights: [1] },
	{ id: 'split', label: 'Split', description: 'Two balanced columns', columnWeights: [1, 1] },
	{
		id: 'sidebar',
		label: 'Sidebar',
		description: 'Main content with a companion',
		columnWeights: [2, 1]
	},
	{
		id: 'hero',
		label: 'Lead + grid',
		description: 'A full-width lead with supporting content',
		columnWeights: [2, 1],
		buildAreas: (order, columns) => fullRowsThenFlow(order, columns, 1)
	},
	{
		id: 'focus',
		label: 'Focus',
		description: 'Two full-width teaching moments before the flow',
		columnWeights: [1, 1],
		minimumRegions: 3,
		buildAreas: (order, columns) => fullRowsThenFlow(order, columns, 2)
	},
	{
		id: 'magazine',
		label: 'Magazine',
		description: 'A lead story followed by an even rhythm',
		columnWeights: [1, 1],
		buildAreas: (order, columns) => fullRowsThenFlow(order, columns, 1)
	},
	{
		id: 'rail',
		label: 'Center rail',
		description: 'A broad center with two quiet side rails',
		columnWeights: [1, 2, 1]
	},
	{
		id: 'timeline',
		label: 'Timeline',
		description: 'A narrow marker column beside the main content',
		columnWeights: [1, 3]
	},
	{
		id: 'three',
		label: 'Three columns',
		description: 'Three equal learning spaces',
		columnWeights: [1, 1, 1]
	},
	{
		id: 'asymmetric',
		label: 'Wide / medium / narrow',
		description: 'Three columns with a strong leading measure',
		columnWeights: [3, 2, 1]
	}
];

export const LAYOUT_GAP_OPTIONS: ReadonlyArray<{ id: LayoutGap; label: string; value: string }> = [
	{ id: 'none', label: 'None', value: '0' },
	{ id: 'xs', label: 'Extra small', value: '.35rem' },
	{ id: 'sm', label: 'Small', value: '.65rem' },
	{ id: 'md', label: 'Medium', value: '1rem' },
	{ id: 'lg', label: 'Large', value: '1.5rem' },
	{ id: 'xl', label: 'Extra large', value: '2rem' }
];

const MODES = ['desktop', 'tablet', 'phone'] as const;

/** Variant reading order also controls the list and keyboard movement in the designer. */
export function getOrderedSlots(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode
): TemplateSlotDefinition[] {
	const slots = new Map(definition.slots.map((slot) => [slot.id, slot]));
	const result: TemplateSlotDefinition[] = [];
	for (const id of definition.variants[mode]?.order ?? []) {
		const slot = slots.get(id);
		if (slot) {
			result.push(slot);
			slots.delete(id);
		}
	}
	return [...result, ...slots.values()];
}

/** Move content between existing positions, keeping every column ratio and rectangular span. */
export function reorderRegion(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	sourceId: string,
	targetId: string,
	placement: DropPlacement
): TemplateDefinition {
	const layout = definition.variants[mode];
	if (!layout || sourceId === targetId || !isPlacement(placement)) return definition;
	const previousOrder = getOrderedSlots(definition, mode).map((slot) => slot.id);
	if (!previousOrder.includes(sourceId) || !previousOrder.includes(targetId)) return definition;
	const order = previousOrder.filter((id) => id !== sourceId);
	order.splice(order.indexOf(targetId) + (placement === 'after' ? 1 : 0), 0, sourceId);
	// Imported templates may have reading order that differs from their visible positions.
	// Assign the requested reading sequence to spatial positions so the drop moves content
	// where the document indicates, while preserving the geometry of each rectangular position.
	const spatialOrder = [...new Set(layout.areas.flat())].filter((id) => previousOrder.includes(id));
	const assignments = new Map(spatialOrder.map((id, index) => [id, order[index]]));
	return withLayout(definition, mode, {
		...layout,
		order,
		areas: layout.areas.map((row) => row.map((id) => assignments.get(id) ?? id))
	});
}

/** New regions exist on every device; only the drop target's variant is reordered. */
export function insertRegion(
	definition: TemplateDefinition,
	slot: TemplateSlotDefinition,
	mode: LayoutPreviewMode,
	targetId?: string,
	placement: DropPlacement = 'after'
): TemplateDefinition {
	if (
		definition.slots.length >= MAX_TEMPLATE_REGIONS ||
		!slot.id.trim() ||
		slot.id.length > 80 ||
		!slot.label.trim() ||
		slot.label.length > 100 ||
		definition.slots.some((existing) => existing.id === slot.id) ||
		!definition.variants[mode] ||
		!isPlacement(placement) ||
		(targetId !== undefined && !definition.slots.some((existing) => existing.id === targetId)) ||
		MODES.some((viewport) => definition.variants[viewport].areas.length >= 24)
	)
		return definition;

	const variants = { ...definition.variants };
	for (const viewport of MODES) {
		const layout = variants[viewport];
		variants[viewport] = {
			...layout,
			areas: [...layout.areas, layout.columnWeights.map(() => slot.id)],
			order: [...getOrderedSlots(definition, viewport).map((existing) => existing.id), slot.id]
		};
	}
	const inserted = { ...definition, slots: [...definition.slots, structuredClone(slot)], variants };
	return targetId === undefined
		? inserted
		: reorderRegion(inserted, mode, slot.id, targetId, placement);
}

/**
 * Insert a region and keep the responsive patterns that can safely be reflowed.
 *
 * `insertRegion` remains the low-level operation used by imports and callers that
 * need to preserve arbitrary authored spans. The editor uses this variant so a
 * normal grid (including lead/full-width patterns) grows into its next row instead
 * of leaving the new region detached below the existing composition.
 */
export function insertRegionAndReflow(
	definition: TemplateDefinition,
	slot: TemplateSlotDefinition,
	mode: LayoutPreviewMode,
	targetId?: string,
	placement: DropPlacement = 'after'
): TemplateDefinition {
	const plans = Object.fromEntries(
		MODES.map((viewport) => [viewport, reflowPlan(definition, viewport)])
	) as Record<LayoutPreviewMode, ((order: string[]) => string[][]) | null>;
	const inserted = insertRegion(definition, slot, mode, targetId, placement);
	if (inserted === definition) return definition;

	let result = inserted;
	for (const viewport of MODES) {
		const plan = plans[viewport];
		if (!plan) continue;
		const layout = result.variants[viewport];
		const order = getOrderedSlots(result, viewport).map((item) => item.id);
		result = withLayout(result, viewport, {
			...layout,
			areas: plan(order),
			order
		});
	}
	return result;
}

export function removeRegion(definition: TemplateDefinition, slotId: string): TemplateDefinition {
	if (definition.slots.length <= 1 || !definition.slots.some((slot) => slot.id === slotId))
		return definition;
	const variants = { ...definition.variants };
	for (const mode of MODES) {
		const layout = variants[mode];
		const order = getOrderedSlots(definition, mode)
			.map((slot) => slot.id)
			.filter((id) => id !== slotId);
		variants[mode] = { ...layout, order, areas: compactRemovedArea(layout, slotId, order) };
	}
	return { ...definition, slots: definition.slots.filter((slot) => slot.id !== slotId), variants };
}

export function applyLayoutPreset(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	preset: LayoutPresetId
): TemplateDefinition {
	const layout = definition.variants[mode];
	const selected = LAYOUT_PRESETS.find((option) => option.id === preset);
	if (!layout || !selected || definition.slots.length === 0) return definition;
	const order = getOrderedSlots(definition, mode).map((slot) => slot.id);
	const columnWeights = [...selected.columnWeights].slice(0, order.length);
	return withLayout(definition, mode, {
		...layout,
		columnWeights,
		areas:
			selected.buildAreas?.(order, columnWeights.length) ?? flowAreas(order, columnWeights.length),
		order,
		gap: layout.gap
	});
}

export function setColumnWeight(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	index: number,
	value: number
): TemplateDefinition {
	const layout = definition.variants[mode];
	if (
		!layout ||
		!Number.isInteger(index) ||
		index < 0 ||
		index >= layout.columnWeights.length ||
		!Number.isFinite(value) ||
		value <= 0 ||
		value > 100 ||
		layout.columnWeights[index] === value
	)
		return definition;
	return withLayout(definition, mode, {
		...layout,
		columnWeights: layout.columnWeights.map((weight, column) => (column === index ? value : weight))
	});
}

export function setLayoutGap(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	gap: LayoutGap
): TemplateDefinition {
	const layout = definition.variants[mode];
	if (!layout || layout.gap === gap || !LAYOUT_GAP_OPTIONS.some((option) => option.id === gap))
		return definition;
	return withLayout(definition, mode, { ...layout, gap });
}

export function setLayoutPadding(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	padding: LayoutGap
): TemplateDefinition {
	const layout = definition.variants[mode];
	if (
		!layout ||
		(layout.padding ?? 'none') === padding ||
		!LAYOUT_GAP_OPTIONS.some((option) => option.id === padding)
	)
		return definition;
	return withLayout(definition, mode, { ...layout, padding });
}

/** Full width is a geometric property; every region is full width in a one-column layout. */
export function isRegionFullWidth(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	slotId: string
): boolean {
	const layout = definition.variants[mode];
	if (!layout || !definition.slots.some((slot) => slot.id === slotId)) return false;
	const bounds = boundsFor(layout.areas, slotId);
	return bounds !== null && bounds.left === 0 && bounds.right === layout.columnWeights.length - 1;
}

/** Reflow the selected variant without copying content or changing its relative column sizes. */
export function setRegionFullWidth(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	slotId: string,
	full: boolean
): TemplateDefinition {
	const layout = definition.variants[mode];
	if (
		!layout ||
		layout.columnWeights.length <= 1 ||
		typeof full !== 'boolean' ||
		!definition.slots.some((slot) => slot.id === slotId) ||
		isRegionFullWidth(definition, mode, slotId) === full
	)
		return definition;
	const order = getOrderedSlots(definition, mode).map((slot) => slot.id);
	if (order.length < 2) return definition;
	const fullRows = new Set(order.filter((id) => isRegionFullWidth(definition, mode, id)));
	if (full) {
		fullRows.add(slotId);
		// A trailing single region may only have filled a row because the earlier
		// row was full. Let it join a newly displaced neighbor after this expansion.
		for (let index = 0; index < order.length; index += 1) {
			if (fullRows.has(order[index])) continue;
			const previous = order[index - 1];
			const next = order[index + 1];
			if ((!previous || fullRows.has(previous)) && (!next || fullRows.has(next))) {
				const neighbor =
					next && next !== slotId ? next : previous !== slotId ? previous : undefined;
				if (neighbor) fullRows.delete(neighbor);
			}
		}
	} else {
		fullRows.delete(slotId);
		const index = order.indexOf(slotId);
		const previous = order[index - 1];
		const next = order[index + 1];
		// A region needs a neighbor to share a row. Release the adjacent full row only
		// when both sides are boundaries, retaining all other full-width regions.
		if ((!previous || fullRows.has(previous)) && (!next || fullRows.has(next)))
			fullRows.delete(next ?? previous);
	}
	return withLayout(definition, mode, {
		...layout,
		areas: flowWithFullRows(order, layout.columnWeights.length, fullRows, full ? undefined : slotId)
	});
}

export function createBlankTemplate(id: string): TemplateDefinition {
	const layout = (gap: LayoutGap): TemplateLayout => ({
		columnWeights: [1],
		areas: [['content']],
		order: ['content'],
		gap
	});
	return {
		id: id.trim() || 'template.draft',
		name: 'Untitled layout',
		description: 'A reusable responsive lesson frame.',
		slots: [{ id: 'content', label: 'Content', description: 'Primary learning content' }],
		variants: { desktop: layout('lg'), tablet: layout('md'), phone: layout('sm') }
	};
}

function withLayout(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode,
	layout: TemplateLayout
): TemplateDefinition {
	const previous = definition.variants[mode];
	if (
		previous.gap === layout.gap &&
		(previous.padding ?? 'none') === (layout.padding ?? 'none') &&
		sameArray(previous.columnWeights, layout.columnWeights) &&
		sameArray(previous.order, layout.order) &&
		previous.areas.length === layout.areas.length &&
		previous.areas.every((row, index) => sameArray(row, layout.areas[index]))
	)
		return definition;
	return { ...definition, variants: { ...definition.variants, [mode]: layout } };
}

function sameArray<T>(left: readonly T[], right: readonly T[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameAreas(
	left: readonly (readonly string[])[],
	right: readonly (readonly string[])[]
): boolean {
	return (
		left.length === right.length && left.every((row, index) => sameArray(row, right[index] ?? []))
	);
}

/** Return a reflow function only for layouts generated by a known flow pattern. */
function reflowPlan(
	definition: TemplateDefinition,
	mode: LayoutPreviewMode
): ((order: string[]) => string[][]) | null {
	const layout = definition.variants[mode];
	if (!layout || layout.columnWeights.length <= 1) return null;
	const order = getOrderedSlots(definition, mode).map((item) => item.id);
	const columns = layout.columnWeights.length;
	if (sameAreas(layout.areas, flowAreas(order, columns)))
		return (nextOrder) => flowAreas(nextOrder, columns);

	// Preserve the leading full-width rows used by hero, focus, and magazine.
	for (let count = 1; count <= order.length; count += 1) {
		if (sameAreas(layout.areas, fullRowsThenFlow(order, columns, count)))
			return (nextOrder) => fullRowsThenFlow(nextOrder, columns, count);
	}

	// Also recognize authored full rows when they can be represented without spans.
	const fullRows = new Set(order.filter((id) => isRegionFullWidth(definition, mode, id)));
	if (fullRows.size > 0 && sameAreas(layout.areas, flowWithFullRows(order, columns, fullRows)))
		return (nextOrder) => flowWithFullRows(nextOrder, columns, fullRows);
	return null;
}

function isPlacement(value: string): value is DropPlacement {
	return value === 'before' || value === 'after';
}

function flowAreas(order: string[], columns: number): string[][] {
	const areas: string[][] = [];
	for (let index = 0; index < order.length; index += columns) {
		const row = order.slice(index, index + columns);
		while (row.length < columns) row.push(row[row.length - 1]);
		areas.push(row);
	}
	return areas;
}

function fullRowsThenFlow(order: string[], columns: number, fullRowCount: number): string[][] {
	const leading = order.slice(0, Math.min(fullRowCount, order.length));
	const remainder = order.slice(leading.length);
	return [
		...leading.map((id) => Array.from({ length: columns }, () => id)),
		...flowAreas(remainder, columns)
	];
}

function flowWithFullRows(
	order: string[],
	columns: number,
	fullRows: ReadonlySet<string>,
	sharedSlotId?: string
): string[][] {
	const areas: string[][] = [];
	let pending: string[] = [];
	const flush = () => {
		if (pending.length === 0) return;
		const rowCount = Math.ceil(pending.length / columns);
		const perRow = Math.floor(pending.length / rowCount);
		const largerRows = pending.length % rowCount;
		const rowSizes = Array.from(
			{ length: rowCount },
			(_, index) => perRow + (index < largerRows ? 1 : 0)
		);
		// An odd two-column run needs one full row. Put that row first when the
		// selected last region was explicitly requested to share a row.
		if (pending.length > 1 && pending.at(-1) === sharedSlotId && rowSizes.at(-1) === 1)
			rowSizes.unshift(rowSizes.pop()!);
		let offset = 0;
		for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
			const count = rowSizes[rowIndex];
			const row = pending.slice(offset, offset + count);
			while (row.length < columns) row.push(row[row.length - 1]);
			areas.push(row);
			offset += count;
		}
		pending = [];
	};
	for (const id of order) {
		if (fullRows.has(id)) {
			flush();
			areas.push(Array.from({ length: columns }, () => id));
		} else pending.push(id);
	}
	flush();
	return areas;
}

type Bounds = { top: number; bottom: number; left: number; right: number };

function boundsFor(areas: Array<Array<string | null>>, id: string): Bounds | null {
	let bounds: Bounds | null = null;
	areas.forEach((row, y) =>
		row.forEach((cell, x) => {
			if (cell !== id) return;
			if (!bounds) bounds = { top: y, bottom: y, left: x, right: x };
			else {
				bounds.top = Math.min(bounds.top, y);
				bounds.bottom = Math.max(bounds.bottom, y);
				bounds.left = Math.min(bounds.left, x);
				bounds.right = Math.max(bounds.right, x);
			}
		})
	);
	return bounds;
}

/** Expand only a whole edge of a neighboring rectangle, so no operation creates L-shaped areas. */
function compactRemovedArea(
	layout: TemplateLayout,
	removedId: string,
	order: string[]
): string[][] {
	const areas = layout.areas
		.map((row) => row.map((id) => (id === removedId ? null : id)))
		.filter((row) => row.some((id) => id !== null));
	let changed = true;
	while (changed && areas.some((row) => row.includes(null))) {
		changed = false;
		for (const id of order) {
			const bounds = boundsFor(areas, id);
			if (!bounds) continue;
			const { top, bottom, left, right } = bounds;
			const edges: Bounds[] = [
				{ top, bottom, left: left - 1, right: left - 1 },
				{ top, bottom, left: right + 1, right: right + 1 },
				{ top: top - 1, bottom: top - 1, left, right },
				{ top: bottom + 1, bottom: bottom + 1, left, right }
			];
			for (const edge of edges) {
				if (
					edge.top < 0 ||
					edge.bottom >= areas.length ||
					edge.left < 0 ||
					edge.right >= layout.columnWeights.length
				)
					continue;
				let empty = true;
				for (let y = edge.top; y <= edge.bottom; y += 1)
					for (let x = edge.left; x <= edge.right; x += 1) if (areas[y][x] !== null) empty = false;
				if (!empty) continue;
				for (let y = edge.top; y <= edge.bottom; y += 1)
					for (let x = edge.left; x <= edge.right; x += 1) areas[y][x] = id;
				changed = true;
				// Recalculate the rectangle before extending a second edge.
				break;
			}
		}
	}
	// Interlocking custom rectangles may have no expandable whole edge. Keep their column
	// ratios and reading order while producing a valid flow instead of leaving an invalid hole.
	return areas.some((row) => row.includes(null))
		? flowAreas(order, layout.columnWeights.length)
		: (areas as string[][]);
}
