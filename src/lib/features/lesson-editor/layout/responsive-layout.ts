import type {
	LayoutGap,
	LayoutPreviewMode,
	TemplateDefinition,
	TemplateLayout,
	TemplateSlotDefinition
} from '../model/types';

/** Saved spacing tokens remain relative to the reader's root font size. */
export const LAYOUT_SPACE_REM: Readonly<Record<LayoutGap, number>> = Object.freeze({
	none: 0,
	xs: 0.35,
	sm: 0.65,
	md: 1,
	lg: 1.5,
	xl: 2
});

export type GridPlacement = {
	rowStart: number;
	rowEnd: number;
	columnStart: number;
	columnEnd: number;
};
export type ResponsiveSlot = { slot: TemplateSlotDefinition; placement: GridPlacement };

export function modeForWidth(width: number, rootFontSize = 16): LayoutPreviewMode {
	const rem = Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16;
	return width >= 64 * rem ? 'desktop' : width >= 40 * rem ? 'tablet' : 'phone';
}

export function relativeGridColumns(layout: TemplateLayout): string {
	return (layout.columnWeights.length ? layout.columnWeights : [1])
		.map((weight) => `minmax(0, ${Number.isFinite(weight) && weight > 0 ? weight : 1}fr)`)
		.join(' ');
}

export function relativeGridSpace(gap: LayoutGap | undefined): string {
	return `calc(${LAYOUT_SPACE_REM[gap ?? 'none'] ?? 0}rem * var(--layout-space-scale, 1))`;
}

/**
 * Numeric grid lines support arbitrary persisted slot IDs without interpreting
 * an ID as a CSS token. DOM order follows the saved reading order; CSS performs
 * track sizing, natural text wrapping, content-height measurement and RTL flow.
 */
export function responsiveSlots(
	template: TemplateDefinition,
	mode: LayoutPreviewMode
): ResponsiveSlot[] {
	const layout = template.variants[mode];
	const definitions = new Map(template.slots.map((slot) => [slot.id, slot]));
	const order = [...new Set([...layout.order, ...template.slots.map((slot) => slot.id)])];
	let fallbackRow = layout.areas.length + 1;
	return order.flatMap((id) => {
		const slot = definitions.get(id);
		if (!slot) return [];
		const cells = layout.areas.flatMap((row, rowIndex) =>
			row.flatMap((cell, columnIndex) =>
				cell === id ? [{ row: rowIndex, column: columnIndex }] : []
			)
		);
		const placement: GridPlacement = cells.length
			? {
					rowStart: Math.min(...cells.map((cell) => cell.row)) + 1,
					rowEnd: Math.max(...cells.map((cell) => cell.row)) + 2,
					columnStart: Math.min(...cells.map((cell) => cell.column)) + 1,
					columnEnd: Math.max(...cells.map((cell) => cell.column)) + 2
				}
			: {
					rowStart: fallbackRow,
					rowEnd: ++fallbackRow,
					columnStart: 1,
					columnEnd: Math.max(1, layout.columnWeights.length) + 1
				};
		return [{ slot, placement }];
	});
}
