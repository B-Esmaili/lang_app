<script lang="ts">
	import { MediaElementHighlightSource, type MediaCue } from './media-highlight-source';

	type VideoCaption = Readonly<MediaCue & { text: string }>;
	let {
		src,
		captions = [],
		highlightSource = $bindable<MediaElementHighlightSource | null>(null),
		ariaLabel = 'Video player'
	}: {
		src: string;
		captions?: readonly VideoCaption[];
		highlightSource?: MediaElementHighlightSource | null;
		ariaLabel?: string;
	} = $props();

	let video = $state<HTMLVideoElement>();
	let source = $state<MediaElementHighlightSource | null>(null);
	let currentMs = $state(0);
	const activeCaption = $derived(
		captions.find((cue) => cue.startMs <= currentMs && currentMs < cue.endMs) ?? null
	);
	const captionTrackUrl = $derived(
		`data:text/vtt;charset=utf-8,${encodeURIComponent(toWebVtt(captions))}`
	);

	function toWebVtt(items: readonly VideoCaption[]): string {
		return `WEBVTT\n\n${items.map((item) => `${formatVttTime(item.startMs)} --> ${formatVttTime(item.endMs)}\n${item.text}`).join('\n\n')}`;
	}

	function formatVttTime(milliseconds: number): string {
		const total = Math.max(0, Math.floor(milliseconds));
		const seconds = Math.floor(total / 1_000);
		return `${String(Math.floor(seconds / 3_600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(total % 1_000).padStart(3, '0')}`;
	}

	$effect(() => source?.setCues(captions));
</script>

<div class="video-element">
	<video
		bind:this={video}
		{src}
		controls
		playsinline
		aria-label={ariaLabel}
		onloadedmetadata={() => {
			const controller = highlightSource ?? new MediaElementHighlightSource(captions);
			highlightSource = controller;
			source = controller;
			controller.setDuration(video?.duration ?? 0);
			controller.setReady(true);
		}}
		onplay={() => source?.setPlaying(true)}
		onpause={() => source?.setPlaying(false)}
		onended={() => source?.setPlaying(false)}
		onerror={() => source?.setError('Unable to load this video.')}
		ontimeupdate={() => {
			currentMs = (video?.currentTime ?? 0) * 1_000;
			source?.setCurrentTime(video?.currentTime ?? 0);
		}}
	><track kind="captions" srclang="en" label="Transcript" src={captionTrackUrl} /></video>
	{#if activeCaption}<p class="video-caption">{activeCaption.text}</p>{/if}
</div>

<style>
	.video-element { position: relative; overflow: hidden; border-radius: 0.65rem; background: #0f172a; }
	video { display: block; inline-size: 100%; max-block-size: min(70svh, 34rem); background: #0f172a; }
	.video-caption { position: absolute; inset-inline: 0.75rem; inset-block-end: 3.5rem; margin: 0; padding: 0.35rem 0.55rem; border-radius: 0.35rem; background: color-mix(in srgb, #000 70%, transparent); color: white; font-size: clamp(0.8rem, 1.8vw, 1rem); line-height: 1.35; text-align: center; pointer-events: none; }
</style>
