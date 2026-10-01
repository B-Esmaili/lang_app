<script lang="ts">
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2';
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import ResponsiveLayout from '$lib/features/lesson-editor/components/ResponsiveLayout.svelte';
	import type { LayoutPreviewMode, TemplateDefinition } from '$lib/features/lesson-editor/model';
	import { columnResize, type ColumnResizeMetrics } from '../column-resize';
	import { dragHandle, type DragHandleOptions, type DragState } from '../drag-handle';

	let {
		definition,
		mode,
		selectedId,
		preview = false,
		readOnly = false,
		busy = false,
		resizing = false,
		drag = null,
		dragOptions,
		onselect,
		onadd,
		onresizestart,
		onresizeinput,
		onresizecommit,
		onresizecancel
	}: {
		definition: TemplateDefinition;
		mode: LayoutPreviewMode;
		selectedId: string | null;
		preview?: boolean;
		readOnly?: boolean;
		busy?: boolean;
		resizing?: boolean;
		drag?: DragState | null;
		dragOptions: (id: string) => DragHandleOptions;
		onselect: (id: string, inspect?: boolean) => void;
		onadd: () => void;
		onresizestart: (index: number) => void;
		onresizeinput: (ratio: number) => void;
		onresizecommit: () => void;
		onresizecancel: () => void;
	} = $props();

	let paper: HTMLDivElement;
	let responsivePreview = $state(false);
	let previewWidthRem = $state(64);
	let actualMode = $state<LayoutPreviewMode>(untrack(() => mode));
	const visibleMode = $derived(preview && responsivePreview ? actualMode : mode);
	const layout = $derived(definition.variants[visibleMode]);
	const deviceLabels: Record<LayoutPreviewMode, string> = {
		desktop: 'Desktop',
		tablet: 'Tablet',
		phone: 'Phone'
	};
	const sampleText = [
		{
			kicker: 'Reading passage',
			title: 'A calm place for language',
			body: 'Select this text naturally, then place vocabulary, pronunciation, and listening activities around it.'
		},
		{
			kicker: 'نمونهٔ فارسی',
			title: 'یادگیری با متن زنده',
			body: 'این متن فارسی برای بررسی انتخاب متن، جهت راست به چپ و نمایش درست حروف در طرح قرار گرفته است.'
		},
		{
			kicker: 'Guided practice',
			title: 'Listen, notice, respond',
			body: 'Each region can hold reusable learning widgets while the lesson keeps a clear reading flow.'
		}
	];

	$effect(() => {
		void mode;
		untrack(() => {
			responsivePreview = false;
		});
	});

	function dividerBoundary(index: number) {
		const total = layout.columnWeights.reduce((sum, value) => sum + value, 0) || 1;
		const before = layout.columnWeights.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
		return (before / total) * 100;
	}

	function resizeMetrics(index: number): ColumnResizeMetrics | null {
		const grid = paper?.querySelector<HTMLElement>('[data-layout-engine="css-grid"]');
		const left = layout.columnWeights[index];
		const right = layout.columnWeights[index + 1];
		if (!grid || !left || !right) return null;
		const style = getComputedStyle(grid);
		const totalWeight = layout.columnWeights.reduce((sum, value) => sum + value, 0);
		const gap = Number.parseFloat(style.columnGap) || 0;
		const padding =
			(Number.parseFloat(style.paddingInlineStart) || 0) +
			(Number.parseFloat(style.paddingInlineEnd) || 0);
		const trackWidth = Math.max(
			1,
			grid.clientWidth - padding - gap * Math.max(0, layout.columnWeights.length - 1)
		);
		return {
			ratio: left / (left + right),
			span: Math.max(1, trackWidth * ((left + right) / totalWeight)),
			direction: style.direction === 'rtl' ? 'rtl' : 'ltr'
		};
	}

	function resizeOptions(index: number) {
		return {
			disabled: preview || readOnly || busy,
			getMetrics: () => resizeMetrics(index),
			pointerMetrics: () => resizeMetrics(index),
			onstart: () => onresizestart(index),
			oninput: onresizeinput,
			oncommit: onresizecommit,
			oncancel: onresizecancel
		};
	}
</script>

<section
	class="design-document"
	class:preview
	data-viewport={preview && responsivePreview ? 'auto' : mode}
	aria-label={`${deviceLabels[mode]} layout document`}
>
	{#if preview}
		<div class="responsive-preview-controls">
			<label class="follow-width">
				<input type="checkbox" bind:checked={responsivePreview} />Follow preview width
			</label>
			<label class="preview-width">
				<span>Width</span>
				<input
					aria-label="Responsive preview width"
					type="range"
					min="18"
					max="80"
					step="1"
					value={previewWidthRem}
					oninput={(event) => {
						previewWidthRem = Number(event.currentTarget.value);
						responsivePreview = true;
					}}
				/>
				<output>{previewWidthRem}rem</output>
			</label>
		</div>
	{/if}

	<div class="document-heading">
		<span><i aria-hidden="true"></i>{deviceLabels[visibleMode]} layout</span>
		<small>
			{preview
				? 'Selectable sample content'
				: `${definition.slots.length} content ${definition.slots.length === 1 ? 'region' : 'regions'}`}
		</small>
	</div>

	<div
		bind:this={paper}
		class="document-paper"
		data-template-document
		style:inline-size={preview && responsivePreview
			? `min(100%, ${previewWidthRem}rem)`
			: undefined}
	>
		<ResponsiveLayout
			template={definition}
			previewMode={preview && responsivePreview ? 'auto' : mode}
			onmodechange={(value) => {
				actualMode = value;
			}}
			class="template-layout"
		>
			{#snippet children(slot)}
				{@const index = definition.slots.findIndex((item) => item.id === slot.id)}
				{@const sample = sampleText[(index < 0 ? 0 : index) % sampleText.length]}
				<section
					class="content-region"
					data-template-region
					class:selected={!preview && slot.id === selectedId}
					class:dragging={drag?.sourceId === slot.id}
					class:drop-target={drag?.targetId === slot.id}
					data-drop-id={slot.id}
					data-drop-axis="horizontal"
					data-placement={drag?.targetId === slot.id ? drag.placement : undefined}
					aria-label={slot.label || 'Untitled content region'}
				>
					{#if !preview}
						<button
							type="button"
							class="region-grip"
							data-template-region-grip
							disabled={readOnly || busy || resizing}
							use:dragHandle={dragOptions(slot.id)}
							aria-label={`Reorder ${slot.label || 'untitled region'}`}
							aria-describedby="template-document-help"
							title="Drag to reorder · Space for keyboard controls"
							onclick={() => onselect(slot.id)}
						>
							<GripVertical aria-hidden="true" />
						</button>
						<button
							type="button"
							class="region-select"
							disabled={readOnly || busy || resizing}
							aria-pressed={slot.id === selectedId}
							onclick={() => onselect(slot.id, true)}>Edit region</button
						>
					{/if}
					<p class="region-kicker" dir="auto">{sample.kicker}</p>
					<h3 dir="auto">{slot.label || sample.title}</h3>
					<p class="region-copy" dir="auto">{slot.description || sample.body}</p>
					<div class="sample-lines" aria-hidden="true"><i></i><i></i><i></i></div>
				</section>
			{/snippet}
		</ResponsiveLayout>

		{#if !preview && !readOnly && layout.columnWeights.length > 1}
			<div class="column-guides" aria-label="Column dividers">
				{#each layout.columnWeights.slice(0, -1) as weight, index (index)}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex (ARIA separator is keyboard-adjustable through the columnResize action.) -->
					<div
						class="column-divider"
						data-column-weight={weight}
						class:active={resizing}
						style={`--divider-position: ${dividerBoundary(index)}%`}
						use:columnResize={resizeOptions(index)}
						role="separator"
						tabindex="0"
						aria-orientation="vertical"
						aria-label={`Resize columns ${index + 1} and ${index + 2}`}
						aria-valuemin="10"
						aria-valuemax="90"
						aria-valuenow={Math.round(
							(layout.columnWeights[index] /
								(layout.columnWeights[index] + layout.columnWeights[index + 1])) *
								100
						)}
					></div>
				{/each}
			</div>
		{/if}
	</div>

	{#if !preview && !readOnly}
		<Button
			variant="outline"
			class="add-region"
			onclick={onadd}
			disabled={busy || resizing || !!drag || definition.slots.length >= 12}
		>
			<Plus size={16} aria-hidden="true" />Add region
		</Button>
	{/if}

	<div class="document-footer">
		<MousePointer2 size={15} aria-hidden="true" />
		<p>
			{preview
				? 'Text stays selectable. Lesson frames remain borderless unless their author adds a border.'
				: readOnly
					? 'Make a copy of this starter layout to customize it.'
					: 'Select text freely. Use a region grip to rearrange or a column divider to resize.'}
		</p>
	</div>
	<p id="template-document-help" class="sr-only">
		Space picks up or drops a focused region grip. Arrow keys choose its position and Escape
		cancels. Double-click a region to open its properties. Region text remains available for native
		selection on mouse and touch screens.
	</p>
</section>

<style>
	.design-document {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.35rem;
		min-inline-size: 0;
		min-block-size: 38rem;
		padding: clamp(1.2rem, 3cqi, 2.5rem);
		background-color: #f7f6f3;
		background-image: radial-gradient(#b0a3bf38 0.04rem, transparent 0.06rem);
		background-size: 1.1rem 1.1rem;
	}
	.document-heading {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		inline-size: 100%;
		max-inline-size: none;
		color: #6f637a;
	}
	.document-heading > span {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 650;
	}
	.document-heading i {
		inline-size: 0.4rem;
		block-size: 0.4rem;
		border-radius: 50%;
		background: #ad98c7;
	}
	.document-heading small {
		font-size: 0.75rem;
	}
	.document-paper {
		position: relative;
		inline-size: 100%;
		max-inline-size: none;
		min-block-size: 25rem;
		padding: clamp(1rem, 3cqi, 2.25rem);
		border: 0.0625rem solid #e8e3ea;
		border-radius: 0.75rem;
		background: #fffefd;
		box-shadow: 0 1.5rem 4rem #3e27400f;
		isolation: isolate;
		transition: inline-size 180ms ease;
	}
	.design-document[data-viewport='tablet'] .document-paper,
	.design-document[data-viewport='tablet'] .document-heading {
		max-inline-size: 42rem;
	}
	.design-document[data-viewport='phone'] .document-paper,
	.design-document[data-viewport='phone'] .document-heading {
		max-inline-size: 23rem;
	}
	.document-paper :global(.template-layout) {
		min-block-size: 20rem;
		align-content: stretch;
	}
	.content-region {
		position: relative;
		display: flex;
		flex-direction: column;
		min-block-size: 9rem;
		block-size: 100%;
		min-inline-size: 0;
		gap: 0.6rem;
		padding: clamp(0.85rem, 2.4cqi, 1.4rem);
		border-radius: 0.6rem;
		outline: 0.0625rem dashed #cfc4d73d;
		outline-offset: -0.0625rem;
		background: color-mix(in oklab, #f5f0f9 34%, transparent);
		color: #393340;
		transition:
			opacity 120ms ease,
			outline-color 120ms ease,
			background-color 120ms ease;
		user-select: text;
	}
	.preview .content-region {
		outline-color: transparent;
		background: transparent;
	}
	.content-region.selected {
		outline: 0.125rem solid #aa8bc9;
		outline-offset: 0.15rem;
		background: #faf7fc;
	}
	.content-region.dragging {
		opacity: 0.4;
	}
	.content-region.drop-target::after {
		content: '';
		position: absolute;
		z-index: 3;
		inset-block: 0.4rem;
		inline-size: 0.18rem;
		border-radius: 999px;
		background: #8d68ba;
	}
	.content-region.drop-target[data-placement='before']::after {
		inset-inline-start: -0.3rem;
	}
	.content-region.drop-target[data-placement='after']::after {
		inset-inline-end: -0.3rem;
	}
	.region-grip {
		position: absolute;
		z-index: 4;
		inset-block-start: 0.35rem;
		inset-inline-end: 0.35rem;
		display: grid;
		place-items: center;
		inline-size: 2.5rem;
		block-size: 2.5rem;
		border: 0;
		border-radius: 0.45rem;
		background: #ffffffd9;
		color: #77568f;
		cursor: grab;
		touch-action: none;
	}
	.region-grip:hover:not(:disabled),
	.region-grip:focus-visible {
		background: #eee4f7;
		outline: 0.125rem solid #a88bc5;
		outline-offset: 0.1rem;
	}
	.region-grip:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.region-grip :global(svg) {
		inline-size: 1rem;
		block-size: 1rem;
	}
	.region-select {
		position: absolute;
		z-index: 4;
		inset-block-start: 0.35rem;
		inset-inline-end: 3.1rem;
		min-block-size: 2.5rem;
		padding-inline: 0.65rem;
		border: 0;
		border-radius: 0.45rem;
		background: #ffffffd9;
		color: #77568f;
		font-size: 0.7rem;
		font-weight: 650;
		cursor: pointer;
	}
	.region-select:hover:not(:disabled),
	.region-select:focus-visible,
	.region-select[aria-pressed='true'] {
		background: #eee4f7;
		outline: 0.125rem solid #a88bc5;
		outline-offset: 0.1rem;
	}
	.region-select:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.region-kicker,
	.region-copy,
	.content-region h3 {
		margin: 0;
		unicode-bidi: plaintext;
		text-align: start;
	}
	.region-kicker {
		padding-inline-end: 6rem;
		color: #8a739d;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.content-region h3 {
		font-family: var(--font-serif, Georgia, serif);
		font-size: clamp(1rem, 2.2cqi, 1.35rem);
		line-height: 1.35;
	}
	.region-copy {
		max-inline-size: 46ch;
		color: #6b606f;
		font-family: var(--font-content, 'Segoe UI', Tahoma, Arial, sans-serif);
		font-size: clamp(0.8rem, 1.5cqi, 0.95rem);
		line-height: 1.75;
	}
	.region-copy:lang(fa),
	.region-copy:lang(ar) {
		font-family: var(--font-content-arabic, Tahoma, 'Segoe UI', Arial, sans-serif);
	}
	.sample-lines {
		display: grid;
		gap: 0.35rem;
		margin-block-start: auto;
		opacity: 0.45;
	}
	.sample-lines i {
		block-size: 0.25rem;
		border-radius: 999px;
		background: #c9b6d7;
	}
	.sample-lines i:nth-child(1) {
		inline-size: 42%;
	}
	.sample-lines i:nth-child(2) {
		inline-size: 78%;
	}
	.sample-lines i:nth-child(3) {
		inline-size: 61%;
	}
	.column-guides {
		position: absolute;
		z-index: 6;
		inset: 1rem;
		pointer-events: none;
	}
	.column-divider {
		position: absolute;
		inset-block: 0;
		inset-inline-start: var(--divider-position);
		inline-size: 1.75rem;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: col-resize;
		pointer-events: auto;
		transform: translateX(-50%);
		touch-action: none;
	}
	.column-divider::before {
		content: '';
		position: absolute;
		inset-block: 0;
		inset-inline-start: 50%;
		inline-size: 0.125rem;
		border-radius: 999px;
		background: #a98bc947;
		transform: translateX(-50%);
		transition:
			inline-size 100ms ease,
			background-color 100ms ease;
	}
	.column-divider:hover::before,
	.column-divider:focus-visible::before,
	.column-divider.active::before {
		inline-size: 0.22rem;
		background: #8c65ba;
	}
	.column-divider:focus-visible {
		outline: 0.125rem solid #a88bc5;
		outline-offset: 0.15rem;
	}
	.responsive-preview-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		inline-size: min(100%, 40rem);
		padding: 0.75rem 1rem;
		border-radius: 0.65rem;
		background: #fff;
		color: #776487;
		font-size: 0.75rem;
	}
	.follow-width {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-block-size: 2rem;
	}
	.follow-width input,
	.preview-width input {
		accent-color: #9275b5;
	}
	.preview-width {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		flex: 1;
		min-inline-size: 12rem;
	}
	.preview-width input {
		flex: 1;
		min-inline-size: 3rem;
	}
	.preview-width output {
		min-inline-size: 3.5rem;
		text-align: end;
		font-variant-numeric: tabular-nums;
	}
	.document-footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		max-inline-size: 32rem;
		margin-block-start: auto;
		color: #6f637a;
	}
	.document-footer p {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.55;
		text-align: center;
	}
	.document-footer :global(svg) {
		flex-shrink: 0;
	}
	.design-document :global(.add-region) {
		min-block-size: 2.5rem;
		border-style: dashed;
		background: #ffffff80;
		color: #8065b4;
		font-size: 0.8125rem;
	}
</style>
