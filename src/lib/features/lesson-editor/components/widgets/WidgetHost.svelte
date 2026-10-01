<script lang="ts">
	import type { AnyWidgetContent, WidgetInstance } from '../../model/types';
	import type { CourseMediaResource } from '$lib/domain/course-media-resource';
	import AudioWidget from './AudioWidget.svelte';
	import PassageWidget from './PassageWidget.svelte';
	import PronunciationWidget from './PronunciationWidget.svelte';
	import SpeakingPracticeWidget from './SpeakingPracticeWidget.svelte';
	import VoiceChatWidget from './VoiceChatWidget.svelte';
	import RichTextWidget from './RichTextWidget.svelte';
	import ResponseWidget from './ResponseWidget.svelte';
	import type {
		AudioPlaybackState,
		LanguageWidgetRuntimeBindings,
		PronunciationPracticeState
	} from './runtime-types';
	import VocabularyWidget from './VocabularyWidget.svelte';

	let {
		widget,
		selected = false,
		editing = false,
		languageRuntime = undefined,
		mediaResources = [],
		responseAnswer = undefined,
		audioPlayback = undefined,
		pronunciationPractice = undefined,
		onSelect,
		onContentChange,
		onResponseAnswerChange = undefined,
		onAudioPlaybackChange = undefined,
		onPronunciationPracticeChange = undefined
	}: {
		widget: WidgetInstance;
		selected?: boolean;
		editing?: boolean;
		languageRuntime?: LanguageWidgetRuntimeBindings;
		mediaResources?: readonly CourseMediaResource[];
		responseAnswer?: string;
		audioPlayback?: AudioPlaybackState;
		pronunciationPractice?: PronunciationPracticeState;
		onSelect: () => void;
		onContentChange: (content: AnyWidgetContent) => void;
		onResponseAnswerChange?: (answer: string) => void;
		onAudioPlaybackChange?: (playback: AudioPlaybackState) => void;
		onPronunciationPracticeChange?: (practice: PronunciationPracticeState) => void;
	} = $props();

	const resolvedResponseAnswer = $derived(
		responseAnswer ?? languageRuntime?.responseAnswers?.[widget.id]
	);
	const resolvedAudioPlayback = $derived(
		audioPlayback ?? languageRuntime?.audioPlayback?.[widget.id]
	);
	const resolvedPronunciationPractice = $derived(
		pronunciationPractice ?? languageRuntime?.pronunciationPractice?.[widget.id]
	);
</script>

{#if widget.type === 'content.rich-text' || widget.type === 'content.callout' || widget.type === 'content.quiz' || widget.type === 'content.vocabulary'}
	<RichTextWidget
		{widget}
		{selected}
		{editing}
		{mediaResources}
		{onSelect}
		onContentChange={(content) => onContentChange(content)}
		onTimedTextPlaybackChange={(playback) =>
			languageRuntime?.onTimedTextPlaybackChange?.(widget.id, playback)}
	/>
{:else if widget.type === 'language.passage'}
	<PassageWidget
		{widget}
		{selected}
		{editing}
		{onSelect}
		onContentChange={(content) => onContentChange(content)}
	/>
{:else if widget.type === 'language.audio'}
	<AudioWidget
		{widget}
		{selected}
		{editing}
		playback={resolvedAudioPlayback}
		{onSelect}
		onContentChange={(content) => onContentChange(content)}
		onPlaybackChange={(playback) => {
			onAudioPlaybackChange?.(playback);
			languageRuntime?.onAudioPlaybackChange?.(widget.id, playback);
		}}
		onTimedTextPlaybackChange={(playback) =>
			languageRuntime?.onTimedTextPlaybackChange?.(widget.id, playback)}
	/>
{:else if widget.type === 'language.response'}
	<ResponseWidget
		{widget}
		{selected}
		{editing}
		answer={resolvedResponseAnswer}
		{onSelect}
		onContentChange={(content) => onContentChange(content)}
		onAnswerChange={(answer) => {
			onResponseAnswerChange?.(answer);
			languageRuntime?.onResponseAnswerChange?.(widget.id, answer);
		}}
	/>
{:else if widget.type === 'language.vocabulary'}
	<VocabularyWidget
		{widget}
		{selected}
		{editing}
		{onSelect}
		onContentChange={(content) => onContentChange(content)}
	/>
{:else if widget.type === 'language.speaking-practice'}
	<SpeakingPracticeWidget
		{widget}
		{selected}
		{editing}
		sentences={languageRuntime?.speakingSentences ?? []}
		{onSelect}
		onContentChange={(content) => onContentChange(content)}
	/>
{:else if widget.type === 'language.voice-chat'}
	<VoiceChatWidget
		{widget}
		{selected}
		{editing}
		sentences={languageRuntime?.speakingSentences ?? []}
		{onSelect}
		onContentChange={(content) => onContentChange(content)}
	/>
{:else if widget.type === 'language.pronunciation'}
	<PronunciationWidget
		{widget}
		{selected}
		{editing}
		practice={resolvedPronunciationPractice}
		{onSelect}
		onContentChange={(content) => onContentChange(content)}
		onPracticeChange={(practice) => {
			onPronunciationPracticeChange?.(practice);
			languageRuntime?.onPronunciationPracticeChange?.(widget.id, practice);
		}}
	/>
{:else}
	<div class="missing-renderer" role="alert" dir="ltr" lang="en">
		<strong>Widget renderer unavailable</strong>
		<code>{widget.type}</code>
	</div>
{/if}

<style>
	.missing-renderer {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		min-inline-size: 0;
		padding: 0.85rem;
		border-radius: 0.75rem;
		background: color-mix(in oklch, var(--destructive), transparent 94%);
		color: var(--destructive);
		font-size: 0.75rem;
	}

	.missing-renderer code {
		overflow-wrap: anywhere;
	}
</style>
