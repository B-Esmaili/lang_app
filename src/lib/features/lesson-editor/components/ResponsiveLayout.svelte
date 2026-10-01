<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import type {
		LayoutPreviewMode,
		PreviewMode,
		TemplateDefinition,
		TemplateSlotDefinition,
		TextDirection
	} from '../model/types';
	import {
		modeForWidth,
		relativeGridColumns,
		relativeGridSpace,
		responsiveSlots
	} from '../layout/responsive-layout';
	let {
		template,
		previewMode,
		children: renderSlot,
		direction,
		onmodechange,
		class: className = ''
	}: {
		template: TemplateDefinition;
		previewMode: PreviewMode;
		children: Snippet<[TemplateSlotDefinition]>;
		direction?: TextDirection;
		onmodechange?: (mode: LayoutPreviewMode) => void;
		class?: string;
	} = $props();
	let root: HTMLDivElement;
	let measuredMode = $state<LayoutPreviewMode>('phone');
	const mode = $derived(previewMode === 'auto' ? measuredMode : previewMode);
	const layout = $derived(template.variants[mode]);
	const slots = $derived(responsiveSlots(template, mode));
	$effect(() => {
		const next = mode;
		untrack(() => onmodechange?.(next));
	});
	onMount(() => {
		const measure = () => {
			const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
			measuredMode = modeForWidth(root.getBoundingClientRect().width, rem);
		};
		const observer = new ResizeObserver(measure);
		observer.observe(root);
		const fonts = new MutationObserver(measure);
		fonts.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['style', 'class']
		});
		window.addEventListener('resize', measure);
		measure();
		return () => {
			observer.disconnect();
			fonts.disconnect();
			window.removeEventListener('resize', measure);
		};
	});
</script>

<div
	bind:this={root}
	class={`responsive-layout ${className}`}
	data-layout-engine="css-grid"
	data-layout-mode={mode}
	style:grid-template-columns={relativeGridColumns(layout)}
	style:gap={relativeGridSpace(layout.gap)}
	style:padding={relativeGridSpace(layout.padding)}
	dir={direction}
>
	{#each slots as { slot, placement } (slot.id)}
		<div
			class="layout-slot"
			data-layout-slot={slot.id}
			style:grid-column={`${placement.columnStart} / ${placement.columnEnd}`}
			style:grid-row={`${placement.rowStart} / ${placement.rowEnd}`}
		>
			{@render renderSlot(slot)}
		</div>
	{/each}
</div>

<style>
	.responsive-layout {
		display: grid;
		inline-size: 100%;
		min-inline-size: 0;
		align-items: stretch;
	}
	.layout-slot {
		min-inline-size: 0;
		overflow-wrap: anywhere;
	}
</style>
