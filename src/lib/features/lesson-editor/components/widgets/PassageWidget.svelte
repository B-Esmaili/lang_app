<script lang="ts">
	import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import { AudioTranscription } from '$lib/features/audio-transcription';
	import type { WidgetInstance } from '../../model/types';
	import EditableText from './EditableText.svelte';
	import WidgetSurface from './WidgetSurface.svelte';

	type PassageInstance = WidgetInstance<'language.passage'>;

	let {
		widget,
		selected = false,
		editing = false,
		onSelect,
		onContentChange
	}: {
		widget: PassageInstance;
		selected?: boolean;
		editing?: boolean;
		onSelect: () => void;
		onContentChange: (content: PassageInstance['content']) => void;
	} = $props();

	let transcriptionDialogOpen = $state(false);

	function applyTranscript(transcript: string) {
		onContentChange({
			...widget.content,
			text: transcript,
			// Annotation offsets belong to the previous text, so they cannot be
			// safely retained after replacing the passage.
			annotations: []
		});
		transcriptionDialogOpen = false;
	}
</script>

<WidgetSurface widgetType={widget.type} label="Passage" {selected} {editing} {onSelect}>
	<div class="passage-toolbar">
		<div class="widget-label" aria-hidden="true">
			<BookOpenIcon />
			<span>Passage</span>
		</div>
		{#if editing}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={(event) => {
					event.stopPropagation();
					onSelect();
					transcriptionDialogOpen = true;
				}}
			>
				<AudioLinesIcon data-icon="inline-start" /> Generate from MP3
			</Button>
		{/if}
	</div>

	<EditableText
		value={widget.content.text}
		annotations={widget.content.annotations}
		editable={editing}
		multiline
		formatting
		placeholder="Write or paste a passage…"
		ariaLabel="Passage text"
		language={widget.content.language}
		direction={widget.content.direction}
		class="passage-copy"
		onFocus={onSelect}
		onChange={(text, annotations) => onContentChange({ ...widget.content, text, annotations })}
	/>

	<Dialog.Root
		open={transcriptionDialogOpen}
		onOpenChange={(open) => {
			transcriptionDialogOpen = open;
		}}
	>
		<Dialog.Portal>
			<Dialog.Overlay class="passage-transcription-overlay" />
			<Dialog.Content class="passage-transcription-dialog">
				<Dialog.Title class="dialog-title">Generate passage from audio</Dialog.Title>
				<Dialog.Description class="dialog-description">
					Choose an MP3 and its spoken language. The resulting transcript will replace this
					passage's text.
				</Dialog.Description>
				<AudioTranscription
					language={widget.content.language}
					heading="Transcribe MP3"
					description="The transcript is saved to this passage when it is ready."
					onTranscript={(result) => applyTranscript(result.transcript)}
				/>
				<div class="dialog-actions">
					<Button type="button" variant="outline" onclick={() => (transcriptionDialogOpen = false)}
						>Cancel</Button
					>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
</WidgetSurface>

<style>
	.passage-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-block-end: clamp(0.65rem, 1.5cqi, 1rem);
	}

	.widget-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
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

	:global(.passage-copy) {
		font-size: clamp(1rem, 1.5cqi, 1.22rem);
		line-height: 1.75;
	}

	:global(.passage-transcription-overlay) {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: color-mix(in oklab, black 35%, transparent);
		backdrop-filter: blur(0.15rem);
	}

	:global(.passage-transcription-dialog) {
		position: fixed;
		inset: 50% auto auto 50%;
		z-index: 101;
		display: grid;
		gap: 0.8rem;
		inline-size: min(36rem, calc(100vw - 2rem));
		max-block-size: calc(100dvh - 2rem);
		overflow-y: auto;
		transform: translate(-50%, -50%);
		border: 0.0625rem solid var(--border);
		border-radius: 1rem;
		padding: 1rem;
		background: var(--background);
		box-shadow: 0 1.5rem 4rem color-mix(in oklab, black 28%, transparent);
		outline: none;
	}

	:global(.passage-transcription-dialog .dialog-title) {
		font-size: 1rem;
		font-weight: 720;
	}

	:global(.passage-transcription-dialog .dialog-description) {
		color: var(--muted-foreground);
		font-size: 0.73rem;
		line-height: 1.45;
	}

	.dialog-actions {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 32rem) {
		.passage-toolbar {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
