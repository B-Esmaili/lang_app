import {
	applyEditorCommand,
	canPlaceWidget as canPlaceWidgetInDocument,
	createFrameFromTemplate,
	findWidgetLocation,
	type AnyWidgetContent,
	type EditorCommand,
	type FrameAppearance,
	type LanguageContentMetadata,
	type LessonDocument,
	type PreviewMode,
	type SlotId,
	type TemplateDefinition,
	type TextDirection,
	type WidgetInstance
} from '../model';
import { BLANK_FRAME_TEMPLATE, READ_AND_RESPOND_TEMPLATE, SAMPLE_LESSON_DOCUMENT } from '../model';
import type { AnyWidgetDefinition } from '../registry';

const HISTORY_LIMIT = 50;

export type EditorMode = 'edit' | 'preview';

export type EditorSelection = {
	frameId: string | null;
	slotId: SlotId | null;
	widgetId: string | null;
};

export type TemplateSource = readonly TemplateDefinition[] | (() => readonly TemplateDefinition[]);

type HistoryEntry = { document: LessonDocument; selection: EditorSelection };

export function createLessonEditorState(
	initialDocument: LessonDocument = SAMPLE_LESSON_DOCUMENT,
	templateSource: TemplateSource = [BLANK_FRAME_TEMPLATE, READ_AND_RESPOND_TEMPLATE],
	onDocumentChange: (document: LessonDocument) => void = () => undefined
) {
	const initialDocumentSnapshot = structuredClone($state.snapshot(initialDocument));
	const initialTemplates = resolveTemplates();
	let document = $state<LessonDocument>(initialDocumentSnapshot);
	let past = $state<HistoryEntry[]>([]);
	let future = $state<HistoryEntry[]>([]);
	let mode = $state<EditorMode>('edit');
	let previewMode = $state<PreviewMode>('auto');
	let selection = $state<EditorSelection>(
		initialSelection(initialDocumentSnapshot, initialTemplates)
	);
	let announcement = $state('');
	let sequence = 0;
	let lastHistoryGroup: string | null = null;
	let lastHistoryAt = 0;

	function commit(
		commands: EditorCommand | readonly EditorCommand[],
		message = '',
		historyGroup?: string,
		nextSelection?: EditorSelection
	) {
		const commandList = Array.isArray(commands) ? commands : [commands];
		let nextDocument = document;
		for (const command of commandList) nextDocument = applyEditorCommand(nextDocument, command);
		if (nextDocument === document) return false;

		const now = Date.now();
		const coalesce =
			historyGroup !== undefined && historyGroup === lastHistoryGroup && now - lastHistoryAt < 1200;
		if (!coalesce) past = [...past.slice(-(HISTORY_LIMIT - 1)), historyEntry()];
		document = nextDocument;
		if (nextSelection) selection = nextSelection;
		reconcileSelection();
		future = [];
		announcement = message;
		lastHistoryGroup = historyGroup ?? null;
		lastHistoryAt = now;
		emitDocumentChange();
		return true;
	}

	function selectFrame(frameId: string) {
		const frame = document.frames.find((candidate) => candidate.id === frameId);
		if (!frame) return;
		const template = findTemplate(frame.templateId);
		selection = {
			frameId,
			slotId: template?.slots[0]?.id ?? Object.keys(frame.slots)[0] ?? null,
			widgetId: null
		};
	}

	function endHistoryGroup() {
		lastHistoryGroup = null;
		lastHistoryAt = 0;
	}

	function selectSlot(frameId: string, slotId: SlotId) {
		if (!document.frames.find((frame) => frame.id === frameId)?.slots[slotId]) return;
		selection = { frameId, slotId, widgetId: null };
	}

	function selectWidget(frameId: string, slotId: SlotId, widgetId: string) {
		const exists = document.frames
			.find((frame) => frame.id === frameId)
			?.slots[slotId]?.some((widget) => widget.id === widgetId);
		if (exists) selection = { frameId, slotId, widgetId };
	}

	function addFrame(template: TemplateDefinition = resolveTemplates()[0] ?? BLANK_FRAME_TEMPLATE) {
		const frameId = createId('frame');
		const frame = createFrameFromTemplate(frameId, template);
		return commit({ type: 'insert-frame', frame }, 'Frame added', undefined, {
			frameId,
			slotId: template.slots[0]?.id ?? null,
			widgetId: null
		});
	}

	function addWidget(definition: AnyWidgetDefinition) {
		const frame = selectedFrame();
		if (frame) {
			const template = findTemplate(frame.templateId);
			const targetSlot =
				template?.slots.find(
					(slot) =>
						slot.id === selection.slotId && canPlaceWidget(definition.type, frame.id, slot.id)
				) ?? template?.slots.find((slot) => canPlaceWidget(definition.type, frame.id, slot.id));
			if (targetSlot)
				return addWidgetAt(definition, frame.id, targetSlot.id, frame.slots[targetSlot.id].length);
			announcement = `${definition.label} does not fit this template`;
			return false;
		}
		const candidates = resolveTemplates();
		const template = (candidates.length ? candidates : [BLANK_FRAME_TEMPLATE]).find((candidate) =>
			candidate.slots.some((slot) => accepts(slot.accepts, definition.type))
		);
		const targetSlot = template?.slots.find((slot) => accepts(slot.accepts, definition.type));
		if (!template || !targetSlot) {
			announcement = `${definition.label} does not fit the available templates`;
			return false;
		}
		const newFrame = createFrameFromTemplate(createId('frame'), template);
		const widget = createWidget(definition);
		return commit(
			[
				{ type: 'insert-frame', frame: newFrame },
				{ type: 'insert-widget', frameId: newFrame.id, slotId: targetSlot.id, widget }
			],
			`${definition.label} added`,
			undefined,
			{ frameId: newFrame.id, slotId: targetSlot.id, widgetId: widget.id }
		);
	}

	function createWidget(definition: AnyWidgetDefinition): WidgetInstance {
		const createdContent = definition.createContent();
		const content = {
			...createdContent,
			...(createdContent.language === undefined ? {} : { language: document.language }),
			...(createdContent.direction === undefined ? {} : { direction: document.direction })
		} as AnyWidgetContent;
		return { id: createId('widget'), type: definition.type, content } as WidgetInstance;
	}

	function canPlaceWidget(type: string, frameId: string, slotId: SlotId): boolean {
		return canPlaceWidgetInDocument(document, resolveTemplates(), type, frameId, slotId);
	}

	/** An explicit insertion/drop must fit this exact region. */
	function addWidgetAt(
		definition: AnyWidgetDefinition,
		frameId: string,
		slotId: SlotId,
		index: number
	): boolean {
		if (!canPlaceWidget(definition.type, frameId, slotId)) {
			announcement = `${definition.label} cannot be placed in this region`;
			return false;
		}
		const widget = createWidget(definition);
		return commit(
			{ type: 'insert-widget', frameId, slotId, widget, index },
			`${definition.label} added`,
			undefined,
			{ frameId, slotId, widgetId: widget.id }
		);
	}

	function moveWidget(
		widgetId: string,
		targetFrameId: string,
		targetSlotId: SlotId,
		index: number
	): boolean {
		const location = findWidgetLocation(document, widgetId);
		if (!location || !canPlaceWidget(location.widget.type, targetFrameId, targetSlotId)) {
			announcement = 'This widget cannot be moved to that region';
			return false;
		}
		return commit(
			{ type: 'move-widget', widgetId, targetFrameId, targetSlotId, toIndex: index },
			'Widget moved',
			undefined,
			{ frameId: targetFrameId, slotId: targetSlotId, widgetId }
		);
	}

	function removeWidget(widgetId: string): boolean {
		const location = findWidgetLocation(document, widgetId);
		if (!location) return false;
		let nextSelection = selection;
		if (selection.widgetId === widgetId) {
			const frame = document.frames[location.frameIndex];
			const widgets = frame.slots[location.slotId];
			nextSelection = {
				frameId: frame.id,
				slotId: location.slotId,
				widgetId:
					(widgets[location.widgetIndex + 1] ?? widgets[location.widgetIndex - 1])?.id ?? null
			};
		}
		return commit({ type: 'remove-widget', widgetId }, 'Widget removed', undefined, nextSelection);
	}

	function removeFrame(frameId: string): boolean {
		const index = document.frames.findIndex((frame) => frame.id === frameId);
		if (index === -1) return false;
		let nextSelection = selection;
		if (selection.frameId === frameId) {
			const adjacent = document.frames[index + 1] ?? document.frames[index - 1];
			nextSelection = adjacent
				? { frameId: adjacent.id, slotId: Object.keys(adjacent.slots)[0] ?? null, widgetId: null }
				: { frameId: null, slotId: null, widgetId: null };
		}
		return commit(
			{ type: 'remove-frame', frameId },
			'Frame and its widgets removed',
			undefined,
			nextSelection
		);
	}

	function moveFrame(frameId: string, toIndex: number): boolean {
		const frame = document.frames.find((candidate) => candidate.id === frameId);
		if (!frame) return false;
		const nextSelection =
			selection.frameId === frameId
				? selection
				: { frameId, slotId: Object.keys(frame.slots)[0] ?? null, widgetId: null };
		return commit(
			{ type: 'move-frame', frameId, toIndex },
			'Frame moved',
			undefined,
			nextSelection
		);
	}

	function updateWidgetContent(frameId: string, widgetId: string, content: AnyWidgetContent) {
		commit(
			{ type: 'update-widget-content', frameId, widgetId, content },
			'',
			`widget-content:${widgetId}`
		);
	}

	function updateFrameAppearance(appearance: Partial<FrameAppearance>) {
		if (!selection.frameId) return;
		commit({
			type: 'update-frame-appearance',
			frameId: selection.frameId,
			appearance
		});
	}

	function updateDocumentTitle(title: string) {
		const normalizedTitle = title.trim();
		if (!normalizedTitle || normalizedTitle === document.title) return false;
		return commit(
			{ type: 'update-document-settings', settings: { title: normalizedTitle } },
			'Lesson title updated'
		);
	}

	function updateContentLanguage(language: string) {
		const normalizedLanguage = language || 'und';
		updateContentMetadata({ language: normalizedLanguage });
	}

	function updateContentDirection(direction: TextDirection) {
		updateContentMetadata({ direction });
	}

	function updateContentMetadata(metadata: Partial<LanguageContentMetadata>) {
		const commands: EditorCommand[] = [];
		const frame = selectedFrame();
		if (selection.widgetId && frame) {
			const widget = Object.values(frame.slots)
				.flat()
				.find((candidate) => candidate.id === selection.widgetId);
			if (
				widget &&
				(widget.content.language !== undefined || widget.content.direction !== undefined)
			) {
				commands.push({
					type: 'update-widget-content',
					frameId: frame.id,
					widgetId: widget.id,
					content: { ...widget.content, ...metadata } as AnyWidgetContent
				});
			}
		} else {
			commands.push({ type: 'update-document-settings', settings: metadata });
			for (const documentFrame of document.frames) {
				for (const widget of Object.values(documentFrame.slots).flat()) {
					if (widget.content.language === undefined && widget.content.direction === undefined)
						continue;
					commands.push({
						type: 'update-widget-content',
						frameId: documentFrame.id,
						widgetId: widget.id,
						content: { ...widget.content, ...metadata } as AnyWidgetContent
					});
				}
			}
		}
		if (commands.length === 0) return;
		commit(commands, 'Writing settings updated');
	}

	function undo() {
		const previous = past.at(-1);
		if (!previous) return;
		future = [historyEntry(), ...future].slice(0, HISTORY_LIMIT);
		document = previous.document;
		selection = { ...previous.selection };
		past = past.slice(0, -1);
		reconcileSelection();
		lastHistoryGroup = null;
		announcement = 'Change undone';
		emitDocumentChange();
	}

	function redo() {
		const next = future[0];
		if (!next) return;
		past = [...past.slice(-(HISTORY_LIMIT - 1)), historyEntry()];
		document = next.document;
		selection = { ...next.selection };
		future = future.slice(1);
		reconcileSelection();
		lastHistoryGroup = null;
		announcement = 'Change restored';
		emitDocumentChange();
	}

	function replaceDocument(nextDocument: LessonDocument) {
		document = structuredClone($state.snapshot(nextDocument));
		past = [];
		future = [];
		lastHistoryGroup = null;
		reconcileSelection();
		announcement = 'Lesson loaded';
	}

	function reconcileSelection() {
		if (selection.widgetId) {
			const location = findWidgetLocation(document, selection.widgetId);
			if (location) {
				selection = {
					frameId: document.frames[location.frameIndex].id,
					slotId: location.slotId,
					widgetId: selection.widgetId
				};
				return;
			}
		}
		const frame =
			document.frames.find((candidate) => candidate.id === selection.frameId) ?? document.frames[0];
		if (!frame) {
			selection = { frameId: null, slotId: null, widgetId: null };
			return;
		}
		const slotId =
			(selection.slotId && frame.slots[selection.slotId] ? selection.slotId : undefined) ??
			Object.keys(frame.slots)[0] ??
			null;
		const widgetExists = Object.values(frame.slots)
			.flat()
			.some((widget) => widget.id === selection.widgetId);
		selection = {
			frameId: frame.id,
			slotId,
			widgetId: widgetExists ? selection.widgetId : null
		};
	}

	function selectedFrame() {
		return document.frames.find((frame) => frame.id === selection.frameId);
	}

	function selectedWidget() {
		const frame = selectedFrame();
		return frame
			? Object.values(frame.slots)
					.flat()
					.find((widget) => widget.id === selection.widgetId)
			: undefined;
	}

	function findTemplate(templateId: string) {
		return resolveTemplates().find((template) => template.id === templateId);
	}

	function resolveTemplates() {
		return typeof templateSource === 'function' ? templateSource() : templateSource;
	}

	function emitDocumentChange() {
		onDocumentChange(structuredClone($state.snapshot(document)));
	}

	function historyEntry(): HistoryEntry {
		return { document, selection: { ...selection } };
	}

	function createId(prefix: string) {
		sequence += 1;
		const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${sequence}`;
		return `${prefix}.${suffix}`;
	}

	return {
		get document() {
			return document;
		},
		get mode() {
			return mode;
		},
		set mode(value: EditorMode) {
			mode = value;
		},
		get previewMode() {
			return previewMode;
		},
		set previewMode(value: PreviewMode) {
			previewMode = value;
		},
		get selection() {
			return selection;
		},
		get announcement() {
			return announcement;
		},
		get canUndo() {
			return past.length > 0;
		},
		get canRedo() {
			return future.length > 0;
		},
		selectedFrame,
		selectedWidget,
		selectFrame,
		selectSlot,
		selectWidget,
		addFrame,
		addWidget,
		addWidgetAt,
		canPlaceWidget,
		moveWidget,
		removeWidget,
		moveFrame,
		removeFrame,
		updateWidgetContent,
		endHistoryGroup,
		updateFrameAppearance,
		updateDocumentTitle,
		updateContentLanguage,
		updateContentDirection,
		replaceDocument,
		undo,
		redo
	};
}

function firstWidgetId(frame: { slots: Record<SlotId, WidgetInstance[]> }) {
	return Object.values(frame.slots).flat()[0]?.id ?? null;
}

function initialSelection(
	document: LessonDocument,
	templates: readonly TemplateDefinition[]
): EditorSelection {
	const frame = document.frames[0];
	if (!frame) return { frameId: null, slotId: null, widgetId: null };

	const populatedSlot = Object.entries(frame.slots).find(([, widgets]) => widgets.length > 0);
	const template = templates.find((candidate) => candidate.id === frame.templateId);
	const slotId =
		populatedSlot?.[0] ??
		template?.slots.find((slot) => frame.slots[slot.id] !== undefined)?.id ??
		Object.keys(frame.slots)[0] ??
		null;

	return {
		frameId: frame.id,
		slotId,
		widgetId: populatedSlot?.[1][0]?.id ?? firstWidgetId(frame)
	};
}

function accepts(acceptedTypes: readonly string[] | undefined, type: string) {
	return acceptedTypes === undefined || acceptedTypes.includes(type);
}
