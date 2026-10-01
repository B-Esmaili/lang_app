<script lang="ts">
	import BoldIcon from '@lucide/svelte/icons/bold';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import HighlighterIcon from '@lucide/svelte/icons/highlighter';
	import ItalicIcon from '@lucide/svelte/icons/italic';
	import UnderlineIcon from '@lucide/svelte/icons/underline';
	import VocabularyIcon from '@lucide/svelte/icons/book-marked';
	import { Button } from '$lib/components/ui/button';
	import { Editor, Extension } from '@tiptap/core';
	import { history, redo as localRedo, undo as localUndo } from '@tiptap/pm/history';
	import { Fragment, Slice } from '@tiptap/pm/model';
	import { getContext, untrack } from 'svelte';
	import type {
		PassageAnnotation,
		PassageAnnotationKind,
		PassageAnnotationTone
	} from '../../model/types';
	import { TEXT_HISTORY_CONTEXT, type TextHistoryController } from './rich-text/history';
	import {
		annotationIntegrityPlugin,
		annotationTransaction,
		normalizePastedText,
		readRichText,
		reconcileRichText,
		richTextJSON,
		selectionHasAnnotation,
		textExtensions,
		type TextTag
	} from './rich-text/model';
	import RichTextPreview from './rich-text/RichTextPreview.svelte';

	let {
		value,
		annotations = [],
		editable = false,
		multiline = true,
		formatting = false,
		tag = 'div',
		placeholder = '',
		ariaLabel = 'Editable text',
		language = 'en',
		direction = 'auto',
		class: className = '',
		onChange,
		onFocus = () => undefined
	}: {
		value: string;
		annotations?: PassageAnnotation[];
		editable?: boolean;
		multiline?: boolean;
		formatting?: boolean;
		tag?: TextTag;
		placeholder?: string;
		ariaLabel?: string;
		language?: string;
		direction?: 'auto' | 'ltr' | 'rtl';
		class?: string;
		onChange: (value: string, annotations: PassageAnnotation[]) => void;
		onFocus?: () => void;
	} = $props();

	const historyController = getContext<TextHistoryController | undefined>(TEXT_HISTORY_CONTEXT);
	let mount = $state<HTMLDivElement>()!;
	let editor = $state<Editor | null>(null);
	let highlightTone = $state<PassageAnnotationTone>('yellow');
	let selectionVersion = $state(0);
	const hasSelection = $derived.by(() => {
		void selectionVersion;
		return !!editor && !editor.state.selection.empty;
	});
	const showToolbar = $derived(editable && formatting && hasSelection);

	const LocalHistory = Extension.create({
		name: 'localTextHistory',
		addProseMirrorPlugins: () => [history()]
	});
	const AnnotationIntegrity = Extension.create({
		name: 'annotationIntegrity',
		addProseMirrorPlugins: () => [annotationIntegrityPlugin()]
	});

	function updateAttributes(instance: Editor) {
		const node = instance.view.dom;
		node.className = `editable-text content-language ${className}`;
		node.setAttribute('lang', language);
		node.setAttribute('dir', direction);
		node.setAttribute('data-placeholder', placeholder);
		node.querySelector('[data-text-block]')?.setAttribute('data-placeholder', placeholder);
		node.setAttribute('aria-label', ariaLabel);
		node.setAttribute('aria-multiline', String(multiline));
		node.setAttribute('role', 'textbox');
		node.setAttribute('spellcheck', String(editable));
	}

	function notifyChange(instance: Editor) {
		const next = readRichText(instance.state.doc);
		onChange(next.text, formatting ? next.annotations : []);
	}

	function refreshSelection() {
		selectionVersion += 1;
	}

	function useHistory(direction: 'undo' | 'redo') {
		if (!editor) return false;
		if (historyController) {
			historyController[direction]();
			return true;
		}
		return (direction === 'undo' ? localUndo : localRedo)(editor.state, editor.view.dispatch);
	}

	function applyAnnotation(
		kind: PassageAnnotationKind | 'clear',
		tone: PassageAnnotationTone = highlightTone
	) {
		if (!editor || !formatting || editor.state.selection.empty) return;
		historyController?.breakGroup?.();
		const transaction = annotationTransaction(editor.state, kind, tone);
		if (transaction) editor.view.dispatch(transaction.scrollIntoView());
		historyController?.breakGroup?.();
		editor.commands.focus();
		refreshSelection();
	}

	function isActive(kind: PassageAnnotationKind) {
		void selectionVersion;
		return (
			!!editor &&
			selectionHasAnnotation(editor.state, kind, kind === 'highlight' ? highlightTone : undefined)
		);
	}

	function insertPlainText(instance: Editor, text: string) {
		const normalized = normalizePastedText(text, multiline);
		const { state } = instance;
		const marks = state.storedMarks ?? state.selection.$from.marks();
		const nodes = normalized
			.split('\n')
			.flatMap((part, index) => [
				...(index ? [state.schema.nodes.hardBreak.create(null, null, marks)] : []),
				...(part ? [state.schema.text(part, marks)] : [])
			]);
		instance.view.dispatch(
			state.tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView()
		);
	}

	function keydown(event: KeyboardEvent) {
		if (!editor || event.isComposing) return;
		const modifier = event.ctrlKey || event.metaKey;
		const key = event.key.toLowerCase();
		if (modifier && (key === 'z' || key === 'y')) {
			event.preventDefault();
			event.stopPropagation();
			useHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
		} else if (modifier && formatting && ['b', 'i', 'u'].includes(key)) {
			event.preventDefault();
			event.stopPropagation();
			applyAnnotation(key === 'b' ? 'strong' : key === 'i' ? 'emphasis' : 'underline');
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (multiline) editor.commands.insertContent({ type: 'hardBreak' });
		}
	}

	$effect(() => {
		const element = mount;
		if (!element) return;
		const initial = untrack(() => ({
			tag,
			value,
			annotations: formatting ? annotations : [],
			editable
		}));
		let instance!: Editor;
		instance = new Editor({
			element,
			extensions: [
				...textExtensions(initial.tag),
				AnnotationIntegrity,
				...(historyController ? [] : [LocalHistory])
			],
			content: richTextJSON(initial.value, initial.annotations),
			editable: initial.editable,
			onCreate: ({ editor: created }) => updateAttributes(created),
			onUpdate: ({ editor: updated, transaction }) => {
				if (!transaction.getMeta('preventUpdate')) notifyChange(updated);
				refreshSelection();
			},
			onSelectionUpdate: refreshSelection,
			onFocus: () => {
				onFocus();
				refreshSelection();
			},
			onBlur: () => {
				refreshSelection();
			},
			editorProps: {
				handleKeyDown: (_view, event) => {
					keydown(event);
					return event.defaultPrevented;
				},
				handlePaste: (_view, event) => {
					if (!event.clipboardData) return false;
					event.preventDefault();
					historyController?.breakGroup?.();
					insertPlainText(instance, event.clipboardData.getData('text/plain'));
					historyController?.breakGroup?.();
					return true;
				},
				handleDOMEvents: {
					beforeinput: (_view, rawEvent) => {
						const event = rawEvent as InputEvent;
						if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo')
							return false;
						event.preventDefault();
						return useHistory(event.inputType === 'historyUndo' ? 'undo' : 'redo');
					}
				}
			}
		});
		editor = instance;
		updateAttributes(instance);
		return () => {
			editor = null;
			instance.destroy();
		};
	});

	$effect(() => {
		const instance = editor;
		if (!instance) return;
		instance.setEditable(editable, false);
		updateAttributes(instance);
		const transaction = reconcileRichText(instance.state, {
			text: value,
			annotations: formatting ? annotations : []
		});
		if (transaction) instance.view.dispatch(transaction);
	});
</script>

{#if editable}
	<div class="editable-wrapper" class:has-toolbar={showToolbar}>
		{#if showToolbar}
			<div class="format-toolbar" role="toolbar" aria-label="Text formatting" dir="ltr">
				<label class="highlight-tone">
					<span class="sr-only">Highlight colour</span>
					<select aria-label="Highlight colour" bind:value={highlightTone}>
						<option value="yellow">Yellow</option>
						<option value="mint">Mint</option>
						<option value="lavender">Lavender</option>
						<option value="blue">Blue</option>
					</select>
				</label>
				{#each [{ kind: 'strong', label: 'Bold', icon: BoldIcon }, { kind: 'emphasis', label: 'Italic', icon: ItalicIcon }, { kind: 'underline', label: 'Underline', icon: UnderlineIcon }, { kind: 'highlight', label: 'Highlight', icon: HighlighterIcon }, { kind: 'vocabulary', label: 'Vocabulary mark', icon: VocabularyIcon }] as const as action (action.kind)}
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						class={`format-action${isActive(action.kind) ? ' active' : ''}`}
						aria-label={action.label}
						aria-pressed={isActive(action.kind)}
						onpointerdown={(event) => event.preventDefault()}
						onclick={() => applyAnnotation(action.kind)}><action.icon aria-hidden="true" /></Button
					>
				{/each}
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					class="format-action"
					aria-label="Clear formatting"
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => applyAnnotation('clear')}><EraserIcon aria-hidden="true" /></Button
				>
			</div>
		{/if}
		<div bind:this={mount} class="editor-mount"></div>
	</div>
{:else}
	<RichTextPreview
		{value}
		annotations={formatting ? annotations : []}
		{tag}
		{language}
		{direction}
		class={className}
		{placeholder}
	/>
{/if}

<style>
	.editable-wrapper {
		position: relative;
		min-inline-size: 0;
	}
	.editor-mount {
		min-inline-size: 0;
	}
	.editable-wrapper :global(.editable-text) {
		min-inline-size: 0;
		caret-color: var(--editor-selection);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		text-align: start;
		unicode-bidi: plaintext;
		font-family: var(--font-content, 'Segoe UI', Tahoma, Arial, sans-serif);
		border-radius: 0.35rem;
		outline: 0.0625rem solid transparent;
		outline-offset: 0.2rem;
		cursor: text;
	}
	.editable-wrapper :global(.editable-text:hover) {
		outline-color: color-mix(in oklch, var(--ring) 28%, transparent);
	}
	.editable-wrapper :global(.editable-text:focus) {
		outline-color: color-mix(in oklch, var(--ring) 72%, transparent);
	}
	.editable-wrapper :global(.editable-text:empty::before),
	.editable-wrapper :global([data-text-block]:empty::before) {
		color: var(--muted-foreground);
		content: attr(data-placeholder);
		pointer-events: none;
	}
	.editable-wrapper :global(.editable-text::selection),
	.editable-wrapper :global(.editable-text *)::selection {
		background: var(--editor-selection-soft);
		color: inherit;
	}
	.editable-wrapper :global(.content-language:lang(fa)),
	.editable-wrapper :global(.content-language:lang(ar)) {
		font-family: var(--font-content-arabic, Tahoma, 'Segoe UI', Arial, sans-serif);
		line-height: 1.9;
	}
	.editable-wrapper :global(.editable-text > [data-text-block]) {
		margin: 0;
		min-block-size: 1em;
	}
	.editable-wrapper :global(.editable-mark-highlight),
	:global(.editable-mark-highlight) {
		border-radius: 0.18em;
		background: color-mix(in oklch, #facc15 38%, transparent);
		box-decoration-break: clone;
		padding-inline: 0.08em;
	}
	.editable-wrapper :global(.editable-mark-highlight[data-tone='mint']),
	:global(.editable-mark-highlight[data-tone='mint']) {
		background: color-mix(in oklch, #34d399 30%, transparent);
	}
	.editable-wrapper :global(.editable-mark-highlight[data-tone='lavender']),
	:global(.editable-mark-highlight[data-tone='lavender']) {
		background: color-mix(in oklch, #a78bfa 28%, transparent);
	}
	.editable-wrapper :global(.editable-mark-highlight[data-tone='blue']),
	:global(.editable-mark-highlight[data-tone='blue']) {
		background: color-mix(in oklch, #60a5fa 27%, transparent);
	}
	.editable-wrapper :global(.editable-mark-underline),
	:global(.editable-mark-underline) {
		text-decoration: underline;
		text-decoration-thickness: 0.08em;
		text-underline-offset: 0.2em;
	}
	.editable-wrapper :global(.editable-mark-vocabulary),
	:global(.editable-mark-vocabulary) {
		text-decoration: underline dotted color-mix(in oklch, #7c3aed 75%, transparent);
		text-decoration-thickness: 0.1em;
		text-underline-offset: 0.2em;
	}
	.format-toolbar {
		position: sticky;
		inset-block-start: calc(var(--sidebar-offset, 0rem) + 0.5rem);
		z-index: 20;
		display: flex;
		inline-size: max-content;
		max-inline-size: 100%;
		gap: 0.2rem;
		margin-block-end: 0.5rem;
		padding: 0.28rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.65rem;
		background: color-mix(in oklch, var(--popover) 96%, transparent);
		box-shadow: 0 0.65rem 1.8rem color-mix(in oklch, var(--foreground) 13%, transparent);
	}
	.format-toolbar :global(.format-action) {
		display: grid;
		inline-size: 2rem;
		block-size: 2rem;
		place-items: center;
		border-radius: 0.42rem;
		color: var(--popover-foreground);
	}
	.highlight-tone select {
		block-size: 2rem;
		max-inline-size: 5.6rem;
		padding-inline: 0.4rem;
		border: 0;
		border-radius: 0.42rem;
		background: var(--muted);
		color: var(--popover-foreground);
		font: inherit;
		font-size: 0.7rem;
	}
	.highlight-tone select:focus-visible {
		outline: 0.125rem solid var(--ring);
		outline-offset: 0.1rem;
	}
	.format-toolbar :global(.format-action:hover),
	.format-toolbar :global(.format-action:focus-visible),
	.format-toolbar :global(.format-action.active) {
		background: var(--muted);
		outline: none;
	}
	.format-toolbar :global(svg) {
		inline-size: 0.95rem;
		block-size: 0.95rem;
	}
</style>
