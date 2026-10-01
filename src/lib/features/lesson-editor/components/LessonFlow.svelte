<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { CourseMediaResource } from '$lib/domain/course-media-resource';
	import { lessonSpeakingSentences } from '$lib/features/speaking-practice/lesson-sentences';
	import { ArrowDown, ArrowUp, Settings2, Trash2 } from '@lucide/svelte';
	import type { LessonDrag, LessonDragController } from '../interactions/lesson-drag';
	import type {
		AnyWidgetContent,
		EntityId,
		LessonDocument,
		PreviewMode,
		SlotId,
		TemplateDefinition,
		TextDirection
	} from '../model/types';
	import TemplateInsertMenu from './TemplateInsertMenu.svelte';
	import type {
		LanguageWidgetRuntimeBindings,
		AudioPlaybackState,
		PronunciationPracticeState
	} from './widgets/runtime-types';
	import type { WidgetRenderer } from './widgets/widget-renderer';
	import LessonFrame from './LessonFrame.svelte';
	import { BLANK_FRAME_TEMPLATE } from '../model';

	let {
		document,
		templates,
		previewMode,
		editing,
		selectedFrameId,
		selectedSlotId,
		selectedWidgetId,
		onSelectFrame,
		onSelectSlot,
		onSelectWidget,
		onAddFrame,
		onWidgetContentChange,
		languageRuntime,
		mediaResources = [],
		renderWidget,
		subjectKicker,
		subjectKickerLanguage,
		subjectKickerDirection,
		drag = null,
		dragController,
		onRemoveWidget,
		onRemoveFrame,
		onMoveWidget,
		onMoveFrame,
		canPlaceWidget,
		onOpenWidgetProperties,
		showHelp = true,
		showNavigator = true
	}: {
		document: LessonDocument;
		templates: readonly TemplateDefinition[];
		previewMode: PreviewMode;
		editing: boolean;
		selectedFrameId: EntityId | null;
		selectedSlotId: SlotId | null;
		selectedWidgetId: EntityId | null;
		onSelectFrame: (frameId: EntityId) => void;
		onSelectSlot: (frameId: EntityId, slotId: SlotId) => void;
		onSelectWidget: (frameId: EntityId, slotId: SlotId, widgetId: EntityId) => void;
		onAddFrame: (template?: TemplateDefinition) => void;
		onWidgetContentChange: (
			frameId: EntityId,
			widgetId: EntityId,
			content: AnyWidgetContent
		) => void;
		languageRuntime?: LanguageWidgetRuntimeBindings;
		mediaResources?: readonly CourseMediaResource[];
		renderWidget?: WidgetRenderer;
		subjectKicker?: string;
		subjectKickerLanguage?: string;
		subjectKickerDirection?: TextDirection;
		drag?: LessonDrag | null;
		dragController?: LessonDragController;
		onRemoveWidget: (widgetId: string) => boolean;
		onRemoveFrame: (frameId: string) => boolean;
		onMoveWidget: (widgetId: string, frameId: string, slotId: string, index: number) => boolean;
		onMoveFrame: (frameId: string, index: number) => boolean;
		canPlaceWidget: (type: string, frameId: string, slotId: string) => boolean;
		onOpenWidgetProperties: () => void;
		showHelp?: boolean;
		showNavigator?: boolean;
	} = $props();
	let navigatorId = $state('');
	let announcement = $state('');
	let answers = $state<Record<string, string>>({});
	let audio = $state<Record<string, AudioPlaybackState>>({});
	let pronunciation = $state<Record<string, PronunciationPracticeState>>({});
	let host: HTMLDivElement;
	let moveRegion = $state('');
	let movePosition = $state(1);
	const selectedFrame = $derived(document.frames.find((frame) => frame.id === selectedFrameId));
	const selectedWidget = $derived(
		selectedFrame &&
			Object.values(selectedFrame.slots)
				.flat()
				.find((widget) => widget.id === selectedWidgetId)
	);
	const moveRegions = $derived.by(() => {
		if (!selectedWidget) return [];
		return document.frames.flatMap((frame, index) => {
			const template = templates.find((template) => template.id === frame.templateId);
			return (template?.slots ?? [])
				.filter((slot) => canPlaceWidget(selectedWidget.type, frame.id, slot.id))
				.map((slot) => ({
					key: JSON.stringify([frame.id, slot.id]),
					frameId: frame.id,
					slotId: slot.id,
					label: `${frame.title || `Frame ${index + 1}`} · ${slot.label}`
				}));
		});
	});
	const moveDestination = $derived(
		moveRegions.find((region) => region.key === moveRegion) ?? moveRegions[0]
	);
	const destinationLength = $derived(
		moveDestination
			? (
					document.frames.find((frame) => frame.id === moveDestination.frameId)?.slots[
						moveDestination.slotId
					] ?? []
				).filter((widget) => widget.id !== selectedWidgetId).length
			: 0
	);
	const selectedIndex = $derived(
		selectedWidgetId
			? (selectedFrame?.slots[selectedSlotId ?? ''] ?? []).findIndex(
					(widget) => widget.id === selectedWidgetId
				)
			: document.frames.findIndex((frame) => frame.id === selectedFrameId)
	);
	const selectedCount = $derived(
		selectedWidgetId
			? (selectedFrame?.slots[selectedSlotId ?? '']?.length ?? 0)
			: document.frames.length
	);
	function deleteSelection() {
		if (!editing || drag) return;
		if (selectedWidgetId) onRemoveWidget(selectedWidgetId);
		else if (selectedFrameId) onRemoveFrame(selectedFrameId);
	}
	function nudge(direction: -1 | 1) {
		if (
			!editing ||
			drag ||
			selectedIndex < 0 ||
			selectedIndex + direction < 0 ||
			selectedIndex + direction >= selectedCount
		)
			return;
		if (selectedWidgetId && selectedFrameId && selectedSlotId)
			onMoveWidget(selectedWidgetId, selectedFrameId, selectedSlotId, selectedIndex + direction);
		else if (selectedFrameId) onMoveFrame(selectedFrameId, selectedIndex + direction);
	}

	// Learner state belongs to the lesson, not to a transient panel or authored JSON.
	const speakingSentences = $derived(lessonSpeakingSentences(document, mediaResources));
	const runtime: LanguageWidgetRuntimeBindings = $derived({
		speakingSentences,
		responseAnswers: { ...answers, ...languageRuntime?.responseAnswers },
		audioPlayback: { ...audio, ...languageRuntime?.audioPlayback },
		pronunciationPractice: { ...pronunciation, ...languageRuntime?.pronunciationPractice },
		onResponseAnswerChange: (id, answer) => {
			answers = { ...answers, [id]: answer };
			languageRuntime?.onResponseAnswerChange?.(id, answer);
		},
		onAudioPlaybackChange: (id, playback) => {
			audio = { ...audio, [id]: playback };
			languageRuntime?.onAudioPlaybackChange?.(id, playback);
		},
		onTimedTextPlaybackChange: (id, playback) => {
			languageRuntime?.onTimedTextPlaybackChange?.(id, playback);
		},
		onPronunciationPracticeChange: (id, practice) => {
			pronunciation = { ...pronunciation, [id]: practice };
			languageRuntime?.onPronunciationPracticeChange?.(id, practice);
		}
	});

	type NavigationTarget = {
		id: string;
		kind: 'frame' | 'slot' | 'widget';
		label: string;
		frameId: string;
		slotId?: string;
		widgetId?: string;
	};
	const navigationTargets: NavigationTarget[] = $derived(
		document.frames.flatMap((frame, index) => {
			const template = templates.find((item) => item.id === frame.templateId);
			return [
				{
					id: 'frame:' + frame.id,
					kind: 'frame' as const,
					frameId: frame.id,
					label: frame.title || 'Frame ' + (index + 1)
				},
				...Object.entries(frame.slots).flatMap(([slotId, widgets]) => [
					{
						id: 'slot:' + frame.id + ':' + slotId,
						kind: 'slot' as const,
						frameId: frame.id,
						slotId,
						label: template?.slots.find((slot) => slot.id === slotId)?.label ?? slotId
					},
					...widgets.map((widget) => ({
						id: 'widget:' + widget.id,
						kind: 'widget' as const,
						frameId: frame.id,
						slotId,
						widgetId: widget.id,
						label: widget.type.replace('language.', '')
					}))
				])
			];
		})
	);
	const chosen = $derived(navigationTargets.find((target) => target.id === navigatorId));
	$effect(() => {
		const target = selectedWidgetId
			? navigationTargets.find((item) => item.widgetId === selectedWidgetId)
			: navigationTargets.find(
					(item) =>
						item.frameId === selectedFrameId &&
						item.slotId === selectedSlotId &&
						item.kind === 'slot'
				);
		navigatorId = target?.id ?? '';
	});
	function select(target: NavigationTarget) {
		navigatorId = target.id;
		if (target.widgetId && target.slotId)
			onSelectWidget(target.frameId, target.slotId, target.widgetId);
		else if (target.slotId) onSelectSlot(target.frameId, target.slotId);
		else onSelectFrame(target.frameId);
	}
	function activate(target: NavigationTarget) {
		select(target);
		const element = Array.from(host.querySelectorAll<HTMLElement>('[data-lesson-widget]')).find(
			(node) => node.dataset.widgetId === target.widgetId
		);
		element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		element
			?.querySelector<HTMLElement>(
				editing ? '[contenteditable="true"]' : 'input, textarea, button:not([data-element-grip])'
			)
			?.focus({ preventScroll: true });
		announcement = editing ? 'Edit text directly in the lesson.' : 'Activity selected.';
	}
	function resolveTemplate(frame: LessonDocument['frames'][number]): TemplateDefinition {
		const saved = templates.find((item) => item.id === frame.templateId);
		if (saved) return saved;
		const ids = Object.keys(frame.slots);
		const layout = {
			columnWeights: [1],
			areas: ids.map((id) => [id]),
			order: ids,
			gap: 'md' as const
		};
		return {
			...BLANK_FRAME_TEMPLATE,
			slots: ids.map((id) => ({ id, label: id })),
			variants: { desktop: layout, tablet: layout, phone: layout }
		};
	}
</script>

<section
	class="lesson-flow"
	class:preview-phone={previewMode === 'phone'}
	class:preview-tablet={previewMode === 'tablet'}
	aria-label={`${document.title} lesson flow`}
>
	{#if showNavigator}
		<div class="document-controls" dir="ltr" lang="en">
			<label
				>Content navigator
				<select
					aria-label="Lesson content navigator"
					value={navigatorId}
					onchange={(event) => {
						const target = navigationTargets.find(
							(target) => target.id === event.currentTarget.value
						);
						if (target) select(target);
					}}
				>
					<option value="">Choose a frame or widget</option>
					{#each navigationTargets as target (target.id)}<option value={target.id}
							>{target.label}</option
						>{/each}
				</select>
			</label>
			<Button
				variant="outline"
				size="sm"
				disabled={!chosen?.widgetId}
				onclick={() => {
					if (chosen) activate(chosen);
				}}>{editing ? 'Edit widget' : 'Open activity'}</Button
			>
		</div>
	{/if}
	{#if editing}
		<div class="element-actions" aria-label="Selected element actions">
			<Button
				variant="ghost"
				size="sm"
				aria-label="Move selected element up"
				disabled={!!drag || selectedIndex <= 0}
				onclick={() => nudge(-1)}><ArrowUp size={14} />Move up</Button
			>
			<Button
				variant="ghost"
				size="sm"
				aria-label="Move selected element down"
				disabled={!!drag || selectedIndex < 0 || selectedIndex >= selectedCount - 1}
				onclick={() => nudge(1)}><ArrowDown size={14} />Move down</Button
			>
			{#if selectedWidgetId}<Button
					variant="ghost"
					size="sm"
					disabled={!!drag}
					onclick={onOpenWidgetProperties}><Settings2 size={14} />Properties</Button
				><Button variant="ghost" size="sm" disabled={!!drag} onclick={deleteSelection}
					><Trash2 size={14} />Delete widget</Button
				>{/if}
			<Button
				variant="ghost"
				size="sm"
				disabled={!!drag || !selectedFrameId}
				onclick={() => {
					if (selectedFrameId) onRemoveFrame(selectedFrameId);
				}}><Trash2 size={14} />Delete frame</Button
			>
		</div>
		{#if selectedWidgetId}
			<details class="move-widget">
				<summary>Move widget to another region</summary>
				<div class="move-controls">
					<label
						>Region<select
							aria-label="Move widget to region"
							value={moveDestination?.key ?? ''}
							onchange={(event) => {
								moveRegion = event.currentTarget.value;
								movePosition = 1;
							}}
							>{#each moveRegions as region (region.key)}<option value={region.key}
									>{region.label}</option
								>{/each}</select
						></label
					>
					<label
						>Position<input
							type="number"
							aria-label="Widget destination position"
							min="1"
							max={destinationLength + 1}
							bind:value={movePosition}
						/></label
					>
					<Button
						variant="outline"
						size="sm"
						disabled={!!drag || !moveDestination || !Number.isFinite(movePosition)}
						onclick={() => {
							if (moveDestination && selectedWidgetId)
								onMoveWidget(
									selectedWidgetId,
									moveDestination.frameId,
									moveDestination.slotId,
									Math.max(0, Math.min(destinationLength, movePosition - 1))
								);
						}}>Move widget</Button
					>
				</div>
			</details>
		{/if}
	{/if}

	{#if showHelp}
		<p class="document-help">
			{editing
				? 'Write and select text directly. Use grips to move frames and widgets; Delete on a focused grip removes its element. Undo restores changes.'
				: 'Select and copy text, listen, and respond directly in the lesson.'}
		</p>
	{/if}
	{#if drag}<p class="drag-status" role="status">
			{drag.invalid || !drag.target
				? 'Move over a compatible region to drop. Escape cancels.'
				: 'Release to place. Escape cancels.'}
		</p>{/if}
	<div
		bind:this={host}
		class="lesson-paper"
		data-lesson-document
		lang={document.language}
		dir={document.direction}
	>
		<header class="document-heading">
			{#if subjectKicker}<p
					class="subject-kicker"
					lang={subjectKickerLanguage}
					dir={subjectKickerDirection}
				>
					{subjectKicker}
				</p>{/if}
			<h1>{document.title}</h1>
			{#if document.description}<p class="document-description">{document.description}</p>{/if}
		</header>
		<div class="frame-flow">
			{#each document.frames as frame, index (frame.id)}
				<LessonFrame
					{frame}
					template={resolveTemplate(frame)}
					frameNumber={index + 1}
					{previewMode}
					language={document.language}
					direction={document.direction}
					{editing}
					selected={selectedFrameId === frame.id}
					{selectedSlotId}
					{selectedWidgetId}
					{onSelectFrame}
					{onSelectSlot}
					{onSelectWidget}
					{onWidgetContentChange}
					languageRuntime={runtime}
					{mediaResources}
					{renderWidget}
					{drag}
					{dragController}
					{onRemoveFrame}
					{onRemoveWidget}
					{onMoveFrame}
					{onMoveWidget}
					{onOpenWidgetProperties}
				/>
			{/each}
			{#if document.frames.length === 0}<p class="empty-lesson">
					{editing ? 'Add a frame to start your lesson.' : 'This lesson is empty.'}
				</p>{/if}
		</div>
		{#if drag?.target}<div
				class="drop-indicator"
				aria-hidden="true"
				style:left={drag.target.rect.x + 'px'}
				style:top={drag.target.rect.y + 'px'}
				style:width={drag.target.rect.width + 'px'}
			></div>{/if}
	</div>
	{#if editing}<div class="add-frame-row">
			<TemplateInsertMenu {templates} onchoose={onAddFrame} />
		</div>{/if}
	<p class="sr-only" aria-live="polite">{announcement}</p>
</section>

<style>
	.lesson-flow {
		inline-size: 100%;
		min-inline-size: 0;
		max-inline-size: 76rem;
		margin-inline: auto;
	}
	.lesson-flow.preview-phone {
		max-inline-size: 25rem;
	}
	.lesson-flow.preview-tablet {
		max-inline-size: 50rem;
	}
	.lesson-paper {
		position: relative;
		inline-size: 100%;
		min-block-size: 25rem;
		padding: clamp(0.75rem, 1.8cqi, 1.4rem);
		background: transparent;
		border-radius: 0;
		color: #453b50;
		user-select: text;
	}
	:global(.lesson-editor.reader) .lesson-paper {
		min-block-size: 0;
		padding: clamp(0.25rem, 0.6cqi, 0.4rem);
	}
	:global(.lesson-editor.reader) .document-heading {
		margin-block-end: clamp(0.6rem, 1.1cqi, 0.8rem);
	}
	.document-heading {
		margin-block-end: 1.25rem;
		text-align: start;
	}
	.document-heading h1 {
		font-size: clamp(1.6rem, 3cqi, 2.35rem);
		font-weight: 650;
		line-height: 1.65;
		overflow-wrap: anywhere;
		margin: 0;
	}
	.subject-kicker {
		font-size: 0.75rem;
		color: #8b7798;
		margin-block-end: 0.45rem;
	}
	.document-description {
		color: #81728b;
		font-size: 0.9rem;
		line-height: 1.8;
	}
	.lesson-paper:lang(fa),
	.lesson-paper:lang(ar) {
		font-family: var(--font-arabic);
	}
	.frame-flow {
		display: flex;
		flex-direction: column;
		gap: clamp(1rem, 2.2cqi, 1.5rem);
	}
	:global(.lesson-editor.reader) .frame-flow {
		gap: clamp(0.6rem, 1.3cqi, 0.8rem);
	}
	.empty-lesson {
		color: var(--muted-foreground);
		text-align: center;
		padding-block: 3rem;
	}
	.drop-indicator {
		position: absolute;
		height: 0.2rem;
		border-radius: 1rem;
		background: var(--ring);
		box-shadow: 0 0 0 0.15rem var(--editor-selection-soft);
		pointer-events: none;
		z-index: 10;
	}
	.lesson-paper :global([data-lesson-widget]),
	.lesson-paper :global([data-lesson-frame]) {
		scroll-margin-block-start: calc(var(--sidebar-offset, 0rem) + 1rem);
	}
	.lesson-paper ::selection {
		background: var(--editor-selection-soft);
	}

	.document-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.65rem;
		margin-block-end: 0.65rem;
	}
	.document-controls label {
		display: grid;
		gap: 0.35rem;
		flex: 1;
		min-inline-size: 0;
		color: var(--muted-foreground);
		font-size: 0.7rem;
	}
	.document-controls select {
		inline-size: 100%;
		min-block-size: 2.4rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.6rem;
		padding-inline: 0.6rem;
		background: var(--background);
		color: var(--foreground);
		font-size: 0.75rem;
	}
	.document-help {
		margin-block: 0.45rem 0.75rem;
		color: var(--muted-foreground);
		font-size: 0.66rem;
		line-height: 1.45;
	}
	.element-actions,
	.move-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.35rem;
	}
	.move-widget {
		margin-block: 0.65rem;
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}
	.move-widget summary {
		cursor: pointer;
		padding-block: 0.35rem;
	}
	.move-controls label {
		display: grid;
		gap: 0.25rem;
		min-inline-size: 0;
	}
	.move-controls select,
	.move-controls input {
		min-block-size: 2.4rem;
		max-inline-size: 100%;
		border: 0.0625rem solid var(--border);
		border-radius: 0.5rem;
		padding-inline: 0.5rem;
		background: var(--background);
		color: var(--foreground);
	}
	.move-controls label:first-child {
		flex: 1 1 12rem;
	}
	.move-controls input {
		inline-size: 4.5rem;
	}
	.drag-status {
		position: fixed;
		inset-block-end: 5rem;
		inset-inline-start: 50%;
		z-index: 60;
		transform: translateX(-50%);
		inline-size: max-content;
		max-inline-size: calc(100% - 2rem);
		padding: 0.7rem 1rem;
		border-radius: 0.7rem;
		background: var(--foreground);
		color: var(--background);
		pointer-events: none;
		font-size: 0.75rem;
	}

	.add-frame-row {
		display: flex;
		justify-content: center;
		margin-block-start: 1.25rem;
	}
	@container (max-width: 32rem) {
		.lesson-paper {
			padding: 0.6rem;
		}
		.document-heading {
			margin-block-end: 0.85rem;
		}
		.frame-flow {
			gap: 0.8rem;
		}
		.add-frame-row {
			margin-block-start: 0.85rem;
		}
	}
</style>
