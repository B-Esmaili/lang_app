<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { Button } from '$lib/components/ui/button';
	import type { CourseMediaResource } from '$lib/domain/course-media-resource';
	import type {
		AnyWidgetContent,
		EntityId,
		FrameInstance,
		PreviewMode,
		SlotId,
		TemplateDefinition,
		TextDirection
	} from '../model/types';
	import ResponsiveLayout from './ResponsiveLayout.svelte';
	import WidgetHost from './widgets/WidgetHost.svelte';
	import type { LanguageWidgetRuntimeBindings } from './widgets/runtime-types';
	import type { WidgetRenderer } from './widgets/widget-renderer';
	import ElementControls from './ElementControls.svelte';
	import type { LessonDrag, LessonDragController } from '../interactions/lesson-drag';

	let {
		frame,
		template,
		frameNumber,
		previewMode,
		language,
		direction,
		editing,
		selected,
		selectedSlotId,
		selectedWidgetId,
		onSelectFrame,
		onSelectSlot,
		onSelectWidget,
		onWidgetContentChange,
		languageRuntime,
		mediaResources = [],
		renderWidget,
		drag,
		dragController,
		onRemoveFrame,
		onRemoveWidget,
		onMoveFrame,
		onMoveWidget,
		onOpenWidgetProperties
	}: {
		frame: FrameInstance;
		template: TemplateDefinition;
		frameNumber: number;
		previewMode: PreviewMode;
		language: string;
		direction: TextDirection;
		editing: boolean;
		selected: boolean;
		selectedSlotId: SlotId | null;
		selectedWidgetId: EntityId | null;
		onSelectFrame: (frameId: EntityId) => void;
		onSelectSlot: (frameId: EntityId, slotId: SlotId) => void;
		onSelectWidget: (frameId: EntityId, slotId: SlotId, widgetId: EntityId) => void;
		onWidgetContentChange: (
			frameId: EntityId,
			widgetId: EntityId,
			content: AnyWidgetContent
		) => void;
		languageRuntime?: LanguageWidgetRuntimeBindings;
		mediaResources?: readonly CourseMediaResource[];
		renderWidget?: WidgetRenderer;
		drag?: LessonDrag | null;
		dragController?: LessonDragController;
		onRemoveFrame: (id: string) => boolean;
		onRemoveWidget: (id: string) => boolean;
		onMoveFrame: (id: string, index: number) => boolean;
		onMoveWidget: (id: string, frameId: string, slotId: string, index: number) => boolean;
		onOpenWidgetProperties: () => void;
	} = $props();
</script>

<article
	class="frame-shell"
	class:is-selected={editing && selected}
	class:is-dragging={drag?.source.kind === 'frame' && drag.source.frameId === frame.id}
	data-lesson-frame
	data-frame-id={frame.id}
	aria-label={frame.title || undefined}
	lang={language || undefined}
	dir={direction}
>
	{#if editing}
		<ElementControls
			source={{ kind: 'frame', frameId: frame.id }}
			label={frame.title || `Frame ${frameNumber}`}
			{selected}
			controller={dragController}
			onselect={() => onSelectFrame(frame.id)}
			onremove={() => onRemoveFrame(frame.id)}
			onmove={(delta) => onMoveFrame(frame.id, frameNumber - 1 + delta)}
		/>
	{/if}

	<div
		class="frame-surface"
		class:border-subtle={frame.appearance.border === 'subtle'}
		class:border-accent={frame.appearance.border === 'accent'}
		class:surface-plain={frame.appearance.surface === 'plain'}
		class:surface-muted={frame.appearance.surface === 'muted'}
		class:surface-accent={frame.appearance.surface === 'accent'}
		class:shadow-soft={frame.appearance.shadow === 'soft'}
		class:shadow-raised={frame.appearance.shadow === 'raised'}
		class:radius-sm={frame.appearance.radius === 'sm'}
		class:radius-md={frame.appearance.radius === 'md'}
		class:radius-lg={frame.appearance.radius === 'lg'}
		class:padding-sm={frame.appearance.padding === 'sm'}
		class:padding-md={frame.appearance.padding === 'md'}
		class:padding-lg={frame.appearance.padding === 'lg'}
		lang={language || undefined}
		dir={direction}
	>
		<ResponsiveLayout {template} {previewMode} {direction}>
			{#snippet children(slot)}
				{@const widgets = frame.slots[slot.id] ?? []}
				<section
					class="slot-stack"
					data-lesson-slot
					data-frame-id={frame.id}
					data-slot-id={slot.id}
					class:is-selected={editing && selected && selectedSlotId === slot.id}
					aria-label={slot.label}
				>
					{#each widgets as widget, index (widget.id)}
						{@const widgetSelected = editing && selectedWidgetId === widget.id}
						<div
							class="widget-item"
							class:is-selected={widgetSelected}
							class:is-dragging={drag?.source.kind === 'widget' &&
								drag.source.widgetId === widget.id}
							data-lesson-widget
							data-widget-id={widget.id}
							data-frame-id={frame.id}
							data-slot-id={slot.id}
						>
							{#if editing}<ElementControls
									source={{ kind: 'widget', widgetId: widget.id }}
									label={
										widget.type === 'content.rich-text'
											? 'Rich text'
											: widget.type.replace('language.', '')
									}
									selected={widgetSelected}
									controller={dragController}
									onselect={() => onSelectWidget(frame.id, slot.id, widget.id)}
									onproperties={() => {
										onSelectWidget(frame.id, slot.id, widget.id);
										onOpenWidgetProperties();
									}}
									onremove={() => onRemoveWidget(widget.id)}
									onmove={(delta) => {
										if (index + delta >= 0 && index + delta < widgets.length)
											onMoveWidget(widget.id, frame.id, slot.id, index + delta);
									}}
								/>{/if}
							{#if renderWidget}
								{@render renderWidget({
									widget,
									frameId: frame.id,
									slotId: slot.id,
									selected: widgetSelected,
									editing,
									languageRuntime,
									select: () => onSelectWidget(frame.id, slot.id, widget.id),
									updateContent: (content) => onWidgetContentChange(frame.id, widget.id, content)
								})}
							{:else}
								<WidgetHost
									{widget}
									selected={widgetSelected}
									{editing}
									{languageRuntime}
									{mediaResources}
									onSelect={() => onSelectWidget(frame.id, slot.id, widget.id)}
									onContentChange={(content) => onWidgetContentChange(frame.id, widget.id, content)}
								/>
							{/if}
						</div>
					{/each}

					{#if editing}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class={`slot-picker${widgets.length === 0 ? ' empty' : ''}`}
							aria-label={`Choose a widget for ${slot.label}`}
							onclick={() => onSelectSlot(frame.id, slot.id)}
							dir="ltr"
							lang="en"
						>
							<PlusIcon aria-hidden="true" />
							<span>{widgets.length === 0 ? `Add to ${slot.label}` : 'Add widget'}</span>
						</Button>
					{/if}
				</section>
			{/snippet}
		</ResponsiveLayout>
	</div>
</article>

<style>
	.frame-shell {
		position: relative;
		container-type: inline-size;
		inline-size: 100%;
		min-inline-size: 0;
	}

	.frame-surface {
		inline-size: 100%;
		min-inline-size: 0;
		border: 0.0625rem solid transparent;
		background: transparent;
		transition:
			background-color 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}

	.frame-shell.is-selected .frame-surface {
		outline: 0.0625rem solid color-mix(in oklch, var(--editor-selection), transparent 68%);
		outline-offset: 0.125rem;
	}

	.frame-surface.border-subtle {
		border-color: var(--border);
	}

	.frame-surface.border-accent {
		border-color: color-mix(in oklch, var(--ring), transparent 20%);
	}

	.frame-surface.surface-plain {
		background: var(--background);
	}

	.frame-surface.surface-muted {
		background: color-mix(in oklch, var(--muted), transparent 25%);
	}

	.frame-surface.surface-accent {
		background: color-mix(in oklch, var(--accent), transparent 18%);
	}

	.frame-surface.shadow-soft {
		box-shadow: 0 0.5rem 1.5rem color-mix(in oklch, var(--foreground), transparent 94%);
	}

	.frame-surface.shadow-raised {
		box-shadow: 0 1rem 2.5rem color-mix(in oklch, var(--foreground), transparent 88%);
	}

	.frame-surface.radius-sm {
		border-radius: 0.35rem;
	}

	.frame-surface.radius-md {
		border-radius: 0.65rem;
	}

	.frame-surface.radius-lg {
		border-radius: 0.9rem;
	}

	.frame-surface.padding-sm {
		padding: clamp(0.5rem, 1.5cqi, 0.75rem);
	}

	.frame-surface.padding-md {
		padding: clamp(0.65rem, 1.8cqi, 1rem);
	}

	.frame-surface.padding-lg {
		padding: clamp(0.85rem, 2.5cqi, 1.5rem);
	}

	:global(.lesson-editor.reader) .frame-surface.padding-sm {
		padding: 0.3rem;
	}
	:global(.lesson-editor.reader) .frame-surface.padding-md {
		padding: clamp(0.35rem, 0.9cqi, 0.5rem);
	}
	:global(.lesson-editor.reader) .frame-surface.padding-lg {
		padding: clamp(0.45rem, 1.1cqi, 0.6rem);
	}

	@container (max-width: 32rem) {
		.frame-surface.padding-sm {
			padding: 0.45rem;
		}

		.frame-surface.padding-md {
			padding: 0.55rem;
		}

		.frame-surface.padding-lg {
			padding: 0.7rem;
		}
	}
	.is-dragging {
		opacity: 0.4;
	}
	.widget-item {
		position: relative;
		min-inline-size: 0;
		border: 0.0625rem solid transparent;
		border-radius: 0.65rem;
		transition:
			border-color 140ms ease,
			background-color 140ms ease,
			box-shadow 140ms ease;
	}
	.widget-item:hover {
		border-color: color-mix(in oklch, var(--border), transparent 20%);
		background: color-mix(in oklch, var(--muted), transparent 72%);
	}
	.widget-item.is-selected {
		border-color: color-mix(in oklch, var(--ring), transparent 30%);
		background: color-mix(in oklch, var(--editor-selection-soft), transparent 25%);
		box-shadow: 0 0 0 0.12rem color-mix(in oklch, var(--ring), transparent 87%);
	}

	.slot-stack {
		display: flex;
		flex-direction: column;
		gap: clamp(0.4rem, 1cqi, 0.65rem);
		min-inline-size: 0;
		outline: 0.0625rem dashed transparent;
		outline-offset: 0.2rem;
	}

	.slot-stack.is-selected {
		outline: 0;
		border-radius: 0.35rem;
		background: color-mix(in oklch, var(--editor-selection) 6%, transparent);
	}

	.slot-stack :global(.slot-picker) {
		display: inline-flex;
		align-items: center;
		align-self: flex-start;
		justify-content: center;
		gap: 0.4rem;
		min-block-size: 2rem;
		padding-inline: 0.65rem;
		border: 0;
		border-radius: 0.55rem;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 0.7rem;
		font-weight: 550;
		cursor: pointer;
	}

	.slot-stack :global(.slot-picker.empty) {
		align-self: stretch;
		min-block-size: clamp(4rem, 9cqi, 5.5rem);
		outline: 0;
		background: color-mix(in oklch, var(--muted) 58%, transparent);
	}

	.slot-stack :global(.slot-picker:hover) {
		background: color-mix(in oklch, var(--muted), transparent 28%);
		color: var(--foreground);
	}

	.slot-stack :global(.slot-picker svg) {
		inline-size: 0.9rem;
		block-size: 0.9rem;
	}
</style>
