<script lang="ts">
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import VolumeIcon from '@lucide/svelte/icons/volume-2';
	import { Timecode, TranscribedText, transcriptTextSources } from '$lib/domain/transcribed-text';
	import { Button } from '$lib/components/ui/button';
	import { TimedTranscript } from '$lib/features/transcribed-text';
	import { onDestroy, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import type { WidgetInstance } from '../../model/types';
	import Waveform from './Waveform.svelte';
	import EditableText from './EditableText.svelte';
	import type { AudioPlaybackState, TimedTextPlaybackState } from './runtime-types';
	import WidgetSurface from './WidgetSurface.svelte';
	import { AudioTranscription } from '$lib/features/audio-transcription';

	type AudioInstance = WidgetInstance<'language.audio'>;

	const fallbackWaveform = [
		0.34, 0.58, 0.42, 0.76, 0.5, 0.88, 0.62, 0.46, 0.72, 0.95, 0.55, 0.68, 0.4, 0.8, 0.61, 0.48,
		0.7, 0.36, 0.58, 0.84, 0.65, 0.44, 0.75, 0.52
	];

	let {
		widget,
		selected = false,
		editing = false,
		playback: controlledPlayback = undefined,
		onSelect,
		onContentChange,
		onPlaybackChange = () => undefined,
		onTimedTextPlaybackChange = undefined
	}: {
		widget: AudioInstance;
		selected?: boolean;
		editing?: boolean;
		playback?: AudioPlaybackState;
		onSelect: () => void;
		onContentChange: (content: AudioInstance['content']) => void;
		onPlaybackChange?: (playback: AudioPlaybackState) => void;
		onTimedTextPlaybackChange?: (playback: TimedTextPlaybackState) => void;
	} = $props();
	const stoppedTimedTextPlayback = {
		isPlaying: false,
		sourceKey: null,
		textOffset: null
	} satisfies TimedTextPlaybackState;

	let localPlayback = $state<AudioPlaybackState>({ playing: false, progressSeconds: 0 });
	let currentWidgetId = $state('');
	let playbackEpoch = $state(0);
	let media: HTMLAudioElement | undefined = $state();
	let mediaDurationSeconds = $state<number | null>(null);
	let reportedTimedTextPlayback: TimedTextPlaybackState = stoppedTimedTextPlayback;
	let reportedTimedTextListener: ((playback: TimedTextPlaybackState) => void) | undefined;
	let reportedTimedTextWidgetId = '';

	const duration = $derived(
		Math.max(mediaDurationSeconds ?? widget.content.durationSeconds ?? 36, 1)
	);
	const waveform = $derived(
		widget.content.waveform.length > 0 ? widget.content.waveform : fallbackWaveform
	);
	const playback = $derived(controlledPlayback ?? localPlayback);
	const playing = $derived(playback.playing);
	const elapsed = $derived(Math.max(0, Math.min(playback.progressSeconds, duration)));
	const progress = $derived(Math.min(elapsed / duration, 1));
	const transcribedText = $derived.by(() => {
		if (!widget.content.transcribedText) return null;
		try {
			return TranscribedText.rehydrate(widget.content.transcribedText);
		} catch {
			return null;
		}
	});
	const activeTokenId = $derived(
		transcribedText?.tokenAt(Timecode.fromSeconds(elapsed))?.id ?? null
	);
	const timedTextLocations = $derived.by(() => {
		const locations = new SvelteMap<string, { sourceKey: string; textOffset: number }>();
		if (!transcribedText || transcribedText.inspect().alignment !== 'synced') return locations;
		for (const source of transcriptTextSources(transcribedText.tokens())) {
			for (const location of source.tokenLocations) {
				locations.set(location.tokenId, {
					sourceKey: source.key,
					textOffset: location.textOffset
				});
			}
		}
		return locations;
	});
	const activeTimedTextLocation = $derived(
		activeTokenId ? (timedTextLocations.get(activeTokenId) ?? null) : null
	);

	$effect(() => {
		if (widget.id === currentWidgetId) return;
		currentWidgetId = widget.id;
		playbackEpoch += 1;
		mediaDurationSeconds = null;
		if (controlledPlayback === undefined) {
			localPlayback = { playing: false, progressSeconds: 0 };
		}
	});

	$effect(() => {
		const activeEpoch = playbackEpoch;
		if (!playing || media) return;
		const startedAt = performance.now() - untrack(() => elapsed) * 1000;
		const timer = window.setInterval(() => {
			if (activeEpoch !== playbackEpoch) return;
			const nextElapsed = (performance.now() - startedAt) / 1000;
			if (nextElapsed >= duration) {
				setPlayback({ playing: false, progressSeconds: 0 });
			} else {
				setPlayback({ ...untrack(() => playback), progressSeconds: nextElapsed });
			}
		}, 100);

		return () => window.clearInterval(timer);
	});

	$effect(() => {
		if (!media) return;
		const expected = controlledPlayback;
		if (!expected) return;
		if (Math.abs(media.currentTime - expected.progressSeconds) > 0.25) {
			media.currentTime = expected.progressSeconds;
		}
		if (expected.playing && media.paused) {
			void media.play().catch(() => setPlayback({ ...expected, playing: false }));
		}
		if (!expected.playing && !media.paused) media.pause();
	});

	$effect(() => {
		const listener = onTimedTextPlaybackChange;
		const widgetId = widget.id;
		if (listener !== reportedTimedTextListener || widgetId !== reportedTimedTextWidgetId) {
			if (reportedTimedTextPlayback.isPlaying) {
				reportedTimedTextListener?.(stoppedTimedTextPlayback);
			}
			reportedTimedTextListener = listener;
			reportedTimedTextWidgetId = widgetId;
			reportedTimedTextPlayback = stoppedTimedTextPlayback;
		}
		const location = activeTimedTextLocation;
		const next: TimedTextPlaybackState = playing
			? {
					isPlaying: true,
					sourceKey: location?.sourceKey ?? null,
					textOffset: location?.textOffset ?? null
				}
			: stoppedTimedTextPlayback;
		if (
			next.isPlaying === reportedTimedTextPlayback.isPlaying &&
			next.sourceKey === reportedTimedTextPlayback.sourceKey &&
			next.textOffset === reportedTimedTextPlayback.textOffset
		) {
			return;
		}
		reportedTimedTextPlayback = next;
		listener?.(next);
	});

	onDestroy(() => {
		if (reportedTimedTextPlayback.isPlaying) {
			reportedTimedTextListener?.(stoppedTimedTextPlayback);
		}
	});

	function togglePlayback() {
		onSelect();
		playbackEpoch += 1;
		if (media) {
			if (media.paused) {
				void media.play().catch(() => setPlayback({ ...playback, playing: false }));
			} else {
				media.pause();
			}
			return;
		}
		setPlayback({
			playing: !playing,
			progressSeconds: !playing && elapsed >= duration ? 0 : elapsed
		});
	}

	function seek(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		playbackEpoch += 1;
		const progressSeconds = Number(input.value) * duration;
		if (media) media.currentTime = progressSeconds;
		setPlayback({ ...playback, progressSeconds });
	}

	function mediaTimeChanged() {
		if (!media) return;
		setPlayback({ playing: !media.paused, progressSeconds: media.currentTime });
	}

	function mediaLoaded() {
		if (!media || !Number.isFinite(media.duration)) return;
		mediaDurationSeconds = media.duration;
		setPlayback({ ...playback, progressSeconds: media.currentTime });
	}

	function updateTranscript(transcript: string) {
		const timing = transcribedText?.withEditedText(transcript).toSnapshot();
		onContentChange({
			...widget.content,
			transcript,
			...(timing ? { transcribedText: timing } : {})
		});
	}

	function setPlayback(nextPlayback: AudioPlaybackState) {
		const normalizedPlayback = {
			playing: nextPlayback.playing,
			progressSeconds: Math.max(0, Math.min(nextPlayback.progressSeconds, duration))
		};
		if (controlledPlayback === undefined) localPlayback = normalizedPlayback;
		onPlaybackChange(normalizedPlayback);
	}

	function formatTime(seconds: number) {
		const wholeSeconds = Math.max(0, Math.round(seconds));
		const minutes = Math.floor(wholeSeconds / 60);
		return `${minutes}:${String(wholeSeconds % 60).padStart(2, '0')}`;
	}
</script>

<WidgetSurface widgetType={widget.type} label="Audio" {selected} {editing} {onSelect}>
	<div class="audio-heading">
		<span class="icon-well" aria-hidden="true"><VolumeIcon /></span>
		<div
			class="content-language audio-copy"
			lang={widget.content.language}
			dir={widget.content.direction}
		>
			<EditableText
				value={widget.content.title}
				editable={editing}
				multiline={false}
				tag="h3"
				placeholder="Audio title"
				ariaLabel="Audio title"
				language={widget.content.language}
				direction={widget.content.direction}
				class="audio-title"
				onFocus={onSelect}
				onChange={(title) => onContentChange({ ...widget.content, title })}
			/>
			{#if widget.content.transcript || editing}
				{#if editing}
					<EditableText
						value={widget.content.transcript}
						editable
						placeholder="Add an optional transcript…"
						ariaLabel="Audio transcript"
						language={widget.content.language}
						direction={widget.content.direction}
						class="audio-transcript"
						onFocus={onSelect}
						onChange={updateTranscript}
					/>
				{:else if widget.content.transcribedText}
					<TimedTranscript
						value={widget.content.transcribedText}
						{activeTokenId}
						language={widget.content.language}
						direction={widget.content.direction}
						class="audio-transcript"
					/>
				{:else}
					<EditableText
						value={widget.content.transcript}
						editable={false}
						placeholder="Add an optional transcript…"
						ariaLabel="Audio transcript"
						language={widget.content.language}
						direction={widget.content.direction}
						class="audio-transcript"
						onFocus={onSelect}
						onChange={() => undefined}
					/>
				{/if}
			{/if}
		</div>
	</div>

	{#if editing}
		<AudioTranscription
			compact
			language={widget.content.language}
			heading="Generate transcript"
			description="Choose an MP3 to fill this audio widget's transcript."
			onTranscript={(result) =>
				onContentChange({
					...widget.content,
					transcript: result.transcript,
					transcribedText: result.transcribedText,
					durationSeconds: result.durationSeconds ?? widget.content.durationSeconds
				})}
		/>
		<label class="audio-source">
			<span>Audio source URL</span>
			<input
				type="url"
				value={widget.content.sourceUrl ?? ''}
				placeholder="https://example.com/lesson.mp3"
				onchange={(event) => {
					const sourceUrl = event.currentTarget.value.trim() || null;
					onContentChange({ ...widget.content, sourceUrl });
				}}
			/>
		</label>
	{/if}

	<div class="player" aria-label={`Audio player for ${widget.content.title}`}>
		<Button
			type="button"
			variant="default"
			size="icon-lg"
			class="play-button"
			aria-label={playing ? 'Pause audio preview' : 'Play audio preview'}
			onclick={(event) => {
				event.stopPropagation();
				togglePlayback();
			}}
		>
			{#if playing}<PauseIcon />{:else}<PlayIcon />{/if}
		</Button>

		<div class="timeline">
			<Waveform samples={waveform} {progress} color="#beb3c9" playedColor="#695085" />
			<input
				type="range"
				min="0"
				max="1"
				step="0.001"
				value={progress}
				aria-label="Audio position"
				style:--progress={`${progress * 100}%`}
				onfocus={onSelect}
				oninput={seek}
			/>
		</div>

		<output aria-live="off">{formatTime(elapsed)} / {formatTime(duration)}</output>
	</div>
	{#if widget.content.sourceUrl}
		<audio
			bind:this={media}
			class="native-audio"
			src={widget.content.sourceUrl}
			preload="metadata"
			onloadedmetadata={mediaLoaded}
			ontimeupdate={mediaTimeChanged}
			onplay={mediaTimeChanged}
			onpause={mediaTimeChanged}
			onseeked={mediaTimeChanged}
			onended={mediaTimeChanged}
		></audio>
	{/if}
</WidgetSurface>

<style>
	.audio-heading {
		display: flex;
		align-items: flex-start;
		gap: clamp(0.7rem, 1.5cqi, 1rem);
		margin-block-end: 1rem;
	}

	.icon-well {
		display: grid;
		flex: 0 0 auto;
		inline-size: clamp(2.15rem, 5cqi, 2.75rem);
		aspect-ratio: 1;
		place-items: center;
		border-radius: 999rem;
		background: color-mix(in oklch, var(--primary) 8%, transparent);
		color: var(--foreground);
	}

	.icon-well :global(svg) {
		inline-size: 45%;
		block-size: 45%;
	}

	.audio-copy {
		flex: 1;
		min-inline-size: 0;
		text-align: start;
		unicode-bidi: plaintext;
	}

	.content-language {
		font-family: var(--font-content, 'Segoe UI', Tahoma, Arial, sans-serif);
	}

	.content-language:lang(fa),
	.content-language:lang(ar) {
		font-family: var(--font-content-arabic, Tahoma, 'Segoe UI', Arial, sans-serif);
	}

	:global(.audio-title) {
		font-size: clamp(0.98rem, 1.5cqi, 1.16rem);
		font-weight: 680;
		line-height: 1.35;
	}

	:global(.audio-transcript) {
		margin-block-start: 0.28rem;
		color: var(--muted-foreground);
		font-size: clamp(0.82rem, 1.2cqi, 0.95rem);
		line-height: 1.55;
	}

	.player {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: clamp(0.6rem, 1.7cqi, 1rem);
		padding: clamp(0.65rem, 1.5cqi, 0.9rem);
		border-radius: 0.9rem;
		background: color-mix(in oklch, var(--muted) 72%, transparent);
	}

	.player :global(.play-button) {
		display: grid;
		inline-size: clamp(2.25rem, 5cqi, 2.75rem);
		aspect-ratio: 1;
		place-items: center;
		border-radius: 999rem;
		background: var(--foreground);
		color: var(--background);
		transition: transform 150ms ease;
	}

	.player :global(.play-button:hover) {
		transform: scale(1.04);
	}

	.player :global(.play-button:focus-visible) {
		outline: 0.0625rem solid var(--ring);
		outline-offset: 0.2rem;
	}

	.player :global(.play-button svg) {
		inline-size: 42%;
		block-size: 42%;
	}

	.timeline {
		position: relative;
		min-inline-size: 0;
		block-size: 3rem;
		border-radius: 0.25rem;
	}

	.timeline:focus-within {
		outline: 0.125rem solid var(--ring);
		outline-offset: 0.2rem;
	}

	.timeline input {
		position: absolute;
		inset: 0;
		inline-size: 100%;
		block-size: 100%;
		cursor: pointer;
		opacity: 0;
	}

	.player output {
		min-inline-size: 5.5rem;
		color: var(--muted-foreground);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	.native-audio {
		display: none;
	}

	.audio-source {
		display: grid;
		gap: 0.3rem;
		margin-block-end: 0.8rem;
		color: var(--muted-foreground);
		font-size: 0.62rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.audio-source input {
		inline-size: 100%;
		min-block-size: 2.15rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.6rem;
		padding-inline: 0.65rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		font-size: 0.72rem;
		letter-spacing: normal;
		text-transform: none;
	}

	.audio-source input:focus {
		border-color: color-mix(in oklch, var(--editor-selection) 55%, var(--border));
		outline: 0.125rem solid color-mix(in oklch, var(--editor-selection) 18%, transparent);
	}

	@container (width < 25rem) {
		.player {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.player output {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.player :global(.play-button) {
			transition: none;
		}
	}
</style>
