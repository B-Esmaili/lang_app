import type { Snippet } from 'svelte';
import type { AnyWidgetContent, EntityId, SlotId, WidgetInstance } from '../../model/types';
import type { LanguageWidgetRuntimeBindings } from './runtime-types';

/**
 * Inline rich-text content and learner controls for a subject widget.
 * Subject packages provide a reusable Svelte renderer inside the shared layout.
 */
export type WidgetRenderContext = {
	widget: WidgetInstance;
	frameId: EntityId;
	slotId: SlotId;
	selected: boolean;
	editing: boolean;
	languageRuntime?: LanguageWidgetRuntimeBindings;
	select: () => void;
	updateContent: (content: AnyWidgetContent) => void;
};

export type WidgetRenderer = Snippet<[context: WidgetRenderContext]>;
