<script lang="ts">
	import { Mic } from '@lucide/svelte';
	import VoiceChat from '$lib/features/voice-chat/VoiceChat.svelte';
	import {
		VOICE_CHAT_LEVELS,
		VOICE_CHAT_LIMITS,
		type VoiceChatConfiguration
	} from '$lib/features/voice-chat/model';
	import type { SpeakingSentence } from '$lib/features/speaking-practice/model';
	import type { WidgetInstance } from '../../model/types';
	import WidgetSurface from './WidgetSurface.svelte';

	type VoiceChatInstance = WidgetInstance<'language.voice-chat'>;
	let {
		widget,
		selected = false,
		editing = false,
		sentences = [],
		onSelect,
		onContentChange
	}: {
		widget: VoiceChatInstance;
		selected?: boolean;
		editing?: boolean;
		sentences?: readonly SpeakingSentence[];
		onSelect: () => void;
		onContentChange: (content: VoiceChatInstance['content']) => void;
	} = $props();
	const lessonContext = $derived(
		widget.content.useLessonContext
			? sentences
					.map((sentence) => sentence.text)
					.join(' ')
					.slice(0, VOICE_CHAT_LIMITS.lessonContext)
			: ''
	);
	function update(value: Partial<VoiceChatConfiguration>) {
		onContentChange({ ...widget.content, ...value });
	}
</script>

<WidgetSurface widgetType={widget.type} label="Voice Chat" {selected} {editing} {onSelect}>
	{#if editing}
		<div class="voice-editor" lang="en" dir="ltr">
			<header>
				<Mic size={20} />
				<div>
					<h3>Voice Chat</h3>
					<p>Students speak with an AI partner and request corrections when they want feedback.</p>
				</div>
			</header>
			<label
				>Title<input
					value={widget.content.title}
					maxlength="180"
					oninput={(event) => update({ title: event.currentTarget.value })}
				/></label
			>
			<label
				>Conversation topic<input
					value={widget.content.topic}
					maxlength={VOICE_CHAT_LIMITS.topic}
					placeholder="For example: ordering food at a restaurant"
					oninput={(event) => update({ topic: event.currentTarget.value })}
				/></label
			>
			<label
				>English level<select
					value={widget.content.level}
					onchange={(event) =>
						update({ level: event.currentTarget.value as VoiceChatConfiguration['level'] })}
					>{#each VOICE_CHAT_LEVELS as level (level)}<option value={level}>{level}</option
						>{/each}</select
				></label
			>
			<label
				>Learning goals or role-play scenario<textarea
					rows="3"
					value={widget.content.instructions}
					maxlength={VOICE_CHAT_LIMITS.instructions}
					oninput={(event) => update({ instructions: event.currentTarget.value })}
				></textarea></label
			>
			<label class="check"
				><input
					type="checkbox"
					checked={widget.content.useLessonContext}
					onchange={(event) => update({ useLessonContext: event.currentTarget.checked })}
				/>Use nearby English lesson content as conversation material</label
			>
			<p class="hint">
				Switch to lesson preview to try the conversation. Students choose their AI model and speaker
				in Account settings.
			</p>
		</div>
	{:else}
		{#key widget.id}<VoiceChat configuration={widget.content} {lessonContext} />{/key}
	{/if}
</WidgetSurface>

<style>
	.voice-editor {
		display: grid;
		gap: 0.85rem;
	}
	header {
		display: flex;
		align-items: start;
		gap: 0.65rem;
		color: var(--primary);
	}
	h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--foreground);
	}
	header p,
	.hint {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.6;
	}
	label {
		display: grid;
		gap: 0.4rem;
		font-size: 0.75rem;
		font-weight: 600;
	}
	input:not([type='checkbox']),
	textarea,
	select {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		padding: 0.65rem;
		font: inherit;
		background: var(--background);
		color: var(--foreground);
	}
	textarea {
		resize: vertical;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 400;
	}
</style>
