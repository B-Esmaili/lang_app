<script lang="ts">
	import { untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import {
		Check,
		Copy,
		Eye,
		LayoutGrid,
		LoaderCircle,
		Monitor,
		Pencil,
		Redo2,
		Save,
		Smartphone,
		Sparkles,
		Tablet,
		Trash2,
		Undo2
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { createEntityId, type LessonTemplateRecord } from '$lib/features/course-builder/model';
	import {
		validateTemplateDefinition,
		type LayoutPreviewMode,
		type TemplateDefinition,
		type TemplateSlotDefinition
	} from '$lib/features/lesson-editor/model';
	import type { DragHandleOptions, DragState } from './drag-handle';
	import { resizeColumnPair } from './column-resize';
	import {
		applyLayoutPreset,
		createBlankTemplate,
		getOrderedSlots,
		insertRegionAndReflow,
		MAX_TEMPLATE_REGIONS,
		removeRegion,
		reorderRegion,
		setColumnWeight,
		setLayoutGap,
		setLayoutPadding,
		setRegionFullWidth,
		type DropPlacement
	} from './model';
	import TemplateLibrary from './components/TemplateLibrary.svelte';
	import TemplateDocument from './components/TemplateDocument.svelte';
	import TemplateInspector from './components/TemplateInspector.svelte';
	import TemplateConfirmation from './components/TemplateConfirmation.svelte';

	let { initialTemplates = [] }: { initialTemplates?: LessonTemplateRecord[] } = $props();
	const initial = untrack(() => structuredClone($state.snapshot(initialTemplates)));
	const initialRecord = initial.find((item) => !item.isSystem) ?? initial[0];
	const initialDefinition = structuredClone(
		initialRecord?.definition ?? createBlankTemplate(createEntityId('template'))
	);
	let templates = $state.raw(initial);
	let selectedRecordId = $state(initialRecord?.id ?? '');
	let definition = $state.raw<TemplateDefinition>(initialDefinition);
	let savedSignature = $state<string | null>(
		initialRecord ? JSON.stringify(initialDefinition) : null
	);
	let selectedRegionId = $state<string | null>(initialDefinition.slots[0]?.id ?? null);
	let mode = $state<LayoutPreviewMode>('desktop');
	let preview = $state(false);
	let panel = $state<'library' | 'document' | 'properties'>('document');
	let busy = $state(false);
	let feedback = $state<{ kind: 'error' | 'success'; text: string } | null>(null);
	let announcement = $state('');
	let drag = $state<DragState | null>(null);
	let resizeOrigin = $state.raw<{
		definition: TemplateDefinition;
		mode: LayoutPreviewMode;
		index: number;
	} | null>(null);
	const interacting = $derived(!!drag || resizeOrigin !== null);
	let studioRoot: HTMLDivElement;
	let past = $state.raw<TemplateDefinition[]>([]);
	let future = $state.raw<TemplateDefinition[]>([]);
	let lastChangeKey = '';
	let lastChangeAt = 0;
	let allowNavigation = false;
	type Confirmation = {
		title: string;
		description: string;
		label: string;
		destructive?: boolean;
		run: () => void;
	};
	let confirmation = $state<Confirmation | null>(null);
	const record = $derived(templates.find((item) => item.id === selectedRecordId));
	const readOnly = $derived(record?.isSystem === true);
	const dirty = $derived(savedSignature !== JSON.stringify(definition));
	const orderedIds = $derived(getOrderedSlots(definition, mode).map((slot) => slot.id));
	const insertId = $derived.by(() => {
		let id = 'new-region';
		while (definition.slots.some((slot) => slot.id === id)) id += '-';
		return id;
	});
	const deviceLabels = { desktop: 'Desktop', tablet: 'Tablet', phone: 'Phone' };

	function commit(next: TemplateDefinition, text = '', key = '') {
		if (
			readOnly ||
			busy ||
			interacting ||
			next === definition ||
			JSON.stringify(next) === JSON.stringify(definition)
		)
			return;
		const now = Date.now();
		if (!key || key !== lastChangeKey || now - lastChangeAt > 700)
			past = [...past.slice(-59), definition];
		lastChangeKey = key;
		lastChangeAt = now;
		definition = next;
		future = [];
		feedback = null;
		if (!definition.slots.some((slot) => slot.id === selectedRegionId))
			selectedRegionId = getOrderedSlots(definition, mode)[0]?.id ?? null;
		if (text) announcement = text;
	}
	function undo() {
		if (readOnly || busy || interacting || !past.length) return;
		future = [definition, ...future];
		definition = past[past.length - 1];
		past = past.slice(0, -1);
		afterHistory('Change undone.');
	}
	function redo() {
		if (readOnly || busy || interacting || !future.length) return;
		past = [...past, definition];
		definition = future[0];
		future = future.slice(1);
		afterHistory('Change restored.');
	}
	function afterHistory(text: string) {
		lastChangeKey = '';
		feedback = null;
		announcement = text;
		if (!definition.slots.some((slot) => slot.id === selectedRegionId))
			selectedRegionId = getOrderedSlots(definition, mode)[0]?.id ?? null;
	}
	function loadDefinition(next: TemplateDefinition, id = '', saved = false) {
		definition = structuredClone(next);
		selectedRecordId = id;
		savedSignature = saved ? JSON.stringify(definition) : null;
		selectedRegionId = getOrderedSlots(definition, mode)[0]?.id ?? null;
		past = [];
		future = [];
		lastChangeKey = '';
		feedback = null;
		preview = false;
		panel = 'document';
	}
	function discardThen(run: () => void) {
		if (busy || interacting) return;
		if (!dirty) return run();
		confirmation = {
			title: 'Leave these changes?',
			description:
				'This template has unsaved changes. Save it first to keep your work, or discard the changes to continue.',
			label: 'Discard changes',
			run
		};
	}
	function choose(item: LessonTemplateRecord) {
		if (item.id !== selectedRecordId)
			discardThen(() => loadDefinition(item.definition, item.id, true));
	}
	function createTemplate() {
		discardThen(() => loadDefinition(createBlankTemplate(createEntityId('template'))));
	}
	function duplicate() {
		if (busy || interacting) return;
		loadDefinition({
			...definition,
			id: createEntityId('template'),
			name: `${definition.name} copy`.slice(0, 120)
		});
		announcement = 'A new copy is ready to customize. Save it to your library.';
	}
	function addRegion(targetId?: string, placement: DropPlacement = 'after') {
		if (readOnly || busy || definition.slots.length >= MAX_TEMPLATE_REGIONS) return;
		if (Object.values(definition.variants).some((layout) => layout.areas.length >= 24)) {
			feedback = {
				kind: 'error',
				text: 'This layout has reached its row limit. Apply a layout pattern to simplify it before adding another region.'
			};
			return;
		}
		const slot: TemplateSlotDefinition = {
			id: createEntityId('region'),
			label: `Content region ${definition.slots.length + 1}`,
			description: 'A space for learning widgets'
		};
		commit(
			insertRegionAndReflow(definition, slot, mode, targetId, placement),
			'Content region added on all devices.'
		);
		if (definition.slots.some((item) => item.id === slot.id)) selectedRegionId = slot.id;
	}
	function updateRegion(id: string, patch: Partial<TemplateSlotDefinition>, key: string) {
		commit(
			{
				...definition,
				slots: definition.slots.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot))
			},
			'',
			`${id}:${key}`
		);
	}
	function moveRegion(id: string, direction: -1 | 1) {
		const targetId = orderedIds[orderedIds.indexOf(id) + direction];
		if (targetId)
			commit(
				reorderRegion(definition, mode, id, targetId, direction < 0 ? 'before' : 'after'),
				`Region moved ${direction < 0 ? 'earlier' : 'later'} on ${deviceLabels[mode]}.`
			);
	}
	function startResize(index: number) {
		if (readOnly || busy || interacting || preview) return;
		resizeOrigin = { definition, mode, index };
		feedback = null;
		announcement = `Resizing columns on ${deviceLabels[mode]}. Press Escape to cancel.`;
	}
	function previewResize(ratio: number) {
		if (!resizeOrigin) return;
		definition = resizeColumnPair(
			resizeOrigin.definition,
			resizeOrigin.mode,
			resizeOrigin.index,
			ratio
		);
	}
	function finishResize() {
		if (!resizeOrigin) return;
		const next = definition;
		const previous = resizeOrigin;
		resizeOrigin = null;
		definition = previous.definition;
		commit(next, `Column proportions updated on ${deviceLabels[previous.mode]}.`);
	}
	function cancelResize() {
		if (!resizeOrigin) return;
		definition = resizeOrigin.definition;
		resizeOrigin = null;
		announcement = 'Column resize canceled.';
	}
	function dragOptions(id: string): DragHandleOptions {
		return {
			id,
			scope: () => studioRoot ?? null,
			orderedIds,
			disabled:
				readOnly ||
				busy ||
				resizeOrigin !== null ||
				preview ||
				(id === insertId && definition.slots.length >= MAX_TEMPLATE_REGIONS),
			onstart(state) {
				drag = state;
				if (state.sourceId !== insertId) selectedRegionId = state.sourceId;
				announcement = 'Region picked up. Choose a position. Press Escape to cancel.';
			},
			onmove(state) {
				if (
					state.targetId &&
					(state.targetId !== drag?.targetId || state.placement !== drag?.placement)
				)
					announcement = `Drop ${state.placement} ${definition.slots.find((slot) => slot.id === state.targetId)?.label ?? 'region'}.`;
				drag = state;
			},
			ondrop(state) {
				drag = null;
				if (!state.targetId) {
					announcement = 'No changes made.';
					return;
				}
				if (state.sourceId === insertId) addRegion(state.targetId, state.placement);
				else
					commit(
						reorderRegion(definition, mode, state.sourceId, state.targetId, state.placement),
						`Region placed on ${deviceLabels[mode]}. Other device arrangements are unchanged.`
					);
			},
			oncancel() {
				drag = null;
				announcement = 'Move canceled.';
			}
		};
	}
	async function save() {
		if (readOnly || busy || interacting || !dirty) return;
		const issues = validateTemplateDefinition(definition);
		if (issues.length) {
			feedback = { kind: 'error', text: issues[0].message };
			return;
		}
		busy = true;
		feedback = null;
		try {
			const response = await fetch(record ? `/api/templates/${record.id}` : '/api/templates', {
				method: record ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: definition.name,
					description: definition.description ?? '',
					category: record?.category ?? 'language',
					definition
				})
			});
			const body = await response.json().catch(() => null);
			if (!response.ok || !body?.id || !body?.definition)
				throw new Error(body?.error ?? 'Could not save this template. Please try again.');
			const saved = body as LessonTemplateRecord;
			templates = [saved, ...templates.filter((item) => item.id !== saved.id)];
			selectedRecordId = saved.id;
			definition = structuredClone(saved.definition);
			savedSignature = JSON.stringify(definition);
			past = past.map((item) => ({ ...item, id: saved.definition.id }));
			future = future.map((item) => ({ ...item, id: saved.definition.id }));
			lastChangeKey = '';
			feedback = { kind: 'success', text: 'Template saved to your library.' };
		} catch (error) {
			feedback = {
				kind: 'error',
				text: error instanceof Error ? error.message : 'Could not save this template.'
			};
		} finally {
			busy = false;
		}
	}
	function requestDelete() {
		if (!record || readOnly || busy) return;
		const id = record.id;
		confirmation = {
			title: 'Delete this template?',
			description: `“${record.name}” will be removed from your library. Lessons using it will need a replacement template to display their content. This cannot be undone.`,
			label: 'Delete template',
			destructive: true,
			run: () => {
				void deleteTemplate(id);
			}
		};
	}
	async function deleteTemplate(id: string) {
		busy = true;
		try {
			const response = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.error ?? 'Could not delete this template.');
			}
			templates = templates.filter((item) => item.id !== id);
			const next = templates.find((item) => !item.isSystem) ?? templates[0];
			loadDefinition(
				next?.definition ?? createBlankTemplate(createEntityId('template')),
				next?.id,
				!!next
			);
			feedback = { kind: 'success', text: 'Template deleted.' };
		} catch (error) {
			feedback = {
				kind: 'error',
				text: error instanceof Error ? error.message : 'Could not delete this template.'
			};
		} finally {
			busy = false;
		}
	}
	function keyboardShortcut(event: KeyboardEvent) {
		if (!(event.ctrlKey || event.metaKey) || confirmation) return;
		if (event.key.toLowerCase() === 's') {
			event.preventDefault();
			void save();
			return;
		}
		if (
			event.target instanceof Element &&
			event.target.closest('input, textarea, [contenteditable="true"]')
		)
			return;
		if (event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
		}
		if (event.key.toLowerCase() === 'y') {
			event.preventDefault();
			redo();
		}
	}
	beforeNavigate((navigation) => {
		if (allowNavigation || !dirty) {
			allowNavigation = false;
			return;
		}
		if (navigation.to?.url.href === window.location.href) return;
		navigation.cancel();
		if (navigation.willUnload) return;
		const destination = navigation.to?.url;
		if (destination)
			discardThen(() => {
				allowNavigation = true;
				// The intercepted URL already includes the application's resolved base path.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				void goto(destination);
			});
	});
</script>

<svelte:window onkeydown={keyboardShortcut} />

<div class="template-studio" bind:this={studioRoot} class:is-preview={preview} aria-busy={busy}>
	<header class="studio-header">
		<div class="template-identity">
			<div class="eyebrow">
				<span class="studio-icon"><LayoutGrid size={15} /></span>Layout designer<span
					class="save-state"
					class:unsaved={dirty && !readOnly}
					>{#if readOnly}Starter layout{:else if dirty}<i></i>Unsaved{:else}<Check
							size={12}
						/>Saved{/if}</span
				>
			</div>
			<input
				class="template-name"
				aria-label="Template name"
				dir="auto"
				value={definition.name}
				maxlength="120"
				disabled={readOnly || busy || interacting}
				oninput={(event) => commit({ ...definition, name: event.currentTarget.value }, '', 'name')}
			/>
			<input
				class="template-description"
				aria-label="Template description"
				dir="auto"
				placeholder="Add a short description for your library…"
				maxlength="500"
				value={definition.description ?? ''}
				disabled={readOnly || busy || interacting}
				oninput={(event) =>
					commit({ ...definition, description: event.currentTarget.value }, '', 'description')}
			/>
		</div>
		<div class="header-actions">
			<div class="history-actions">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Undo"
					title="Undo · Ctrl/⌘ Z"
					disabled={readOnly || busy || interacting || !past.length}
					onclick={undo}><Undo2 size={16} /></Button
				><Button
					variant="ghost"
					size="icon"
					aria-label="Redo"
					title="Redo · Ctrl/⌘ Shift Z"
					disabled={readOnly || busy || interacting || !future.length}
					onclick={redo}><Redo2 size={16} /></Button
				>
			</div>
			<Button variant="outline" size="sm" disabled={busy || interacting} onclick={duplicate}
				><Copy size={14} /><span class="action-label">Make a copy</span></Button
			>
			{#if record && !readOnly}<Button
					variant="ghost"
					size="sm"
					class="delete-button"
					aria-label="Delete template"
					title="Delete template"
					disabled={busy || interacting}
					onclick={requestDelete}
					><Trash2 size={14} /><span class="action-label">Delete</span></Button
				>{/if}
			<Button
				variant="outline"
				size="sm"
				disabled={busy || interacting}
				aria-pressed={preview}
				onclick={() => {
					preview = !preview;
					panel = 'document';
				}}
				>{#if preview}<Pencil size={14} />Edit layout{:else}<Eye size={14} />Preview{/if}</Button
			>
			<Button
				size="sm"
				class="save-button"
				disabled={readOnly || busy || interacting || !dirty}
				onclick={() => void save()}
				>{#if busy}<LoaderCircle size={14} class="animate-spin" />Saving…{:else}<Save
						size={14}
					/>Save template{/if}</Button
			>
		</div>
	</header>
	{#if feedback}<div
			class="feedback"
			class:error={feedback.kind === 'error'}
			role={feedback.kind === 'error' ? 'alert' : 'status'}
		>
			{#if feedback.kind === 'success'}<Check size={14} />{/if}{feedback.text}
		</div>{/if}
	{#if readOnly}<div class="starter-notice">
			<Sparkles size={16} />
			<p>A starting point for your next lesson. Make it your own.</p>
			<Button size="sm" variant="ghost" disabled={busy || interacting} onclick={duplicate}
				>Use this layout <Copy size={13} /></Button
			>
		</div>{/if}
	<div class="workspace-toolbar">
		<span class="workspace-label">{preview ? 'Content preview' : 'Design workspace'}</span>
		<div class="device-switcher" role="group" aria-label="Device layout">
			{#each ['desktop', 'tablet', 'phone'] as device (device)}<button
					type="button"
					class:active={mode === device}
					aria-pressed={mode === device}
					disabled={interacting}
					onclick={() => {
						mode = device as LayoutPreviewMode;
					}}
					>{#if device === 'desktop'}<Monitor size={15} />{:else if device === 'tablet'}<Tablet
							size={14}
						/>{:else}<Smartphone size={14} />{/if}<span
						>{deviceLabels[device as LayoutPreviewMode]}</span
					></button
				>{/each}
		</div>
		<span class="workspace-hint">Responsive by design</span>
	</div>
	{#if !preview}<nav class="mobile-panels" aria-label="Designer panels">
			{#each ['library', 'document', 'properties'] as item (item)}<button
					type="button"
					class:active={panel === item}
					aria-pressed={panel === item}
					disabled={interacting}
					onclick={() => {
						panel = item as typeof panel;
					}}
					>{item === 'library'
						? 'Library'
						: item === 'document'
							? 'Document'
							: 'Properties'}</button
				>{/each}
		</nav>{/if}
	<div class="workspace" data-panel={panel}>
		{#if !preview}<div class="library-panel">
				<TemplateLibrary
					{templates}
					selectedId={selectedRecordId}
					busy={busy || interacting}
					onselect={choose}
					oncreate={createTemplate}
				/>
			</div>{/if}
		<div class="document-panel">
			<TemplateDocument
				{definition}
				{mode}
				selectedId={selectedRegionId}
				{preview}
				{readOnly}
				{busy}
				{drag}
				{dragOptions}
				resizing={resizeOrigin !== null}
				onresizestart={startResize}
				onresizeinput={previewResize}
				onresizecommit={finishResize}
				onresizecancel={cancelResize}
				onselect={(id, inspect) => {
					selectedRegionId = id;
					announcement = `${definition.slots.find((slot) => slot.id === id)?.label ?? 'Region'} selected.`;
					if (
						inspect &&
						studioRoot.clientWidth <=
							60 * parseFloat(getComputedStyle(document.documentElement).fontSize)
					)
						panel = 'properties';
				}}
				onadd={() => addRegion()}
			/>
		</div>
		{#if !preview}<div class="properties-panel">
				<TemplateInspector
					{insertId}
					{definition}
					{mode}
					selectedId={selectedRegionId}
					{readOnly}
					busy={busy || resizeOrigin !== null}
					{drag}
					{dragOptions}
					onselect={(id) => {
						selectedRegionId = id;
					}}
					onpreset={(id) =>
						commit(
							applyLayoutPreset(definition, mode, id),
							`${deviceLabels[mode]} arrangement updated.`
						)}
					onweight={(index, value) =>
						commit(setColumnWeight(definition, mode, index, value), '', `${mode}:weight:${index}`)}
					ongap={(gap) => commit(setLayoutGap(definition, mode, gap), 'Spacing updated.')}
					onpadding={(padding) =>
						commit(setLayoutPadding(definition, mode, padding), 'Inner padding updated.')}
					onfullwidth={(id, full) =>
						commit(
							setRegionFullWidth(definition, mode, id, full),
							'Region span updated for this device.'
						)}
					onmove={moveRegion}
					onremove={(id) =>
						commit(
							removeRegion(definition, id),
							'Region removed on all devices. Undo to restore it.'
						)}
					onadd={() => addRegion()}
					onlabel={(id, label) => updateRegion(id, { label }, 'label')}
					ondescription={(id, description) => updateRegion(id, { description }, 'description')}
					oncopyLayout={(from) =>
						commit(
							{
								...definition,
								variants: {
									...definition.variants,
									[mode]: structuredClone(definition.variants[from])
								}
							},
							`${deviceLabels[from]} arrangement copied to ${deviceLabels[mode]}.`
						)}
				/>
			</div>{/if}
	</div>
	<footer class="studio-footer">
		<span><span class="footer-dot"></span>Language Learning</span><span
			>{preview
				? 'Sample content · your lesson widgets go here'
				: 'Arrange regions here. Add learning widgets in the course builder.'}</span
		>
	</footer>
	<p id="template-drag-help" class="sr-only">
		Drag a grip to move a region. With the grip focused, press Space or Enter to pick up, arrow keys
		to choose a position, Space or Enter to drop, or Escape to cancel. The Add content region button
		can also be dragged to insert a new region.
	</p>
	<div class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
</div>
<TemplateConfirmation
	open={!!confirmation}
	title={confirmation?.title ?? ''}
	description={confirmation?.description ?? ''}
	confirmLabel={confirmation?.label}
	destructive={confirmation?.destructive}
	oncancel={() => {
		confirmation = null;
	}}
	onconfirm={() => {
		const action = confirmation?.run;
		confirmation = null;
		action?.();
	}}
/>

<style>
	.template-studio {
		container-type: inline-size;
		min-inline-size: 0;
		border: 0.0625rem solid #e9e3ed;
		border-radius: 1rem;
		overflow: clip;
		background: #fff;
		color: #453b50;
		box-shadow: 0 0.4rem 2rem #3f2d5204;
	}
	.studio-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 1.4rem 1.5rem;
	}
	.template-identity {
		flex: 1 1 18rem;
		min-inline-size: 0;
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-block-end: 0.55rem;
		color: #887199;
		font-size: 0.75rem;
		font-weight: 600;
	}
	.studio-icon {
		display: grid;
		place-items: center;
		inline-size: 1.65rem;
		block-size: 1.65rem;
		border-radius: 0.4rem;
		background: #f1eaf7;
		color: #9274b3;
	}
	.save-state {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-inline-start: 0.5rem;
		font-weight: 400;
		color: #667a6b;
	}
	.save-state.unsaved {
		color: #92704e;
	}
	.save-state i,
	.footer-dot {
		inline-size: 0.35rem;
		block-size: 0.35rem;
		background: currentColor;
		border-radius: 50%;
	}
	.template-name,
	.template-description {
		display: block;
		inline-size: 100%;
		min-inline-size: 0;
		padding: 0.15rem 0;
		border: 0;
		outline: none;
		background: transparent;
		text-overflow: ellipsis;
		font-family: var(--font-sans);
	}
	.template-name {
		max-inline-size: 32rem;
		color: #473a54;
		font-size: 1.35rem;
		font-weight: 600;
		line-height: 1.65;
	}
	.template-description {
		color: #776a82;
		font-size: 0.8rem;
		line-height: 1.7;
	}
	.template-name:focus,
	.template-description:focus {
		box-shadow: 0 0.1rem #b49bd0;
	}
	.template-name:disabled,
	.template-description:disabled {
		opacity: 1;
	}
	.header-actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
	.history-actions {
		display: flex;
		margin-inline-end: 0.25rem;
		color: #8c7b9a;
	}
	.header-actions :global(button) {
		font-size: 0.75rem;
		min-block-size: 2.5rem;
	}
	.header-actions :global(.save-button) {
		background: #9475b4;
		border-color: #9475b4;
		color: #fff;
	}
	.header-actions :global(.save-button:hover:not(:disabled)) {
		background: #80639f;
	}
	.feedback {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0 1.5rem 1rem;
		padding: 0.65rem 0.85rem;
		border-radius: 0.5rem;
		color: #52735f;
		background: #eef6f0;
		font-size: 0.8rem;
	}
	.feedback.error {
		color: #9c4551;
		background: #fff0f0;
	}
	.starter-notice {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.55rem 1.5rem;
		background: #f4effa;
		color: #795897;
		font-size: 0.8rem;
	}
	.starter-notice p {
		margin: 0;
		flex: 1;
		min-inline-size: 10rem;
	}
	.starter-notice :global(button) {
		color: #79599a;
		font-size: 0.75rem;
	}
	.workspace-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.8rem;
		padding: 0.8rem 1.25rem;
		border-block: 0.0625rem solid #ede8f0;
	}
	.workspace-label,
	.workspace-hint {
		color: #7b6b87;
		font-size: 0.75rem;
	}
	.device-switcher {
		display: flex;
		padding: 0.2rem;
		border-radius: 0.6rem;
		background: #f3f0f6;
		gap: 0.15rem;
	}
	.device-switcher button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-block-size: 2.5rem;
		padding: 0.5rem 0.8rem;
		color: #7d688e;
		border: 0;
		border-radius: 0.4rem;
		background: transparent;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.device-switcher button.active {
		color: #8362a4;
		background: #fff;
		box-shadow: 0 0.1rem 0.3rem #60487814;
	}
	.device-switcher button:focus-visible,
	.mobile-panels button:focus-visible {
		outline: 0.12rem solid #9475b4;
		outline-offset: 0.12rem;
	}
	.workspace {
		display: grid;
		grid-template-columns: clamp(16rem, 18cqi, 20rem) minmax(0, 1fr) 15.5rem;
		align-items: stretch;
		block-size: clamp(32rem, calc(100dvh - 20rem), 55rem);
	}
	.library-panel,
	.document-panel,
	.properties-panel {
		min-inline-size: 0;
		min-block-size: 0;
		overflow: auto;
		scrollbar-width: thin;
		scrollbar-color: #d9cce5 transparent;
	}
	.library-panel {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-inline-end: 0.0625rem solid #eeeaf0;
		align-self: stretch;
	}
	.library-panel :global(.template-library) {
		flex: 1;
		min-block-size: 0;
		block-size: auto;
	}
	.properties-panel {
		border-inline-start: 0.0625rem solid #eeeaf0;
		align-self: stretch;
	}
	.document-panel {
		align-self: stretch;
	}
	.document-panel :global(.design-document) {
		min-block-size: 100%;
	}
	.header-actions :global(.delete-button) {
		color: #9b6575;
	}
	.header-actions :global(.delete-button:hover:not(:disabled)) {
		background: #fff0f0;
		color: #9c4551;
	}
	.is-preview .workspace {
		grid-template-columns: minmax(0, 1fr);
	}
	.studio-footer {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.75rem 1.2rem;
		border-block-start: 0.0625rem solid #eeeaf0;
		color: #796986;
		font-size: 0.72rem;
	}
	.studio-footer > span:first-child {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: #8b70a5;
	}
	.mobile-panels {
		display: none;
	}
	@container (max-width: 60rem) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
			block-size: auto;
		}
		.workspace:not([data-panel='library']) .library-panel,
		.workspace:not([data-panel='properties']) .properties-panel,
		.workspace:not([data-panel='document']) .document-panel {
			display: none;
		}
		.is-preview .document-panel {
			display: block;
		}
		.library-panel,
		.properties-panel {
			border-inline: 0;
		}
		.mobile-panels {
			display: flex;
			padding: 0.6rem 1rem;
			gap: 0.4rem;
			border-block-end: 0.0625rem solid #eeeaf0;
		}
		.mobile-panels button {
			flex: 1;
			border: 0;
			padding: 0.65rem;
			border-radius: 0.45rem;
			background: transparent;
			color: #887595;
			font-size: 0.8rem;
			cursor: pointer;
		}
		.mobile-panels button.active {
			background: #f1eaf8;
			color: #805da3;
			font-weight: 600;
		}
		.workspace-hint {
			display: none;
		}
	}
	@container (max-width: 34rem) {
		.studio-header {
			padding: 0.7rem;
		}
		.template-name {
			font-size: 1.15rem;
		}
		.header-actions {
			inline-size: 100%;
			gap: 0.3rem;
		}
		.header-actions :global(button) {
			font-size: 0.72rem;
			padding-inline: 0.6rem;
		}
		.history-actions {
			margin-inline-end: auto;
		}
		.action-label {
			display: none;
		}
		.workspace-toolbar {
			justify-content: center;
			padding-inline: 0.5rem;
		}
		.workspace-label {
			display: none;
		}
		.device-switcher {
			flex: 1;
			justify-content: center;
		}
		.device-switcher button {
			flex: 1;
			justify-content: center;
		}
		.mobile-panels {
			padding: 0.45rem 0.6rem;
			gap: 0.3rem;
		}
		.mobile-panels button {
			padding: 0.5rem;
		}
		.studio-footer {
			padding: 0.6rem 0.7rem;
			line-height: 1.65;
		}
	}
</style>
