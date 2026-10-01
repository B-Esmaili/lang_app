<script lang="ts">
	import { Editor, Extension } from '@tiptap/core';
	import { history, redo, undo } from '@tiptap/pm/history';
	import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
	import { Decoration, DecorationSet } from '@tiptap/pm/view';
	import { onMount, untrack } from 'svelte';
	import { scrollIntoReadingViewport } from '../reading-viewport';
	import type {
		RichTextHighlightActivationSource,
		RichTextHighlightSource
	} from './highlight-source';
	import {
		emptyRichTextDocument,
		richTextExtensions,
		type RichTextDocument,
		type RichTextFormat
	} from './model';

	type RichTextProps = {
		content?: RichTextDocument;
		editable?: boolean;
		toolbar?: boolean;
		toolbarVisibility?: 'always' | 'focus' | 'selection';
		highlightSource?: RichTextHighlightSource | null;
		/** Keep the active timed passage visible while media is playing. */
		autoScrollHighlights?: boolean;
		language?: string;
		direction?: 'auto' | 'ltr' | 'rtl';
		ariaLabel?: string;
		class?: string;
		onChange?: (content: RichTextDocument) => void;
	};
	type RichTextEditorAttributes = Readonly<{
		language: string;
		direction: 'auto' | 'ltr' | 'rtl';
		ariaLabel: string;
		editable: boolean;
	}>;

	let {
		content = $bindable<RichTextDocument>(emptyRichTextDocument()),
		editable = false,
		toolbar = true,
		toolbarVisibility = 'always',
		highlightSource = null,
		autoScrollHighlights = true,
		language = 'en',
		direction = 'auto',
		ariaLabel = 'Rich text',
		class: className = '',
		onChange = () => undefined
	}: RichTextProps = $props();

	const automaticHighlightPluginKey = new PluginKey('richTextAutomaticHighlight');
	let mount = $state<HTMLDivElement>();
	let editor = $state<Editor | null>(null);
	let selectionVersion = $state(0);
	let activeHighlightIds = new Set<string>();
	let renderedHighlightIds = activeHighlightIds;
	let highlightScrollFrame: number | null = null;
	let highlightRefreshFrame: number | null = null;
	let highlightRefreshPending = false;
	let selectionPointerId: number | null = null;
	let pointerStart = { x: 0, y: 0 };
	let selectionGesture = false;

	const LocalHistory = Extension.create({
		name: 'richTextHistory',
		addProseMirrorPlugins: () => [history()]
	});
	const AutomaticHighlight = Extension.create({
		name: 'richTextAutomaticHighlight',
		addProseMirrorPlugins: () => [automaticHighlightPlugin(() => renderedHighlightIds)]
	});

	const hasTextSelection = $derived.by(() => {
		void selectionVersion;
		return Boolean(editor && !editor.state.selection.empty);
	});
	const renderToolbar = $derived(editable && toolbar);
	const canActivateAutomaticHighlights = $derived(
		!editable && isHighlightActivationSource(highlightSource)
	);
	const toolbarVisible = $derived(
		toolbarVisibility === 'always' ||
			(toolbarVisibility === 'focus' && Boolean(editor?.isFocused)) ||
			(toolbarVisibility === 'selection' && hasTextSelection)
	);
	const formatActions: ReadonlyArray<
		Readonly<{ format: RichTextFormat; label: string; text: string }>
	> = [
		{ format: 'strong', label: 'Bold', text: 'B' },
		{ format: 'emphasis', label: 'Italic', text: 'I' },
		{ format: 'underline', label: 'Underline', text: 'U' },
		{ format: 'highlight', label: 'Highlight', text: 'H' }
	];

	function automaticHighlightPlugin(getActiveIds: () => ReadonlySet<string>): Plugin {
		return new Plugin({
			key: automaticHighlightPluginKey,
			props: {
				decorations: (state: EditorState) => {
					const activeIds = getActiveIds();
					if (!activeIds.size) return DecorationSet.empty;
					const decorations: Decoration[] = [];
					const sentenceDecorationKeys = new Set<string>();
					state.doc.nodesBetween(0, state.doc.content.size, (node, position) => {
						if (node.isBlock && node.inlineContent) {
							const text = node.textContent;
							const activeOffsets: number[] = [];
							node.forEach((child, offset) => {
								if (!child.isText) return;
								const isActive = child.marks
									.filter((mark) => mark.type.name === 'automaticHighlight')
									.some((mark) => activeIds.has(String(mark.attrs.id ?? '')));
								if (isActive) activeOffsets.push(offset);
							});
							for (const offset of activeOffsets) {
								const range = sentenceRangeContaining(text, offset);
								if (!range) continue;
								const key = `${position}:${range.start}:${range.end}`;
								if (sentenceDecorationKeys.has(key)) continue;
								sentenceDecorationKeys.add(key);
								decorations.push(
									Decoration.inline(position + 1 + range.start, position + 1 + range.end, {
										class: 'rich-text-active-sentence'
									})
								);
							}
						}
						if (!node.isText || !node.text) return;
						const ids = node.marks
							.filter((mark) => mark.type.name === 'automaticHighlight')
							.map((mark) => String(mark.attrs.id ?? ''))
							.filter((id) => activeIds.has(id));
						if (!ids.length) return;
						decorations.push(
							Decoration.inline(position, position + node.nodeSize, {
								class: 'rich-text-automatic-highlight',
								'data-rich-text-active-cues': ids.join(' ')
							})
						);
					});
					return DecorationSet.create(state.doc, decorations);
				}
			}
		});
	}

	function sentenceRangeContaining(
		text: string,
		offset: number
	): { start: number; end: number } | null {
		if (!text || offset < 0 || offset >= text.length) return null;
		let start = 0;
		for (let index = 0; index < offset; index += 1) {
			if (isSentenceTerminator(text[index])) start = index + 1;
		}
		while (start < text.length && /\s/u.test(text[start])) start += 1;
		let end = text.length;
		for (let index = offset; index < text.length; index += 1) {
			if (isSentenceTerminator(text[index])) {
				end = index + 1;
				break;
			}
		}
		return start < end ? { start, end } : null;
	}

	function isSentenceTerminator(character: string | undefined): boolean {
		return character !== undefined && /[.!?؟…。！？]/u.test(character);
	}

	function isHighlightActivationSource(
		source: RichTextHighlightSource | null
	): source is RichTextHighlightSource & RichTextHighlightActivationSource {
		return Boolean(
			source &&
			typeof (source as unknown as RichTextHighlightActivationSource).activateHighlight ===
				'function'
		);
	}

	function activateAutomaticHighlight(event: MouseEvent): void {
		if (!canActivateAutomaticHighlights || !(event.target instanceof Element)) return;
		// Native drag, double-click, and touch selection also finish with click events.
		// They must not seek media or replace the passage the learner selected.
		if (selectionGesture || event.detail > 1 || hasNativeTextSelection()) return;
		const marker = event.target.closest<HTMLElement>('[data-rich-text-automatic-highlight]');
		if (!marker || !mount?.contains(marker)) return;
		const id = marker.dataset.richTextAutomaticHighlight;
		if (!id || !isHighlightActivationSource(highlightSource)) return;
		if (highlightSource.activateHighlight(id) !== false) event.preventDefault();
	}

	function hasNativeTextSelection(): boolean {
		const selection = mount?.ownerDocument.getSelection();
		return Boolean(selection && !selection.isCollapsed && selection.toString());
	}

	function cancelHighlightScroll() {
		if (highlightScrollFrame === null) return;
		cancelAnimationFrame(highlightScrollFrame);
		highlightScrollFrame = null;
	}

	function beginSelectionGesture(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0) return;
		selectionPointerId = event.pointerId;
		pointerStart = { x: event.clientX, y: event.clientY };
		selectionGesture = false;
		cancelHighlightScroll();
	}

	function trackSelectionGesture(event: PointerEvent) {
		if (selectionPointerId !== event.pointerId) return;
		if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) {
			selectionGesture = true;
		}
	}

	function endSelectionGesture(event: PointerEvent) {
		if (selectionPointerId !== event.pointerId) return;
		selectionPointerId = null;
		if (event.type === 'pointercancel') selectionGesture = true;
		resumeAutomaticHighlights();
	}

	function rememberNativeSelection() {
		if (!hasNativeTextSelection()) {
			resumeAutomaticHighlights();
			return;
		}
		if (selectionPointerId !== null) selectionGesture = true;
		cancelHighlightScroll();
	}

	function resetSelectionPointer() {
		selectionPointerId = null;
		selectionGesture = true;
		resumeAutomaticHighlights();
	}

	function resumeAutomaticHighlights() {
		if (!highlightRefreshPending || highlightRefreshFrame !== null) return;
		// Finish the native pointer/click sequence before touching its DOM nodes.
		highlightRefreshFrame = requestAnimationFrame(() => {
			highlightRefreshFrame = null;
			refreshAutomaticHighlights();
			// A seek can change the cue while a finger is still on the player. Resume
			// following after release; the scroll guard still protects text selections.
			scrollAutomaticHighlightIntoView();
		});
	}

	function currentEditorAttributes(): RichTextEditorAttributes {
		return { language, direction, ariaLabel, editable };
	}

	function updateEditorAttributes(
		instance: Editor,
		attributes: RichTextEditorAttributes = currentEditorAttributes()
	) {
		instance.view.dom.className = 'rich-text-prosemirror';
		instance.view.dom.setAttribute('lang', attributes.language);
		instance.view.dom.setAttribute('dir', attributes.direction);
		instance.view.dom.setAttribute('aria-label', attributes.ariaLabel);
		instance.view.dom.setAttribute('role', attributes.editable ? 'textbox' : 'document');
		instance.view.dom.setAttribute('aria-multiline', String(attributes.editable));
	}

	function refreshAutomaticHighlights() {
		const instance = editor;
		if (!instance) return;
		// Replacing decoration spans during a native drag can cancel the browser's
		// selection. Keep tracking playback, but defer its visuals until selection ends.
		if (selectionPointerId !== null || hasNativeTextSelection()) {
			highlightRefreshPending = true;
			return;
		}
		highlightRefreshPending = false;
		renderedHighlightIds = activeHighlightIds;
		instance.view.dispatch(
			instance.state.tr
				.setMeta(automaticHighlightPluginKey, 'refresh')
				.setMeta('addToHistory', false)
		);
	}

	function scrollAutomaticHighlightIntoView() {
		cancelHighlightScroll();
		if (!autoScrollHighlights || selectionPointerId !== null || hasNativeTextSelection()) return;
		highlightScrollFrame = requestAnimationFrame(() => {
			highlightScrollFrame = null;
			// Check again: selection can start after playback queued this frame. Reading
			// the DOM selection covers keyboard selection and mobile selection handles too.
			if (!autoScrollHighlights || selectionPointerId !== null || hasNativeTextSelection()) return;
			// Let the learner type in the study sheet without playback moving the page.
			if (
				document.activeElement?.closest('.study-drawer') &&
				document.activeElement.matches('input, textarea, [contenteditable="true"]')
			)
				return;
			const activeHighlight = editor?.view.dom.querySelector<HTMLElement>(
				'.rich-text-automatic-highlight'
			);
			if (!activeHighlight) return;
			scrollIntoReadingViewport(activeHighlight);
		});
	}

	function sameDocument(left: RichTextDocument, right: RichTextDocument): boolean {
		return JSON.stringify(left) === JSON.stringify(right);
	}

	function isFormatActive(format: RichTextFormat): boolean {
		void selectionVersion;
		return editor?.isActive(format) ?? false;
	}

	function toggleFormat(format: RichTextFormat) {
		if (!editor) return;
		editor.chain().focus().toggleMark(format).run();
	}

	function useHistory(direction: 'undo' | 'redo') {
		if (!editor) return;
		(direction === 'undo' ? undo : redo)(editor.state, editor.view.dispatch);
	}

	onMount(() => {
		const root = mount;
		if (!root) return;
		const ownerDocument = root.ownerDocument;
		const reader = root.closest('.course-reader');
		reader?.addEventListener('readingviewportchange', scrollAutomaticHighlightIntoView);
		root.addEventListener('click', activateAutomaticHighlight);
		// A different passage may own the live media cue, so protect selection across
		// the whole document rather than only inside this RichText instance.
		ownerDocument.addEventListener('pointerdown', beginSelectionGesture);
		ownerDocument.addEventListener('pointermove', trackSelectionGesture);
		ownerDocument.addEventListener('pointerup', endSelectionGesture);
		ownerDocument.addEventListener('pointercancel', endSelectionGesture);
		ownerDocument.addEventListener('selectionchange', rememberNativeSelection);
		window.addEventListener('blur', resetSelectionPointer);
		const instance = new Editor({
			element: root,
			extensions: [...richTextExtensions, LocalHistory, AutomaticHighlight],
			content,
			editable,
			onCreate: ({ editor: created }) => updateEditorAttributes(created),
			onUpdate: ({ editor: updated }) => {
				content = updated.getJSON();
				onChange(content);
				selectionVersion += 1;
			},
			onSelectionUpdate: () => (selectionVersion += 1)
		});
		editor = instance;
		updateEditorAttributes(instance);
		return () => {
			cancelHighlightScroll();
			reader?.removeEventListener('readingviewportchange', scrollAutomaticHighlightIntoView);
			if (highlightRefreshFrame !== null) cancelAnimationFrame(highlightRefreshFrame);
			root.removeEventListener('click', activateAutomaticHighlight);
			ownerDocument.removeEventListener('pointerdown', beginSelectionGesture);
			ownerDocument.removeEventListener('pointermove', trackSelectionGesture);
			ownerDocument.removeEventListener('pointerup', endSelectionGesture);
			ownerDocument.removeEventListener('pointercancel', endSelectionGesture);
			ownerDocument.removeEventListener('selectionchange', rememberNativeSelection);
			window.removeEventListener('blur', resetSelectionPointer);
			editor = null;
			instance.destroy();
		};
	});

	$effect(() => {
		const instance = editor;
		const nextContent = content;
		const attributes = currentEditorAttributes();
		if (!instance) return;
		untrack(() => {
			instance.setEditable(attributes.editable, false);
			updateEditorAttributes(instance, attributes);
			if (!sameDocument(instance.getJSON(), nextContent)) {
				instance.commands.setContent(nextContent, { emitUpdate: false });
				selectionVersion += 1;
			}
		});
	});

	$effect(() => {
		const source = highlightSource;
		if (!source) {
			activeHighlightIds = new Set();
			refreshAutomaticHighlights();
			return;
		}
		return source.subscribe(({ activeIds }) => {
			const next = new Set(activeIds);
			if (
				next.size === activeHighlightIds.size &&
				[...next].every((id) => activeHighlightIds.has(id))
			)
				return;
			activeHighlightIds = next;
			refreshAutomaticHighlights();
			if (next.size && autoScrollHighlights) scrollAutomaticHighlightIntoView();
		});
	});

	$effect(() => {
		if (autoScrollHighlights && activeHighlightIds.size) scrollAutomaticHighlightIntoView();
	});
</script>

<div
	class={`rich-text ${className}`}
	class:can-activate-automatic-highlights={canActivateAutomaticHighlights}
	lang={language}
	dir={direction}
>
	{#if renderToolbar}
		<div
			class="rich-text-toolbar"
			class:is-hidden={!toolbarVisible}
			role="toolbar"
			aria-label="Text formatting"
		>
			{#each formatActions as action (action.format)}
				<button
					type="button"
					class:active={isFormatActive(action.format)}
					aria-label={action.label}
					aria-pressed={isFormatActive(action.format)}
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => toggleFormat(action.format)}>{action.text}</button
				>
			{/each}
			<span class="rich-text-toolbar-separator" aria-hidden="true"></span>
			<button
				type="button"
				aria-label="Undo"
				onpointerdown={(event) => event.preventDefault()}
				onclick={() => useHistory('undo')}>↶</button
			>
			<button
				type="button"
				aria-label="Redo"
				onpointerdown={(event) => event.preventDefault()}
				onclick={() => useHistory('redo')}>↷</button
			>
		</div>
	{/if}
	<div bind:this={mount} class="rich-text-mount"></div>
</div>

<style>
	.rich-text {
		min-inline-size: 0;
	}
	.rich-text-toolbar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-block-end: 0.5rem;
	}
	.rich-text-toolbar.is-hidden {
		display: none;
	}
	.rich-text-toolbar button {
		display: grid;
		inline-size: 2rem;
		block-size: 2rem;
		place-items: center;
		border: 0.0625rem solid var(--border, currentColor);
		border-radius: 0.35rem;
		background: var(--background, transparent);
		color: inherit;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}
	.rich-text-toolbar button:hover,
	.rich-text-toolbar button:focus-visible,
	.rich-text-toolbar button.active {
		background: var(--muted, color-mix(in srgb, currentColor 12%, transparent));
		outline: none;
	}
	.rich-text-toolbar-separator {
		inline-size: 0.0625rem;
		block-size: 1.25rem;
		margin-inline: 0.15rem;
		background: var(--border, currentColor);
		opacity: 0.5;
	}
	.rich-text :global(.rich-text-prosemirror) {
		min-block-size: 1.5em;
		outline: none;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		text-align: justify;
		unicode-bidi: plaintext;
	}
	.rich-text :global(.rich-text-prosemirror > p) {
		margin-block: 0 0.8em;
	}
	.rich-text :global(.rich-text-prosemirror > p:last-child) {
		margin-block-end: 0;
	}
	.rich-text :global(mark[data-rich-text-highlight]) {
		border-radius: 0.15em;
		background: color-mix(in oklch, #facc15 42%, transparent);
		box-decoration-break: clone;
	}
	.rich-text :global(.rich-text-automatic-highlight) {
		border-radius: 0.15em;
		background: color-mix(in oklch, #38bdf8 42%, transparent);
		box-decoration-break: clone;
		box-shadow: 0 0 0 0 color-mix(in oklch, #38bdf8 0%, transparent);
		animation: rich-text-marker-pulse 1.15s ease-in-out infinite;
	}
	.rich-text.can-activate-automatic-highlights :global([data-rich-text-automatic-highlight]) {
		cursor: pointer;
		text-decoration: underline dotted color-mix(in oklch, #0284c7 65%, transparent);
		text-underline-offset: 0.16em;
	}
	.rich-text :global(.rich-text-active-sentence) {
		border-radius: 0.2em;
		background: color-mix(in oklch, #f59e0b 24%, transparent);
		box-decoration-break: clone;
	}
	@keyframes rich-text-marker-pulse {
		0%,
		100% {
			background: color-mix(in oklch, #38bdf8 38%, transparent);
			box-shadow: 0 0 0 0 color-mix(in oklch, #38bdf8 0%, transparent);
		}
		50% {
			background: color-mix(in oklch, #38bdf8 62%, transparent);
			box-shadow: 0 0 0 0.16em color-mix(in oklch, #38bdf8 16%, transparent);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rich-text :global(.rich-text-automatic-highlight) {
			animation: none;
			background: color-mix(in oklch, #38bdf8 52%, transparent);
		}
	}
</style>
