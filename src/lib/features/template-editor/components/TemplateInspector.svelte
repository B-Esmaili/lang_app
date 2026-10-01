<script lang="ts">
	import {
		ArrowDown,
		ArrowUp,
		Copy,
		GripVertical,
		Layers,
		Plus,
		SlidersHorizontal,
		Trash2
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import type {
		LayoutGap,
		LayoutPreviewMode,
		TemplateDefinition
	} from '$lib/features/lesson-editor/model';
	import { dragHandle, type DragHandleOptions, type DragState } from '../drag-handle';
	import {
		applyLayoutPreset,
		getOrderedSlots,
		isRegionFullWidth,
		LAYOUT_GAP_OPTIONS,
		LAYOUT_PRESETS,
		type LayoutPresetId
	} from '../model';
	let {
		definition,
		mode,
		selectedId,
		readOnly = false,
		busy = false,
		insertId = 'new-region',
		drag = null,
		dragOptions,
		onselect,
		onpreset,
		onweight,
		ongap,
		onpadding,
		onfullwidth,
		onmove,
		onremove,
		onadd,
		onlabel,
		ondescription,
		oncopyLayout
	}: {
		definition: TemplateDefinition;
		mode: LayoutPreviewMode;
		selectedId: string | null;
		readOnly?: boolean;
		busy?: boolean;
		insertId?: string;
		drag?: DragState | null;
		dragOptions: (id: string) => DragHandleOptions;
		onselect: (id: string) => void;
		onpreset: (id: LayoutPresetId) => void;
		onweight: (index: number, value: number) => void;
		ongap: (gap: LayoutGap) => void;
		onpadding: (padding: LayoutGap) => void;
		onfullwidth: (id: string, full: boolean) => void;
		onmove: (id: string, direction: -1 | 1) => void;
		onremove: (id: string) => void;
		onadd: () => void;
		onlabel: (id: string, label: string) => void;
		ondescription: (id: string, description: string) => void;
		oncopyLayout: (from: LayoutPreviewMode) => void;
	} = $props();
	const layout = $derived(definition.variants[mode]);
	const slots = $derived(getOrderedSlots(definition, mode));
	const activePresetId = $derived(
		LAYOUT_PRESETS.find(
			(preset) =>
				preset.columnWeights.length <= slots.length &&
				(preset.minimumRegions ?? 0) <= slots.length &&
				applyLayoutPreset(definition, mode, preset.id) === definition
		)?.id ?? null
	);
	const selected = $derived(definition.slots.find((slot) => slot.id === selectedId));
	const selectedIndex = $derived(slots.findIndex((slot) => slot.id === selectedId));
	const selectedFullWidth = $derived(
		selected ? isRegionFullWidth(definition, mode, selected.id) : false
	);
	const disabled = $derived(readOnly || busy);
	const deviceLabels = { desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' };
	let copyFrom = $state<LayoutPreviewMode | ''>('');
</script>

<aside class="properties" aria-label="Layout properties">
	<header class="properties-heading">
		<SlidersHorizontal size={17} aria-hidden="true" />
		<h2>Properties</h2>
	</header>
	<section>
		<div class="section-heading">
			<h3>{deviceLabels[mode]} arrangement</h3>
			<span class="device-tag">{mode}</span>
		</div>
		<p class="help">Applying a pattern rearranges this device’s regions.</p>
		<div class="presets" role="group" aria-label="Layout patterns">
			{#each LAYOUT_PRESETS as preset (preset.id)}
				<button
					type="button"
					class:active={activePresetId === preset.id}
					aria-pressed={activePresetId === preset.id}
					title={preset.description}
					disabled={disabled ||
						preset.columnWeights.length > slots.length ||
						(preset.minimumRegions ?? 0) > slots.length}
					onclick={() => onpreset(preset.id)}
				>
					<span class="preset-picture" data-preset={preset.id} aria-hidden="true"
						>{#each [0, 1, 2, 3] as i (i)}<i></i>{/each}</span
					>
					<span>{preset.label}</span>
				</button>
			{/each}
		</div>
		<label class="field-row"
			><span>Space between</span><select
				value={layout.gap}
				{disabled}
				onchange={(event) => ongap(event.currentTarget.value as LayoutGap)}
				>{#each LAYOUT_GAP_OPTIONS as gap (gap.id)}<option value={gap.id}>{gap.label}</option
					>{/each}</select
			></label
		>
		<label class="field-row">
			<span>Inner padding</span>
			<select
				aria-label="Inner padding"
				value={layout.padding ?? 'none'}
				{disabled}
				onchange={(event) => onpadding(event.currentTarget.value as LayoutGap)}
			>
				{#each LAYOUT_GAP_OPTIONS as padding (padding.id)}
					<option value={padding.id}>{padding.label}</option>
				{/each}
			</select>
		</label>
		<p class="help">Height fits the content. Spacing scales with the reading size.</p>
		{#if layout.columnWeights.length > 1}
			<div class="weights">
				<span class="field-title">Column proportions</span>
				{#each layout.columnWeights as weight, index (index)}<label
						><span>Column {index + 1}</span><input
							aria-label={`Column ${index + 1} proportion`}
							type="range"
							min={Math.min(0.25, weight)}
							max={Math.max(5, weight)}
							step="any"
							value={weight}
							aria-valuetext={`${weight} relative ${weight === 1 ? 'part' : 'parts'}`}
							{disabled}
							oninput={(event) => onweight(index, Number(event.currentTarget.value))}
						/><output title={`${weight} relative parts`}>{Number(weight.toFixed(3))}fr</output
						></label
					>{/each}
			</div>
		{/if}
		<div class="copy-layout">
			<Copy size={15} aria-hidden="true" /><select
				aria-label="Copy arrangement from"
				bind:value={copyFrom}
				{disabled}
				onchange={() => {
					if (copyFrom) {
						oncopyLayout(copyFrom);
						copyFrom = '';
					}
				}}
				><option value="">Copy device layout…</option
				>{#each ['desktop', 'tablet', 'phone'] as device (device)}{#if device !== mode}<option
							value={device}>{deviceLabels[device as LayoutPreviewMode]}</option
						>{/if}{/each}</select
			>
		</div>
	</section>

	<section>
		<div class="section-heading">
			<h3><Layers size={16} aria-hidden="true" />Content regions</h3>
			<span class="count" aria-label={`${slots.length} of 12 regions`}>{slots.length}/12</span>
		</div>
		<p class="help">Drag to change the reading order.</p>
		<ol class="region-list" aria-label={`${deviceLabels[mode]} region order`}>
			{#each slots as slot, index (slot.id)}
				<li
					class:active={slot.id === selectedId}
					class:dragging={drag?.sourceId === slot.id}
					class:drop-target={drag?.targetId === slot.id}
					data-drop-id={slot.id}
					data-drop-axis="vertical"
					data-placement={drag?.targetId === slot.id ? drag.placement : undefined}
				>
					<button
						type="button"
						class="drag-handle"
						{disabled}
						use:dragHandle={dragOptions(slot.id)}
						aria-label={`Reorder ${slot.label || 'untitled region'}`}
						aria-describedby="template-drag-help"
						title="Drag to reorder · Space for keyboard controls"
						><GripVertical size={17} aria-hidden="true" /></button
					>
					<button
						type="button"
						class="select-region"
						aria-label={`Select ${slot.label || 'untitled'} region`}
						aria-pressed={slot.id === selectedId}
						onclick={() => onselect(slot.id)}
						><span dir="auto">{slot.label || 'Untitled region'}</span><small aria-hidden="true"
							>{String(index + 1).padStart(2, '0')}</small
						></button
					>
				</li>
			{/each}
		</ol>
		<button
			type="button"
			class="insert-region"
			disabled={disabled || slots.length >= 12}
			use:dragHandle={dragOptions(insertId)}
			onclick={onadd}
			aria-describedby="template-drag-help"
			title="Click to add or drag onto the document"
			><Plus size={17} aria-hidden="true" /><span>Add content region</span><GripVertical
				size={16}
				aria-hidden="true"
			/></button
		>
	</section>

	{#if selected}
		<section class="selected-properties">
			<div class="section-heading">
				<h3>Selected region</h3>
				<span class="selection-dot" aria-hidden="true"></span>
			</div>
			<label class="field"
				><span>Name</span><input
					aria-label="Region name"
					dir="auto"
					maxlength="100"
					value={selected.label}
					{disabled}
					oninput={(event) => onlabel(selected.id, event.currentTarget.value)}
				/></label
			>
			<label class="field"
				><span>Description</span><textarea
					aria-label="Region description"
					dir="auto"
					rows="2"
					maxlength="300"
					placeholder="What belongs in this region?"
					value={selected.description ?? ''}
					{disabled}
					oninput={(event) => ondescription(selected.id, event.currentTarget.value)}
				></textarea></label
			>
			<Button
				variant={selectedFullWidth ? 'secondary' : 'outline'}
				size="sm"
				aria-pressed={selectedFullWidth}
				disabled={disabled || layout.columnWeights.length <= 1 || slots.length <= 1}
				onclick={() => onfullwidth(selected.id, !selectedFullWidth)}
			>
				Use full row
			</Button>
			<p class="help">
				{layout.columnWeights.length <= 1
					? 'Every region fills the width in a single-column layout.'
					: 'Give this region its own row, or share a row with neighboring content.'}
			</p>
			<div class="region-actions">
				<Button
					variant="outline"
					size="icon"
					class="move-region"
					aria-label="Move selected region earlier"
					title="Move earlier"
					disabled={disabled || selectedIndex <= 0}
					onclick={() => onmove(selected.id, -1)}><ArrowUp aria-hidden="true" /></Button
				><Button
					variant="outline"
					size="icon"
					class="move-region"
					aria-label="Move selected region later"
					title="Move later"
					disabled={disabled || selectedIndex < 0 || selectedIndex === slots.length - 1}
					onclick={() => onmove(selected.id, 1)}><ArrowDown aria-hidden="true" /></Button
				><Button
					variant="ghost"
					class="remove-region"
					size="sm"
					disabled={disabled || slots.length <= 1}
					onclick={() => onremove(selected.id)}
					><Trash2 size={15} aria-hidden="true" />Remove</Button
				>
			</div>
		</section>
	{/if}
	<p class="properties-note">
		Regions share their content across devices. The lesson sets its reading direction, including
		Persian and Arabic.
	</p>
</aside>

<style>
	.properties {
		min-inline-size: 0;
		background: #fff;
		color: #393340;
	}
	.properties-heading {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 1.2rem 1rem;
		color: #7c708a;
		border-block-end: 0.0625rem solid #eeeaf0;
	}
	.properties-heading h2 {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 650;
		color: #453b50;
	}
	section {
		padding: 1.1rem 1rem;
		display: grid;
		gap: 0.9rem;
		border-block-end: 0.0625rem solid #eeeaf0;
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.875rem;
		margin: 0;
		font-weight: 650;
	}
	.device-tag {
		font-size: 0.75rem;
		padding: 0.18rem 0.4rem;
		border-radius: 0.3rem;
		background: #f2edf8;
		color: #71518e;
		text-transform: capitalize;
	}
	.count {
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: #73617e;
	}
	.help {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: #6f637a;
		margin: -0.5rem 0 0;
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}
	.presets button {
		display: grid;
		gap: 0.4rem;
		justify-items: center;
		padding: 0.6rem;
		border: 0.0625rem solid #e6e0ec;
		border-radius: 0.5rem;
		color: #6f587f;
		background: #fff;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.presets button:hover,
	.presets button.active {
		border-color: #b199ce;
		background: #f7f3fb;
		color: #7d5ba7;
	}
	.presets button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.preset-picture {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-auto-rows: 1fr;
		inline-size: 2.75rem;
		gap: 0.16rem;
		block-size: 1.6rem;
	}
	.preset-picture i {
		background: #d8cbe8;
		border-radius: 0.12rem;
	}
	.preset-picture[data-preset='stack'] {
		grid-template-columns: 1fr;
	}
	.preset-picture[data-preset='split'] i:nth-child(n + 3),
	.preset-picture[data-preset='sidebar'] i:nth-child(n + 3) {
		display: none;
	}
	.preset-picture[data-preset='sidebar'] {
		grid-template-columns: 2fr 1fr;
	}
	.preset-picture[data-preset='three'] {
		grid-template-columns: repeat(3, 1fr);
	}
	.preset-picture[data-preset='three'] i:last-child,
	.preset-picture[data-preset='asymmetric'] i:last-child,
	.preset-picture[data-preset='rail'] i:last-child {
		display: none;
	}
	.preset-picture[data-preset='rail'],
	.preset-picture[data-preset='asymmetric'] {
		grid-template-columns: 1fr 2fr 1fr;
	}
	.preset-picture[data-preset='asymmetric'] {
		grid-template-columns: 3fr 2fr 1fr;
	}
	.preset-picture[data-preset='timeline'] {
		grid-template-columns: 1fr 3fr;
	}
	.preset-picture[data-preset='hero'],
	.preset-picture[data-preset='magazine'] {
		grid-template-columns: repeat(2, 1fr);
	}
	.preset-picture[data-preset='hero'] i:first-child,
	.preset-picture[data-preset='magazine'] i:first-child,
	.preset-picture[data-preset='focus'] i:nth-child(-n + 2) {
		grid-column: 1 / -1;
	}
	.preset-picture[data-preset='focus'] {
		grid-template-columns: repeat(2, 1fr);
	}
	.field-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: #6f637a;
	}
	select,
	input:not([type='range']),
	textarea {
		inline-size: 100%;
		min-inline-size: 0;
		min-block-size: 2.5rem;
		padding: 0.45rem 0.55rem;
		border: 0.0625rem solid #e5deeb;
		border-radius: 0.45rem;
		color: #504659;
		background: #fff;
		font-size: 0.8125rem;
		outline: none;
	}
	input[dir='auto'],
	textarea {
		font-family: var(--font-sans), var(--font-arabic), sans-serif;
	}
	textarea {
		resize: vertical;
		line-height: 1.65;
	}
	input::placeholder,
	textarea::placeholder {
		color: #7a6b87;
	}
	input:focus-visible,
	textarea:focus-visible,
	select:focus-visible,
	button:focus-visible {
		outline: 0.12rem solid #ad92cd;
		outline-offset: 0.12rem;
	}
	input:disabled,
	textarea:disabled,
	select:disabled {
		opacity: 0.6;
	}
	.field-row select {
		inline-size: auto;
		max-inline-size: 55%;
	}
	.weights {
		display: grid;
		gap: 0.75rem;
	}
	.field-title {
		color: #6f637a;
		font-size: 0.8125rem;
	}
	.weights label {
		display: grid;
		grid-template-columns: 4.25rem minmax(0, 1fr) 2.6rem;
		align-items: center;
		gap: 0.4rem;
		color: #6f637a;
		font-size: 0.75rem;
	}
	.weights input {
		inline-size: 100%;
		min-inline-size: 0;
		min-block-size: 2.5rem;
		accent-color: #9275b5;
		cursor: ew-resize;
	}
	.weights output {
		text-align: end;
		color: #776585;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	.copy-layout {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		color: #73617e;
	}
	.copy-layout :global(svg) {
		flex: 0 0 auto;
	}
	.copy-layout select {
		border: 0;
		background: #f7f5f9;
		font-size: 0.75rem;
		min-block-size: 2.5rem;
	}
	.region-list {
		display: grid;
		gap: 0.35rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.region-list li {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.2rem;
		border: 0.0625rem solid transparent;
		border-radius: 0.5rem;
		background: #f7f6f9;
	}
	.region-list li.active {
		border-color: #d2bfe8;
		background: #f2ecf9;
	}
	.region-list li.dragging {
		opacity: 0.45;
	}
	.region-list li.drop-target {
		outline: 0.12rem solid #b195cf;
	}
	.region-list li.drop-target::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		block-size: 0.15rem;
		background: #9675bf;
	}
	.region-list li[data-placement='before']::after {
		inset-block-start: -0.2rem;
	}
	.region-list li[data-placement='after']::after {
		inset-block-end: -0.2rem;
	}
	.drag-handle {
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 0.3rem;
		background: transparent;
		color: #785b98;
		inline-size: 2.5rem;
		block-size: 2.5rem;
		flex-shrink: 0;
		cursor: grab;
		touch-action: none;
	}
	.drag-handle:disabled {
		cursor: default;
		opacity: 0.4;
	}
	.drag-handle:hover:not(:disabled),
	.drag-handle:focus-visible {
		background: #eadef7;
		color: #705195;
	}
	.select-region {
		flex: 1;
		min-inline-size: 0;
		min-block-size: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border: 0;
		padding: 0.5rem 0.4rem;
		background: transparent;
		cursor: pointer;
		color: #655474;
		text-align: start;
	}
	.select-region span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.8125rem;
		font-weight: 550;
	}
	.select-region small {
		color: #796388;
		font-size: 0.75rem;
	}
	.insert-region {
		display: flex;
		min-block-size: 2.75rem;
		align-items: center;
		gap: 0.4rem;
		padding: 0.65rem 0.4rem;
		border: 0.0625rem dashed #d8cbe5;
		border-radius: 0.5rem;
		background: transparent;
		color: #785593;
		font-size: 0.8125rem;
		cursor: grab;
		touch-action: none;
	}
	.insert-region span {
		flex: 1;
		text-align: start;
	}
	.insert-region:hover {
		background: #f7f2fc;
	}
	.insert-region:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.field {
		display: grid;
		gap: 0.45rem;
	}
	.field > span {
		font-size: 0.8125rem;
		color: #6f637a;
	}
	.selection-dot {
		inline-size: 0.4rem;
		block-size: 0.4rem;
		border-radius: 50%;
		background: #ab8ace;
	}
	.region-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.region-actions :global(.move-region) {
		inline-size: 2.5rem;
		block-size: 2.5rem;
	}
	.region-actions :global(.remove-region) {
		margin-inline-start: auto;
		min-block-size: 2.5rem;
		font-size: 0.8125rem;
		color: #925568;
	}
	.properties-note {
		margin: 1rem;
		padding: 0.8rem;
		background: #eff5f1;
		border-radius: 0.5rem;
		color: #536e5e;
		font-size: 0.8125rem;
		line-height: 1.7;
	}
</style>
