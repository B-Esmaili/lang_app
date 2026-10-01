<script lang="ts">
	import MessageIcon from '@lucide/svelte/icons/message-square-text';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { WidgetInstance } from '../../model/types';
	import EditableText from './EditableText.svelte';
	import WidgetSurface from './WidgetSurface.svelte';

	type ResponseInstance = WidgetInstance<'language.response'>;

	let {
		widget,
		selected = false,
		editing = false,
		answer: controlledAnswer = undefined,
		onSelect,
		onContentChange,
		onAnswerChange = () => undefined
	}: {
		widget: ResponseInstance;
		selected?: boolean;
		editing?: boolean;
		answer?: string;
		onSelect: () => void;
		onContentChange: (content: ResponseInstance['content']) => void;
		onAnswerChange?: (answer: string) => void;
	} = $props();

	let localAnswer = $state('');
	let currentWidgetId = $state('');

	const answer = $derived(controlledAnswer ?? localAnswer);
	const wordCount = $derived(answer.trim() ? answer.trim().split(/\s+/u).length : 0);

	$effect(() => {
		if (widget.id === currentWidgetId) return;
		currentWidgetId = widget.id;
		if (controlledAnswer === undefined) localAnswer = '';
	});

	function updateAnswer(event: Event) {
		const nextAnswer = (event.currentTarget as HTMLTextAreaElement).value;
		if (controlledAnswer === undefined) localAnswer = nextAnswer;
		onAnswerChange(nextAnswer);
	}
</script>

<WidgetSurface widgetType={widget.type} label="Response" {selected} {editing} {onSelect}>
	<div class="widget-label" aria-hidden="true">
		<MessageIcon />
		<span>Student response</span>
	</div>

	<div
		class="content-language response-content"
		lang={widget.content.language}
		dir={widget.content.direction}
	>
		<EditableText
			value={widget.content.prompt}
			editable={editing}
			multiline
			placeholder="Ask the learner a question…"
			ariaLabel="Response prompt"
			language={widget.content.language}
			direction={widget.content.direction}
			class="response-prompt"
			onFocus={onSelect}
			onChange={(prompt) => onContentChange({ ...widget.content, prompt })}
		/>

		<label class="answer-wrap">
			<span class="sr-only">Learner answer</span>
			<Textarea
				value={answer}
				rows={widget.content.format === 'short-text' ? 1 : 4}
				placeholder={widget.content.placeholder}
				lang={widget.content.language}
				dir={widget.content.direction}
				class="answer-field"
				onfocus={onSelect}
				oninput={updateAnswer}
			/>
		</label>
	</div>

	<div class="response-meta" aria-live="polite">
		<span>{widget.content.format === 'short-text' ? 'Short answer' : 'Long answer'}</span>
		<span>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
	</div>
</WidgetSurface>

<style>
	.widget-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-block-end: 0.7rem;
		color: var(--muted-foreground);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.widget-label :global(svg) {
		inline-size: 0.95rem;
		block-size: 0.95rem;
	}

	.response-content,
	.response-content :global(.answer-field) {
		text-align: start;
		unicode-bidi: plaintext;
		font-family: var(--font-content, 'Segoe UI', Tahoma, Arial, sans-serif);
	}

	.response-content:lang(fa),
	.response-content:lang(ar),
	.response-content :global(.answer-field:lang(fa)),
	.response-content :global(.answer-field:lang(ar)) {
		font-family: var(--font-content-arabic, Tahoma, 'Segoe UI', Arial, sans-serif);
	}

	:global(.response-prompt) {
		font-size: clamp(0.96rem, 1.4cqi, 1.12rem);
		font-weight: 620;
		line-height: 1.55;
	}

	.answer-wrap {
		display: block;
		margin-block-start: clamp(0.65rem, 1.6cqi, 1rem);
	}

	.answer-wrap :global(.answer-field) {
		field-sizing: content;
		inline-size: 100%;
		min-block-size: 2.8rem;
		max-block-size: 15rem;
		resize: vertical;
		border: 0;
		border-radius: 0.8rem;
		background: color-mix(in oklch, var(--muted) 72%, transparent);
		padding-block: 0.78rem;
		padding-inline: clamp(0.8rem, 1.8cqi, 1.1rem);
		font-size: clamp(0.9rem, 1.25cqi, 1rem);
		line-height: 1.55;
		outline: 0.0625rem solid transparent;
		outline-offset: 0.15rem;
	}

	.answer-wrap :global(.answer-field:focus) {
		background: color-mix(in oklch, var(--muted) 88%, transparent);
		outline-color: color-mix(in oklch, var(--ring) 70%, transparent);
	}

	.answer-wrap :global(.answer-field::placeholder) {
		color: color-mix(in oklch, var(--muted-foreground) 76%, transparent);
	}

	.response-meta {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-block-start: 0.45rem;
		padding-inline: 0.25rem;
		color: var(--muted-foreground);
		font-size: 0.7rem;
	}
</style>
