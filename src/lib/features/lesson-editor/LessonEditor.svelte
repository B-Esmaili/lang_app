<script lang="ts">
	import RedoIcon from '@lucide/svelte/icons/redo-2';
	import UndoIcon from '@lucide/svelte/icons/undo-2';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import type { CourseMediaResource } from '$lib/domain/course-media-resource';
	import StickyPanel from '$lib/components/layout/StickyPanel.svelte';
	import { onDestroy, setContext, untrack } from 'svelte';
	import EditorToolbar from './components/EditorToolbar.svelte';
	import InspectorPanel from './components/InspectorPanel.svelte';
	import LessonFlow from './components/LessonFlow.svelte';
	import WidgetPropertiesDrawer from './components/WidgetPropertiesDrawer.svelte';
	import WidgetLibrary from './components/WidgetLibrary.svelte';
	import type { LanguageWidgetRuntimeBindings } from './components/widgets/runtime-types';
	import type { WidgetRenderer } from './components/widgets/widget-renderer';
	import { createLessonDragController, type LessonDrag } from './interactions/lesson-drag';
	import { TEXT_HISTORY_CONTEXT } from './components/widgets/rich-text/history';
	import {
		BLANK_FRAME_TEMPLATE,
		READ_AND_RESPOND_TEMPLATE,
		SAMPLE_LESSON_DOCUMENT,
		type LessonDocument,
		type TemplateDefinition
	} from './model';
	import {
		WIDGET_DEFINITIONS,
		getWidgetCategories,
		type AnyWidgetDefinition,
		type WidgetCategoryDefinition
	} from './registry';
	import { createLessonEditorState } from './state/lesson-editor.svelte';

	let {
		initialDocument = SAMPLE_LESSON_DOCUMENT,
		templates = [BLANK_FRAME_TEMPLATE, READ_AND_RESPOND_TEMPLATE],
		widgetDefinitions = WIDGET_DEFINITIONS,
		widgetCategories = getWidgetCategories(),
		subjectLabel = 'Language Learning',
		subjectKicker = undefined,
		subjectKickerLanguage = undefined,
		subjectKickerDirection = undefined,
		languageRuntime = undefined,
		mediaResources = [],
		onGenerateMediaTranscription = undefined,
		renderWidget = undefined,
		initialMode = 'edit',
		embedded = false,
		editable = true,
		chrome = true,
		onDocumentChange = () => undefined
	}: {
		initialDocument?: LessonDocument;
		templates?: readonly TemplateDefinition[];
		widgetDefinitions?: readonly AnyWidgetDefinition[];
		widgetCategories?: readonly WidgetCategoryDefinition[];
		subjectLabel?: string;
		subjectKicker?: string;
		subjectKickerLanguage?: string;
		subjectKickerDirection?: LessonDocument['direction'];
		languageRuntime?: LanguageWidgetRuntimeBindings;
		mediaResources?: readonly CourseMediaResource[];
		onGenerateMediaTranscription?: (
			resource: CourseMediaResource
		) => Promise<CourseMediaResource | null>;
		renderWidget?: WidgetRenderer;
		initialMode?: 'edit' | 'preview';
		embedded?: boolean;
		editable?: boolean;
		/** Hide authoring and preview controls for learner-facing presentation. */
		chrome?: boolean;
		onDocumentChange?: (document: LessonDocument) => void;
	} = $props();

	const editor = untrack(() =>
		createLessonEditorState(
			initialDocument,
			() => templates,
			(document) => onDocumentChange(document)
		)
	);
	let workspace: HTMLDivElement;
	let toolbarBlockSize = $state(0);
	let widgetPropertiesOpen = $state(false);
	setContext(TEXT_HISTORY_CONTEXT, {
		undo: editor.undo,
		redo: editor.redo,
		breakGroup: editor.endHistoryGroup
	});
	let drag = $state<LessonDrag | null>(null);
	const dragController = createLessonDragController({
		surface: () => workspace?.querySelector<HTMLElement>('[data-lesson-document]') ?? null,
		document: () => editor.document,
		templates: () => templates,
		enabled: () => editable && editor.mode === 'edit',
		onchange: (value) => {
			drag = value;
		},
		ondrop: (source, target) => {
			if (source.kind === 'frame' && target.kind === 'frame')
				editor.moveFrame(source.frameId, target.index);
			else if (source.kind === 'widget' && target.kind === 'widget')
				editor.moveWidget(source.widgetId, target.frameId, target.slotId, target.index);
			else if (source.kind === 'library' && target.kind === 'widget') {
				const definition = widgetDefinitions.find(
					(definition) => definition.type === source.widgetType
				);
				if (definition) editor.addWidgetAt(definition, target.frameId, target.slotId, target.index);
			}
		}
	});
	onDestroy(() => dragController.destroy());
	untrack(() => {
		editor.mode = editable ? initialMode : 'preview';
	});
	const selectedFrame = $derived(editor.selectedFrame());
	const selectedWidget = $derived(editor.selectedWidget());
	const contentLanguage = $derived(selectedWidget?.content.language ?? editor.document.language);
	const contentDirection = $derived(selectedWidget?.content.direction ?? editor.document.direction);
	const resolvedSubjectKicker = $derived(subjectKicker ?? subjectLabel);
	const resolvedKickerDirection = $derived(
		subjectKickerDirection ?? (subjectKicker === undefined ? 'ltr' : editor.document.direction)
	);
	function keyboardShortcut(event: KeyboardEvent) {
		if (
			!editable ||
			editor.mode !== 'edit' ||
			event.defaultPrevented ||
			event.isComposing ||
			!(event.ctrlKey || event.metaKey)
		)
			return;
		const target = event.target instanceof Element ? event.target : null;
		if (
			!target ||
			!workspace?.contains(target) ||
			target.closest('input, textarea, select, [contenteditable="true"]')
		)
			return;
		const key = event.key.toLowerCase();
		if (key === 'z' || key === 'y') {
			event.preventDefault();
			if (key === 'y' || event.shiftKey) editor.redo();
			else editor.undo();
		}
	}
</script>

<svelte:window onkeydown={keyboardShortcut} />

<svelte:head>
	<title>{editor.document.title} · Learning studio</title>
	<meta
		name="description"
		content="Compose responsive language-learning lessons with reusable frames and widgets."
	/>
</svelte:head>

<div
	bind:this={workspace}
	class="lesson-editor"
	class:embedded
	class:reader={!chrome}
	data-mode={editor.mode}
	style:--editor-toolbar-height={toolbarBlockSize ? `${toolbarBlockSize}px` : undefined}
>
	{#if chrome}
		<EditorToolbar
			bind:blockSize={toolbarBlockSize}
			title={editor.document.title}
			titleLanguage={editor.document.language}
			titleDirection={editor.document.direction}
			mode={editor.mode}
			previewMode={editor.previewMode}
			{editable}
			onTitleChange={editor.updateDocumentTitle}
			onModeChange={(mode) => (editor.mode = editable ? mode : 'preview')}
			onPreviewModeChange={(previewMode) => (editor.previewMode = previewMode)}
		/>

		<div class="document-strip" dir="ltr" lang="en">
			<div class="document-meta">
				<Badge variant="secondary">{subjectLabel}</Badge>
				<span>Responsive frame · relative units</span>
				<span class="writing-support">Persian &amp; Arabic ready</span>
			</div>
			{#if editable}
				<div class="history-actions" aria-label="Edit history">
					<Button variant="ghost" size="sm" disabled={!editor.canUndo} onclick={editor.undo}>
						<UndoIcon data-icon="inline-start" />
						Undo
					</Button>
					<Button variant="ghost" size="sm" disabled={!editor.canRedo} onclick={editor.redo}>
						<RedoIcon data-icon="inline-start" />
						Redo
					</Button>
				</div>
			{/if}
		</div>
	{/if}

	<div class="editor-workspace">
		{#if editor.mode === 'edit'}
			<div class="library-panel">
				<StickyPanel>
					<WidgetLibrary
						widgets={widgetDefinitions}
						categories={widgetCategories}
						{dragController}
						disabled={!selectedFrame}
						onAddWidget={(definition) => editor.addWidget(definition)}
					/>
				</StickyPanel>
			</div>
		{/if}

		<section class="document-panel" aria-label="Lesson document">
			<LessonFlow
				subjectKicker={resolvedSubjectKicker}
				{subjectKickerLanguage}
				subjectKickerDirection={resolvedKickerDirection}
				{drag}
				{dragController}
				onRemoveWidget={editor.removeWidget}
				onRemoveFrame={editor.removeFrame}
				onMoveWidget={editor.moveWidget}
				onMoveFrame={editor.moveFrame}
				canPlaceWidget={editor.canPlaceWidget}
				document={editor.document}
				{templates}
				previewMode={editor.previewMode}
				editing={editable && editor.mode === 'edit'}
				selectedFrameId={editor.selection.frameId}
				selectedSlotId={editor.selection.slotId}
				selectedWidgetId={editor.selection.widgetId}
				onSelectFrame={editor.selectFrame}
				onSelectSlot={editor.selectSlot}
				onSelectWidget={editor.selectWidget}
				onAddFrame={(template) => editor.addFrame(template)}
				onWidgetContentChange={editor.updateWidgetContent}
				onOpenWidgetProperties={() => (widgetPropertiesOpen = true)}
				{languageRuntime}
				{mediaResources}
				{renderWidget}
				showHelp={chrome}
				showNavigator={chrome}
			/>
		</section>

		{#if editor.mode === 'edit'}
			<div class="inspector-panel">
				<StickyPanel>
					<InspectorPanel
						border={selectedFrame?.appearance.border ?? 'none'}
						surface={selectedFrame?.appearance.surface ?? 'transparent'}
						{contentLanguage}
						{contentDirection}
						disabled={!selectedFrame}
						onBorderChange={(border) => editor.updateFrameAppearance({ border })}
						onSurfaceChange={(surface) => editor.updateFrameAppearance({ surface })}
						onContentLanguageChange={editor.updateContentLanguage}
						onContentDirectionChange={editor.updateContentDirection}
					/>
				</StickyPanel>
			</div>
		{/if}
	</div>

	{#if editable && widgetPropertiesOpen && selectedWidget && editor.mode === 'edit'}
		<WidgetPropertiesDrawer
			widget={selectedWidget}
			{mediaResources}
			onGenerateTranscription={onGenerateMediaTranscription}
			onClose={() => (widgetPropertiesOpen = false)}
			onContentChange={(content) => {
				if (selectedWidget && selectedFrame)
					editor.updateWidgetContent(selectedFrame.id, selectedWidget.id, content);
			}}
		/>
	{/if}

	<p class="sr-only" aria-live="polite">{editor.announcement}</p>
</div>

<style>
	.lesson-editor {
		--editor-toolbar-height: 4.5rem;
		--sidebar-offset: calc(
			var(--editor-toolbar-offset, var(--app-header-height, 0rem)) + var(--editor-toolbar-height)
		);
		--sidebar-bottom-gap: calc(var(--app-bottom-inset, 0rem) + 1rem);
		container-type: inline-size;
		min-block-size: 100svh;
		background: var(--editor-workspace);
		color: var(--foreground);
	}

	.lesson-editor.embedded {
		min-block-size: 0;
		overflow: clip;
	}

	.lesson-editor.embedded .editor-workspace {
		min-block-size: clamp(38rem, 72svh, 64rem);
	}

	.lesson-editor.reader,
	.lesson-editor.reader .editor-workspace {
		min-block-size: 0;
	}

	.lesson-editor.reader .document-panel {
		padding: 0;
		background: transparent;
	}

	.document-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-block-size: 2.6rem;
		padding-inline: clamp(0.85rem, 2vw, 1.5rem);
		background: color-mix(in oklch, var(--muted) 35%, transparent);
	}

	.document-meta,
	.history-actions {
		display: flex;
		align-items: center;
	}

	.document-meta {
		gap: 0.5rem;
		min-inline-size: 0;
		color: var(--muted-foreground);
		font-size: 0.72rem;
	}

	.writing-support::before {
		content: '·';
		margin-inline-end: 0.65rem;
	}

	.history-actions {
		gap: 0.15rem;
	}

	.editor-workspace {
		display: grid;
		grid-template-columns: minmax(12rem, 16%) minmax(0, 1fr) minmax(13rem, 18%);
		min-block-size: calc(100svh - 7.5rem);
	}

	.library-panel,
	.inspector-panel {
		min-inline-size: 0;
		background: color-mix(in oklch, var(--muted) 30%, var(--background));
	}

	.document-panel {
		min-inline-size: 0;
		padding: clamp(0.9rem, 2.2vw, 1.75rem) clamp(0.75rem, 2.8vw, 2.75rem) clamp(1.5rem, 4vw, 3.5rem);
		background: var(--background);
	}

	.lesson-editor[data-mode='preview'] .editor-workspace {
		display: block;
	}

	.lesson-editor[data-mode='preview'] .document-panel {
		inline-size: 100%;
	}

	@media (max-width: 72rem) {
		.editor-workspace {
			grid-template-columns: minmax(12rem, 24%) minmax(0, 1fr);
		}

		.inspector-panel {
			--sidebar-position: static;
			--sidebar-max-size: none;
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 48rem) {
		.document-strip {
			align-items: flex-start;
			flex-direction: column;
			padding-block: 0.6rem;
		}

		.writing-support,
		.document-meta > span:first-of-type {
			display: none;
		}

		.editor-workspace {
			display: flex;
			flex-direction: column;
		}

		.library-panel {
			--sidebar-position: static;
			--sidebar-max-size: none;
		}

		.document-panel {
			padding: clamp(0.55rem, 3vw, 0.85rem);
		}
	}

	@media (max-width: 32rem) {
		.document-strip {
			gap: 0.4rem;
			min-block-size: 0;
			padding: 0.45rem var(--panel-gutter);
		}
		.document-meta {
			font-size: 0.66rem;
		}
		.document-panel {
			padding: var(--panel-gutter);
		}
	}
</style>
