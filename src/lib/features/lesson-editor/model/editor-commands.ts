import type {
	AnyWidgetContent,
	EntityId,
	FrameAppearance,
	FrameInstance,
	LayoutPreviewMode,
	LessonDocument,
	SlotId,
	TemplateLayout,
	TemplateDefinition,
	TemplateSlotDefinition,
	WidgetInstance
} from './types';
import { createDefaultFrameAppearance } from './types';

export type InsertFrameCommand = {
	type: 'insert-frame';
	frame: FrameInstance;
	index?: number;
};

export type RemoveFrameCommand = {
	type: 'remove-frame';
	frameId: EntityId;
};

export type InsertWidgetCommand = {
	type: 'insert-widget';
	frameId: EntityId;
	slotId: SlotId;
	widget: WidgetInstance;
	index?: number;
};

export type RemoveWidgetCommand = {
	type: 'remove-widget';
	widgetId: EntityId;
};

export type MoveWidgetCommand = {
	type: 'move-widget';
	widgetId: EntityId;
	targetFrameId: EntityId;
	targetSlotId: SlotId;
	/** Final insertion index in the destination after removing the source. */
	toIndex: number;
};

export type UpdateWidgetContentCommand = {
	type: 'update-widget-content';
	frameId: EntityId;
	widgetId: EntityId;
	content: AnyWidgetContent;
};

export type UpdateFrameAppearanceCommand = {
	type: 'update-frame-appearance';
	frameId: EntityId;
	appearance: Partial<FrameAppearance>;
};

export type ApplyTemplateCommand = {
	type: 'apply-template';
	frameId: EntityId;
	template: TemplateDefinition;
	/** Maps an existing slot ID to a slot ID in the new template. */
	slotMapping?: Record<SlotId, SlotId>;
};

export type MoveFrameCommand = {
	type: 'move-frame';
	frameId: EntityId;
	toIndex: number;
};

export type LessonDocumentSettings = Pick<
	LessonDocument,
	'title' | 'description' | 'language' | 'direction'
>;

export type UpdateDocumentSettingsCommand = {
	type: 'update-document-settings';
	settings: Partial<LessonDocumentSettings>;
};

export type EditorCommand =
	| InsertFrameCommand
	| RemoveFrameCommand
	| InsertWidgetCommand
	| RemoveWidgetCommand
	| MoveWidgetCommand
	| UpdateWidgetContentCommand
	| UpdateFrameAppearanceCommand
	| ApplyTemplateCommand
	| MoveFrameCommand
	| UpdateDocumentSettingsCommand;

export class EditorCommandError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'EditorCommandError';
	}
}

export type WidgetLocation = {
	frameIndex: number;
	slotId: SlotId;
	widgetIndex: number;
	widget: WidgetInstance;
};

export function applyEditorCommand(
	document: LessonDocument,
	command: EditorCommand
): LessonDocument {
	switch (command.type) {
		case 'insert-frame':
			return insertFrame(document, command.frame, command.index);
		case 'remove-frame':
			return removeFrame(document, command.frameId);
		case 'insert-widget':
			return insertWidget(document, command.frameId, command.slotId, command.widget, command.index);
		case 'remove-widget':
			return removeWidget(document, command.widgetId);
		case 'move-widget':
			return moveWidget(
				document,
				command.widgetId,
				command.targetFrameId,
				command.targetSlotId,
				command.toIndex
			);
		case 'update-widget-content':
			return updateWidgetContent(document, command.frameId, command.widgetId, command.content);
		case 'update-frame-appearance':
			return updateFrameAppearance(document, command.frameId, command.appearance);
		case 'apply-template':
			return applyTemplate(document, command.frameId, command.template, command.slotMapping);
		case 'move-frame':
			return moveFrame(document, command.frameId, command.toIndex);
		case 'update-document-settings':
			return updateDocumentSettings(document, command.settings);
		default:
			return assertNever(command);
	}
}

export function createEmptySlots(template: TemplateDefinition): Record<SlotId, WidgetInstance[]> {
	assertValidTemplateDefinition(template);
	return Object.fromEntries(template.slots.map((slot) => [slot.id, []]));
}

export function createFrameFromTemplate(
	id: EntityId,
	template: TemplateDefinition,
	options: { title?: string; appearance?: Partial<FrameAppearance> } = {}
): FrameInstance {
	return {
		id,
		templateId: template.id,
		...(options.title === undefined ? {} : { title: options.title }),
		slots: createEmptySlots(template),
		appearance: { ...createDefaultFrameAppearance(), ...options.appearance }
	};
}

export function findFrameIndex(document: LessonDocument, frameId: EntityId): number {
	return document.frames.findIndex((frame) => frame.id === frameId);
}

export function findWidgetLocation(
	document: LessonDocument,
	widgetId: EntityId
): WidgetLocation | undefined {
	for (const [frameIndex, frame] of document.frames.entries()) {
		for (const [slotId, widgets] of Object.entries(frame.slots)) {
			const widgetIndex = widgets.findIndex((widget) => widget.id === widgetId);
			if (widgetIndex !== -1) {
				return { frameIndex, slotId, widgetIndex, widget: widgets[widgetIndex] };
			}
		}
	}

	return undefined;
}

export function insertFrame(
	document: LessonDocument,
	frame: FrameInstance,
	index: number = document.frames.length
): LessonDocument {
	if (document.frames.some((candidate) => candidate.id === frame.id)) {
		throw new EditorCommandError(`A frame with ID "${frame.id}" already exists.`);
	}

	for (const widgets of Object.values(frame.slots)) {
		for (const widget of widgets) assertUniqueWidgetId(document, widget.id);
	}

	const insertionIndex = clampInsertionIndex(index, document.frames.length);
	return {
		...document,
		frames: [
			...document.frames.slice(0, insertionIndex),
			frame,
			...document.frames.slice(insertionIndex)
		]
	};
}

export function removeFrame(document: LessonDocument, frameId: EntityId): LessonDocument {
	const frameIndex = requireFrameIndex(document, frameId);
	return {
		...document,
		frames: [...document.frames.slice(0, frameIndex), ...document.frames.slice(frameIndex + 1)]
	};
}

export function insertWidget(
	document: LessonDocument,
	frameId: EntityId,
	slotId: SlotId,
	widget: WidgetInstance,
	index?: number
): LessonDocument {
	assertUniqueWidgetId(document, widget.id);
	const frameIndex = requireFrameIndex(document, frameId);
	const frame = document.frames[frameIndex];
	const widgets = frame.slots[slotId];
	if (!widgets) throw new EditorCommandError(`Frame "${frameId}" has no slot "${slotId}".`);

	const insertionIndex = clampInsertionIndex(index ?? widgets.length, widgets.length);
	const nextWidgets = [
		...widgets.slice(0, insertionIndex),
		widget,
		...widgets.slice(insertionIndex)
	];
	const nextFrame: FrameInstance = {
		...frame,
		slots: { ...frame.slots, [slotId]: nextWidgets }
	};

	return replaceFrame(document, frameIndex, nextFrame);
}

export function removeWidget(document: LessonDocument, widgetId: EntityId): LessonDocument {
	const location = requireWidgetLocation(document, widgetId);
	const frame = document.frames[location.frameIndex];
	const widgets = frame.slots[location.slotId];
	return replaceFrame(document, location.frameIndex, {
		...frame,
		slots: {
			...frame.slots,
			[location.slotId]: [
				...widgets.slice(0, location.widgetIndex),
				...widgets.slice(location.widgetIndex + 1)
			]
		}
	});
}

/** Move the original widget object, preserving authored content and identifiers. */
export function moveWidget(
	document: LessonDocument,
	widgetId: EntityId,
	targetFrameId: EntityId,
	targetSlotId: SlotId,
	toIndex: number
): LessonDocument {
	const source = requireWidgetLocation(document, widgetId);
	const targetFrameIndex = requireFrameIndex(document, targetFrameId);
	const sourceFrame = document.frames[source.frameIndex];
	const targetFrame = document.frames[targetFrameIndex];
	const targetWidgets = targetFrame.slots[targetSlotId];
	if (!Array.isArray(targetWidgets)) {
		throw new EditorCommandError(`Frame "${targetFrameId}" has no slot "${targetSlotId}".`);
	}
	const sourceWidgets = sourceFrame.slots[source.slotId];
	const sameFrame = source.frameIndex === targetFrameIndex;
	const sameSlot = sameFrame && source.slotId === targetSlotId;
	const index = clampInsertionIndex(toIndex, targetWidgets.length - (sameSlot ? 1 : 0));
	if (sameSlot && index === source.widgetIndex) return document;

	const remaining = [
		...sourceWidgets.slice(0, source.widgetIndex),
		...sourceWidgets.slice(source.widgetIndex + 1)
	];
	const destination = sameSlot ? remaining : targetWidgets;
	const inserted = [...destination.slice(0, index), source.widget, ...destination.slice(index)];
	if (sameFrame) {
		return replaceFrame(document, source.frameIndex, {
			...sourceFrame,
			slots: { ...sourceFrame.slots, [source.slotId]: remaining, [targetSlotId]: inserted }
		});
	}
	const frames = [...document.frames];
	frames[source.frameIndex] = {
		...sourceFrame,
		slots: { ...sourceFrame.slots, [source.slotId]: remaining }
	};
	frames[targetFrameIndex] = {
		...targetFrame,
		slots: { ...targetFrame.slots, [targetSlotId]: inserted }
	};
	return { ...document, frames };
}

/**
 * Explicit placement never chooses another region or falls back to a different
 * template. The state and drag preview share this exact compatibility check.
 */
export function canPlaceWidget(
	document: LessonDocument,
	templates: readonly TemplateDefinition[],
	type: string,
	frameId: EntityId,
	slotId: SlotId
): boolean {
	const frame = document.frames.find((candidate) => candidate.id === frameId);
	if (!frame || !Object.hasOwn(frame.slots, slotId) || !Array.isArray(frame.slots[slotId]))
		return false;
	const template = templates.find((candidate) => candidate.id === frame.templateId);
	const slot = template?.slots.find((candidate) => candidate.id === slotId);
	return Boolean(
		slot && (slot.accepts === undefined || slot.accepts.some((accepted) => accepted === type))
	);
}

export function updateWidgetContent(
	document: LessonDocument,
	frameId: EntityId,
	widgetId: EntityId,
	content: AnyWidgetContent
): LessonDocument {
	const frameIndex = requireFrameIndex(document, frameId);
	const frame = document.frames[frameIndex];
	let found = false;
	const nextSlots = Object.fromEntries(
		Object.entries(frame.slots).map(([slotId, widgets]) => [
			slotId,
			widgets.map((widget): WidgetInstance => {
				if (widget.id !== widgetId) return widget;
				found = true;
				if (widget.type !== content.type) {
					throw new EditorCommandError(
						`Widget "${widgetId}" is "${widget.type}" and cannot receive "${content.type}" content.`
					);
				}

				return { id: widget.id, type: content.type, content } as WidgetInstance;
			})
		])
	);

	if (!found) throw new EditorCommandError(`Frame "${frameId}" has no widget "${widgetId}".`);
	return replaceFrame(document, frameIndex, { ...frame, slots: nextSlots });
}

export function updateFrameAppearance(
	document: LessonDocument,
	frameId: EntityId,
	appearance: Partial<FrameAppearance>
): LessonDocument {
	const frameIndex = requireFrameIndex(document, frameId);
	const frame = document.frames[frameIndex];
	return replaceFrame(document, frameIndex, {
		...frame,
		appearance: { ...frame.appearance, ...appearance }
	});
}

export function applyTemplate(
	document: LessonDocument,
	frameId: EntityId,
	template: TemplateDefinition,
	slotMapping: Record<SlotId, SlotId> = {}
): LessonDocument {
	assertValidTemplateDefinition(template);
	const frameIndex = requireFrameIndex(document, frameId);
	const frame = document.frames[frameIndex];
	const nextSlots = createEmptySlots(template);

	for (const [sourceSlotId, widgets] of Object.entries(frame.slots)) {
		for (const widget of widgets) {
			const targetSlot = resolveTargetSlot(template, sourceSlotId, widget, slotMapping);
			nextSlots[targetSlot.id] = [...nextSlots[targetSlot.id], widget];
		}
	}

	return replaceFrame(document, frameIndex, {
		...frame,
		templateId: template.id,
		slots: nextSlots
	});
}

export function moveFrame(
	document: LessonDocument,
	frameId: EntityId,
	toIndex: number
): LessonDocument {
	const fromIndex = requireFrameIndex(document, frameId);
	const targetIndex = clampMoveIndex(toIndex, document.frames.length);
	if (fromIndex === targetIndex) return document;

	const framesWithoutMoved = [
		...document.frames.slice(0, fromIndex),
		...document.frames.slice(fromIndex + 1)
	];
	return {
		...document,
		frames: [
			...framesWithoutMoved.slice(0, targetIndex),
			document.frames[fromIndex],
			...framesWithoutMoved.slice(targetIndex)
		]
	};
}

export function updateDocumentSettings(
	document: LessonDocument,
	settings: Partial<LessonDocumentSettings>
): LessonDocument {
	return { ...document, ...settings };
}

function resolveTargetSlot(
	template: TemplateDefinition,
	sourceSlotId: SlotId,
	widget: WidgetInstance,
	slotMapping: Record<SlotId, SlotId>
): TemplateSlotDefinition {
	const mappedSlotId = slotMapping[sourceSlotId];
	if (mappedSlotId !== undefined) {
		const mappedSlot = template.slots.find((slot) => slot.id === mappedSlotId);
		if (!mappedSlot) {
			throw new EditorCommandError(
				`Template "${template.id}" has no mapped target slot "${mappedSlotId}".`
			);
		}
		if (!slotAcceptsWidget(mappedSlot, widget)) {
			throw new EditorCommandError(
				`Slot "${mappedSlotId}" does not accept widget type "${widget.type}".`
			);
		}
		return mappedSlot;
	}

	const matchingSlot = template.slots.find(
		(slot) => slot.id === sourceSlotId && slotAcceptsWidget(slot, widget)
	);
	if (matchingSlot) return matchingSlot;

	const compatibleSlot = template.slots.find((slot) => slotAcceptsWidget(slot, widget));
	if (compatibleSlot) return compatibleSlot;

	throw new EditorCommandError(
		`Template "${template.id}" has no slot that accepts widget type "${widget.type}".`
	);
}

function slotAcceptsWidget(slot: TemplateSlotDefinition, widget: WidgetInstance): boolean {
	return slot.accepts === undefined || slot.accepts.includes(widget.type);
}

function replaceFrame(
	document: LessonDocument,
	frameIndex: number,
	frame: FrameInstance
): LessonDocument {
	const frames = [...document.frames];
	frames[frameIndex] = frame;
	return { ...document, frames };
}

function requireFrameIndex(document: LessonDocument, frameId: EntityId): number {
	const index = findFrameIndex(document, frameId);
	if (index === -1) throw new EditorCommandError(`No frame exists with ID "${frameId}".`);
	return index;
}

function requireWidgetLocation(document: LessonDocument, widgetId: EntityId): WidgetLocation {
	const location = findWidgetLocation(document, widgetId);
	if (!location) throw new EditorCommandError(`No widget exists with ID "${widgetId}".`);
	return location;
}

function assertUniqueWidgetId(document: LessonDocument, widgetId: EntityId): void {
	if (findWidgetLocation(document, widgetId)) {
		throw new EditorCommandError(`A widget with ID "${widgetId}" already exists.`);
	}
}

export type TemplateValidationIssue = {
	path: string;
	message: string;
};

const LAYOUT_PREVIEW_MODES: LayoutPreviewMode[] = ['phone', 'tablet', 'desktop'];

export function validateTemplateDefinition(
	template: TemplateDefinition
): TemplateValidationIssue[] {
	const issues: TemplateValidationIssue[] = [];
	if (!template.id.trim()) issues.push(issue('id', 'Template ID cannot be empty.'));
	if (!template.name.trim()) issues.push(issue('name', 'Template name cannot be empty.'));
	if (template.slots.length === 0) {
		issues.push(issue('slots', 'A template must define at least one slot.'));
	}

	const slotIds = new Set<SlotId>();
	for (const [slotIndex, slot] of template.slots.entries()) {
		const path = `slots.${slotIndex}`;
		if (!slot.id.trim()) issues.push(issue(`${path}.id`, 'Slot ID cannot be empty.'));
		if (!slot.label.trim()) issues.push(issue(`${path}.label`, 'Slot label cannot be empty.'));
		if (slotIds.has(slot.id)) issues.push(issue(`${path}.id`, `Slot ID "${slot.id}" is repeated.`));
		slotIds.add(slot.id);
	}

	for (const mode of LAYOUT_PREVIEW_MODES) {
		const layout = template.variants?.[mode];
		const path = `variants.${mode}`;
		if (!layout) {
			issues.push(issue(path, `The ${mode} layout is required.`));
			continue;
		}
		validateTemplateLayout(layout, path, slotIds, issues);
	}

	return issues;
}

export function assertValidTemplateDefinition(template: TemplateDefinition): void {
	const issues = validateTemplateDefinition(template);
	if (issues.length === 0) return;
	throw new EditorCommandError(
		`Template "${template.id || '(unnamed)'}" is invalid: ${issues
			.map((validationIssue) => `${validationIssue.path}: ${validationIssue.message}`)
			.join(' ')}`
	);
}

function validateTemplateLayout(
	layout: TemplateLayout,
	path: string,
	slotIds: Set<SlotId>,
	issues: TemplateValidationIssue[]
): void {
	if (layout.columnWeights.length === 0) {
		issues.push(issue(`${path}.columnWeights`, 'At least one column weight is required.'));
	}
	for (const [columnIndex, weight] of layout.columnWeights.entries()) {
		if (!Number.isFinite(weight) || weight <= 0) {
			issues.push(
				issue(`${path}.columnWeights.${columnIndex}`, 'Column weights must be finite and positive.')
			);
		}
	}

	if (layout.areas.length === 0) {
		issues.push(issue(`${path}.areas`, 'At least one layout row is required.'));
	}

	for (const [rowIndex, row] of layout.areas.entries()) {
		if (row.length !== layout.columnWeights.length) {
			issues.push(
				issue(
					`${path}.areas.${rowIndex}`,
					`Rows must contain exactly ${layout.columnWeights.length} area cells.`
				)
			);
		}
		for (const [columnIndex, slotId] of row.entries()) {
			if (!slotIds.has(slotId)) {
				issues.push(
					issue(
						`${path}.areas.${rowIndex}.${columnIndex}`,
						`Area "${slotId}" is not a defined slot.`
					)
				);
			}
		}
	}

	const orderedSlotIds = new Set<SlotId>();
	for (const [orderIndex, slotId] of layout.order.entries()) {
		if (!slotIds.has(slotId)) {
			issues.push(
				issue(`${path}.order.${orderIndex}`, `Order references unknown slot "${slotId}".`)
			);
		}
		if (orderedSlotIds.has(slotId)) {
			issues.push(issue(`${path}.order.${orderIndex}`, `Order repeats slot "${slotId}".`));
		}
		orderedSlotIds.add(slotId);
	}

	for (const slotId of slotIds) {
		if (!orderedSlotIds.has(slotId)) {
			issues.push(issue(`${path}.order`, `Order must include slot "${slotId}".`));
		}
		if (!layout.areas.some((row) => row.includes(slotId))) {
			issues.push(issue(`${path}.areas`, `Areas must include slot "${slotId}".`));
		}
		if (!areaIsRectangular(layout.areas, slotId)) {
			issues.push(issue(`${path}.areas`, `Area "${slotId}" must form one rectangle.`));
		}
	}
}

function areaIsRectangular(areas: SlotId[][], slotId: SlotId): boolean {
	const cells: Array<{ row: number; column: number }> = [];
	for (const [row, areaRow] of areas.entries()) {
		for (const [column, areaSlotId] of areaRow.entries()) {
			if (areaSlotId === slotId) cells.push({ row, column });
		}
	}
	if (cells.length === 0) return true;

	const rows = cells.map((cell) => cell.row);
	const columns = cells.map((cell) => cell.column);
	const minRow = Math.min(...rows);
	const maxRow = Math.max(...rows);
	const minColumn = Math.min(...columns);
	const maxColumn = Math.max(...columns);

	for (let row = minRow; row <= maxRow; row += 1) {
		for (let column = minColumn; column <= maxColumn; column += 1) {
			if (areas[row]?.[column] !== slotId) return false;
		}
	}
	return true;
}

function issue(path: string, message: string): TemplateValidationIssue {
	return { path, message };
}

function clampInsertionIndex(index: number, length: number): number {
	if (!Number.isFinite(index)) return length;
	return Math.min(Math.max(Math.trunc(index), 0), length);
}

function clampMoveIndex(index: number, length: number): number {
	if (length === 0) return 0;
	if (!Number.isFinite(index)) return length - 1;
	return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

function assertNever(value: never): never {
	throw new EditorCommandError(`Unknown editor command: ${JSON.stringify(value)}`);
}
