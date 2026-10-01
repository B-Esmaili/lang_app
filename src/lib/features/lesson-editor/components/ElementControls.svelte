<script lang="ts">
	import { GripVertical, SlidersHorizontal, Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		lessonDragHandle,
		type LessonDragController,
		type LessonDragSource
	} from '../interactions/lesson-drag';

	let {
		source,
		label,
		selected,
		controller,
		disabled = false,
		onselect,
		onproperties = undefined,
		onremove,
		onmove
	}: {
		source: LessonDragSource;
		label: string;
		selected: boolean;
		controller?: LessonDragController;
		disabled?: boolean;
		onselect: () => void;
		onproperties?: () => void;
		onremove: () => void;
		onmove: (direction: -1 | 1) => void;
	} = $props();
	const kind = $derived(source.kind === 'frame' ? 'frame' : 'widget');
	function keyboard(event: KeyboardEvent) {
		if (disabled || event.isComposing) return;
		if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			event.stopPropagation();
			onremove();
		} else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
			event.preventDefault();
			event.stopPropagation();
			onmove(event.key === 'ArrowUp' ? -1 : 1);
		}
	}
</script>

<div class="element-controls" class:selected dir="ltr" lang="en" data-element-controls>
	<button
		type="button"
		class="element-grip"
		data-element-grip={kind}
		aria-label={`Drag ${kind}: ${label}`}
		title={`Drag to move ${kind}. Alt+Up/Down reorders; Delete removes.`}
		{disabled}
		use:lessonDragHandle={{ controller, source, disabled }}
		onfocus={onselect}
		onclick={onselect}
		onkeydown={keyboard}><GripVertical size={16} /></button
	>
	<button
		type="button"
		class="element-label"
		class:selected
		aria-pressed={selected}
		title={`Select ${kind}: ${label}`}
		onclick={onselect}
	>
		<span class="element-kind">{kind}</span><span>{label}</span>
	</button>
	{#if onproperties}
		<Button
			type="button"
			variant="ghost"
			size="icon"
			class="element-properties"
			aria-label={`Open properties for ${label}`}
			title="Widget properties"
			{disabled}
			onclick={onproperties}><SlidersHorizontal size={15} /></Button
		>
	{/if}
	<Button
		type="button"
		variant="ghost"
		size="icon"
		class="element-delete"
		aria-label={`Delete ${kind}: ${label}`}
		title={`Delete ${kind}`}
		{disabled}
		onclick={onremove}><Trash2 size={15} /></Button
	>
</div>

<style>
	.element-controls {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		min-inline-size: 0;
		min-block-size: 2.1rem;
		color: var(--muted-foreground);
		user-select: none;
	}
	.element-grip {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		inline-size: 2.1rem;
		block-size: 2.1rem;
		border-radius: 0.4rem;
		cursor: grab;
		touch-action: none;
	}
	.element-grip:active {
		cursor: grabbing;
	}
	.element-grip:hover,
	.element-grip:focus-visible {
		background: var(--editor-selection-soft);
		color: var(--ring);
	}
	.element-grip:focus-visible,
	.element-label:focus-visible {
		outline: 0.125rem solid var(--ring);
		outline-offset: -0.125rem;
	}
	.element-label {
		display: flex;
		align-items: center;
		gap: 0.32rem;
		flex: 1;
		overflow: hidden;
		min-inline-size: 0;
		min-block-size: 1.8rem;
		border-radius: 0.4rem;
		padding-inline: 0.4rem;
		color: var(--muted-foreground);
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: start;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.element-label:hover,
	.element-label.selected {
		background: color-mix(in oklch, var(--editor-selection), transparent 88%);
		color: var(--foreground);
	}
	.element-label > span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.element-kind {
		flex: 0 0 auto;
		border-radius: 999px;
		padding: 0.08rem 0.3rem;
		background: color-mix(in oklch, var(--muted), transparent 15%);
		color: var(--muted-foreground);
		font-size: 0.52rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	:global(.element-properties) {
		color: var(--muted-foreground);
		opacity: 0.7;
	}
	.element-controls:hover :global(.element-properties),
	.element-controls:focus-within :global(.element-properties),
	.selected :global(.element-properties) {
		opacity: 1;
	}
	.element-controls :global(.element-delete) {
		margin-inline-start: auto;
		inline-size: 2.1rem;
		block-size: 2.1rem;
		color: var(--destructive);
		opacity: 0;
	}
	.selected :global(.element-delete),
	.element-controls:hover :global(.element-delete),
	.element-controls:focus-within :global(.element-delete) {
		opacity: 1;
	}
	@media (hover: none) {
		.element-controls :global(.element-delete) {
			opacity: 1;
		}
	}
</style>
