<script lang="ts">
	import {
		RichText,
		richTextAutomaticHighlightOffsets,
		type RichTextDocument
	} from '$lib/components/rich-text';
	import {
		MediaElement,
		MediaElementHighlightSource,
		VideoElement
	} from '$lib/components/media-element';
	import {
		courseMediaResourceCues,
		courseMediaResourceSentenceCues,
		type CourseMediaResource
	} from '$lib/domain/course-media-resource';
	import type { WidgetInstance } from '../../model/types';
	import type { TimedTextPlaybackState } from './runtime-types';
	import WidgetSurface from './WidgetSurface.svelte';

	type RichTextInstance = WidgetInstance<
		'content.rich-text' | 'content.callout' | 'content.quiz' | 'content.vocabulary'
	>;

	let {
		widget,
		selected = false,
		editing = false,
		mediaResources = [],
		onSelect,
		onContentChange,
		onTimedTextPlaybackChange = undefined
	}: {
		widget: RichTextInstance;
		selected?: boolean;
		editing?: boolean;
		mediaResources?: readonly CourseMediaResource[];
		onSelect: () => void;
		onContentChange: (content: RichTextInstance['content']) => void;
		onTimedTextPlaybackChange?: (playback: TimedTextPlaybackState) => void;
	} = $props();

	let highlightSource = $state<MediaElementHighlightSource | null>(null);
	let autoScrollHighlights = $state(true);
	const mediaResource = $derived(
		mediaResources.find((resource) => resource.name === widget.content.highlightResourceName) ??
			null
	);
	const cues = $derived(mediaResource ? courseMediaResourceCues(mediaResource) : []);
	const sentenceCues = $derived(
		mediaResource ? courseMediaResourceSentenceCues(mediaResource) : []
	);
	const automaticHighlightOffsets = $derived(
		richTextAutomaticHighlightOffsets(widget.content.document)
	);
	const playbackSentenceOffsets = $derived.by(() => {
		let cueIndex = 0;
		return sentenceCues.flatMap((sentence) => {
			while (cueIndex < cues.length && cues[cueIndex].endMs <= sentence.startMs) cueIndex += 1;
			for (let index = cueIndex; index < cues.length; index += 1) {
				const cue = cues[index];
				if (cue.startMs >= sentence.endMs) break;
				if (cue.endMs <= sentence.startMs) continue;
				const textOffset = automaticHighlightOffsets.get(cue.id);
				if (textOffset !== undefined) return [{ ...sentence, textOffset }];
			}
			return [];
		});
	});
	const captions = $derived(
		cues.map((cue) => ({
			...cue,
			text:
				mediaResource?.transcribedText?.tokens.find(
					(token) => `${mediaResource.id}:${token.id}` === cue.id
				)?.text ?? ''
		}))
	);

	$effect(() => {
		const source = highlightSource;
		const sentenceOffsets = playbackSentenceOffsets;
		const notify = onTimedTextPlaybackChange;
		if (!source || editing || !notify) return;
		let reportedPlaying = false;
		let reportedOffset: number | null = null;
		const unsubscribe = source.subscribeMedia((snapshot) => {
			const textOffset = snapshot.isPlaying
				? playbackTextOffsetAt(sentenceOffsets, snapshot.currentTimeMs)
				: null;
			if (snapshot.isPlaying === reportedPlaying && textOffset === reportedOffset) return;
			reportedPlaying = snapshot.isPlaying;
			reportedOffset = textOffset;
			notify({
				isPlaying: snapshot.isPlaying,
				sourceKey: snapshot.isPlaying ? 'document' : null,
				textOffset
			});
		});
		return () => {
			unsubscribe();
			if (reportedPlaying) notify({ isPlaying: false, sourceKey: null, textOffset: null });
		};
	});

	function playbackTextOffsetAt(
		ranges: readonly { startMs: number; endMs: number; textOffset: number }[],
		currentTimeMs: number
	): number | null {
		let low = 0;
		let high = ranges.length - 1;
		while (low <= high) {
			const middle = Math.floor((low + high) / 2);
			const range = ranges[middle];
			if (currentTimeMs < range.startMs) high = middle - 1;
			else if (currentTimeMs >= range.endMs) low = middle + 1;
			else return range.textOffset;
		}
		return null;
	}

	function updateDocument(document: RichTextDocument) {
		onContentChange({ ...widget.content, document });
	}

	function toggleAutoScrollHighlights() {
		autoScrollHighlights = !autoScrollHighlights;
	}
</script>

<WidgetSurface widgetType={widget.type} label="Rich text" {selected} {editing} {onSelect}>
	{#if mediaResource?.kind === 'audio'}
		<div class="linked-media" aria-label={`Media resource ${mediaResource.name}`}>
			{#key mediaResource.id}
				<MediaElement
					src={mediaResource.sourceUrl}
					{cues}
					segments={sentenceCues}
					bind:highlightSource
					dockOnScroll={!editing}
					autoScroll={autoScrollHighlights}
					onToggleAutoScroll={toggleAutoScrollHighlights}
					ariaLabel={`${mediaResource.name} audio player`}
				/>
			{/key}
		</div>
	{:else if mediaResource?.kind === 'video'}
		<div class="linked-media" aria-label={`Media resource ${mediaResource.name}`}>
			{#key mediaResource.id}
				<VideoElement
					src={mediaResource.sourceUrl}
					{captions}
					bind:highlightSource
					ariaLabel={`${mediaResource.name} video player`}
				/>
			{/key}
		</div>
	{/if}

	<div class={`rich-text-block ${widget.content.blockStyle ?? 'prose'}`}>
		<RichText
			content={widget.content.document}
			editable={editing}
			toolbar={editing}
			toolbarVisibility="selection"
			language={widget.content.language}
			direction={widget.content.direction}
			{highlightSource}
			{autoScrollHighlights}
			ariaLabel="Rich text content"
			class="course-rich-text"
			onChange={updateDocument}
		/>
	</div>
</WidgetSurface>

<style>
	:global(.course-rich-text) {
		font-size: clamp(1rem, 1.5cqi, 1.18rem);
		line-height: 1.75;
	}
	.rich-text-block.callout {
		border-inline-start: 0.25rem solid #0ea5e9;
		padding: 0.45rem 0.6rem;
		background: color-mix(in oklch, #38bdf8 10%, transparent);
	}
	.rich-text-block.quiz {
		border: 0.0625rem solid color-mix(in oklch, #a855f7 42%, var(--border));
		border-radius: 0.55rem;
		padding: 0.55rem 0.65rem;
		background: color-mix(in oklch, #a855f7 7%, transparent);
	}
	.rich-text-block.vocabulary {
		border-radius: 0.55rem;
		padding: 0.5rem 0.6rem;
		background: color-mix(in oklch, #f59e0b 12%, transparent);
	}

	:global(.course-rich-text .rich-text-toolbar) {
		position: sticky;
		inset-block-start: calc(var(--sidebar-offset, 0rem) + 0.4rem);
		z-index: 5;
		inline-size: max-content;
		max-inline-size: 100%;
		border: 0.0625rem solid var(--border);
		border-radius: 0.55rem;
		padding: 0.25rem;
		background: color-mix(in oklch, var(--background) 94%, transparent);
		box-shadow: 0 0.5rem 1.25rem color-mix(in oklch, var(--foreground) 10%, transparent);
	}

	:global(.course-rich-text .rich-text-prosemirror) {
		border-radius: 0.35rem;
		outline: 0.0625rem solid transparent;
		outline-offset: 0.2rem;
	}

	:global(.course-rich-text .rich-text-prosemirror:focus) {
		outline-color: color-mix(in oklch, var(--ring) 60%, transparent);
	}

	.linked-media {
		margin-block-end: 0.75rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.65rem;
		padding: 0.65rem;
		background: color-mix(in oklch, var(--muted) 35%, transparent);
	}
	:global(.lesson-editor.reader) .linked-media {
		margin-block-end: 0.4rem;
		padding: 0.3rem;
	}

	@media (max-width: 34rem) {
		.linked-media {
			margin-block-end: 0.55rem;
			border-radius: 0.5rem;
			padding: 0.45rem;
		}
	}
</style>
