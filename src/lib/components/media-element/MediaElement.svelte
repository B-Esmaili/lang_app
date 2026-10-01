<script lang="ts">
	import FastForwardIcon from '@lucide/svelte/icons/fast-forward';
	import GaugeIcon from '@lucide/svelte/icons/gauge';
	import LocateFixedIcon from '@lucide/svelte/icons/locate-fixed';
	import LocateOffIcon from '@lucide/svelte/icons/locate-off';
	import PauseIcon from '@lucide/svelte/icons/pause';
	import PlayIcon from '@lucide/svelte/icons/play';
	import RewindIcon from '@lucide/svelte/icons/rewind';
	import Repeat2Icon from '@lucide/svelte/icons/repeat-2';
	import SkipBackIcon from '@lucide/svelte/icons/skip-back';
	import SkipForwardIcon from '@lucide/svelte/icons/skip-forward';
	import VolumeIcon from '@lucide/svelte/icons/volume-2';
	import type WaveSurfer from 'wavesurfer.js';
	import { onMount, untrack } from 'svelte';
	import {
		MediaElementHighlightSource,
		type MediaCue,
		type MediaSegment,
		type MediaElementSnapshot
	} from './media-highlight-source';

	type MediaElementProps = {
		src: string;
		cues?: readonly MediaCue[];
		segments?: readonly MediaSegment[];
		/** Bind this and give it to RichText as `highlightSource`. */
		highlightSource?: MediaElementHighlightSource | null;
		waveColor?: string;
		progressColor?: string;
		cursorColor?: string;
		height?: number;
		/** Float at the bottom of the viewport after the player scrolls out of view during playback. */
		dockOnScroll?: boolean;
		/** Whether linked transcript text should follow the active cue. */
		autoScroll?: boolean;
		onToggleAutoScroll?: () => void;
		class?: string;
		ariaLabel?: string;
	};

	let {
		src,
		cues = [],
		segments = [],
		highlightSource = $bindable<MediaElementHighlightSource | null>(null),
		waveColor = '#94a3b8',
		progressColor = '#0ea5e9',
		cursorColor = '#0284c7',
		height = 64,
		dockOnScroll = false,
		autoScroll = true,
		onToggleAutoScroll = undefined,
		class: className = '',
		ariaLabel = 'Audio player'
	}: MediaElementProps = $props();

	let waveform = $state<HTMLDivElement>();
	let source = $state<MediaElementHighlightSource | null>(null);
	let mediaState = $state<MediaElementSnapshot>({
		currentTimeMs: 0,
		durationMs: null,
		isReady: false,
		isPlaying: false,
		error: null,
		activeCueIds: [],
		cueCount: 0
	});
	let volume = $state(1);
	let playbackRate = $state(1);
	const activeSegment = $derived(
		segments.find(
			(segment) =>
				segment.startMs <= mediaState.currentTimeMs && mediaState.currentTimeMs < segment.endMs
		) ?? null
	);
	let volumeMenuOpen = $state(false);
	let volumeControl = $state<HTMLDivElement>();
	let dockAnchor = $state<HTMLDivElement>();
	let mediaElement = $state<HTMLElement>();
	let docked = $state(false);
	let dockHeight = $state(0);
	let recreate = (() => undefined) as (url: string) => void;
	let initializedSrc: string | null = null;
	let anchorPastViewport = false;

	function formatTime(milliseconds: number | null): string {
		const totalSeconds = Math.max(0, Math.floor((milliseconds ?? 0) / 1_000));
		return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
	}

	function playPause() {
		void player?.playPause();
	}

	function skip(seconds: number) {
		player?.skip(seconds);
	}

	function setVolume(nextVolume: number) {
		volume = Math.min(1, Math.max(0, Number.isFinite(nextVolume) ? nextVolume : 1));
		player?.setVolume(volume);
	}

	function playSegment(index: number) {
		const segment = segments[index];
		if (!segment || !player) return;
		void player.play(segment.startMs / 1_000, segment.endMs / 1_000);
	}

	function moveSegment(offset: -1 | 1) {
		if (!segments.length) return;
		const current = segments.findIndex((segment) => segment === activeSegment);
		playSegment(Math.max(0, Math.min(segments.length - 1, (current < 0 ? 0 : current) + offset)));
	}

	function repeatSegment() {
		const index = activeSegment ? segments.indexOf(activeSegment) : -1;
		playSegment(index < 0 ? 0 : index);
	}

	function cyclePlaybackRate() {
		const rates = [0.75, 1, 1.25] as const;
		playbackRate =
			rates[(rates.indexOf(playbackRate as (typeof rates)[number]) + 1) % rates.length];
		player?.setPlaybackRate(playbackRate);
	}

	function refreshDock() {
		const nextDocked = dockOnScroll && anchorPastViewport;
		if (nextDocked && mediaElement) dockHeight = mediaElement.offsetHeight;
		docked = nextDocked;
	}

	let player: WaveSurfer | null = null;

	onMount(() => {
		const controller = highlightSource ?? new MediaElementHighlightSource(cues);
		highlightSource = controller;
		source = controller;
		const unsubscribe = controller.subscribeMedia((snapshot) => (mediaState = snapshot));
		let scrollFrame: number | null = null;
		const updateDockPosition = () => {
			if (scrollFrame !== null) return;
			scrollFrame = requestAnimationFrame(() => {
				scrollFrame = null;
				anchorPastViewport = Boolean(dockAnchor && dockAnchor.getBoundingClientRect().bottom < 0);
				refreshDock();
			});
		};
		document.addEventListener('scroll', updateDockPosition, { capture: true, passive: true });
		window.addEventListener('resize', updateDockPosition, { passive: true });
		const closeVolumeMenuOnOutsidePress = (event: PointerEvent) => {
			if (volumeControl && !volumeControl.contains(event.target as Node)) volumeMenuOpen = false;
		};
		document.addEventListener('pointerdown', closeVolumeMenuOnOutsidePress, { capture: true });
		updateDockPosition();
		const resizeObserver = new ResizeObserver(() => {
			if (docked && mediaElement) dockHeight = mediaElement.offsetHeight;
		});
		if (mediaElement) resizeObserver.observe(mediaElement);
		let destroyed = false;
		let loadVersion = 0;
		controller.setCueActivationHandler((cue) => {
			const duration = player?.getDuration() ?? 0;
			if (!player || !Number.isFinite(duration) || duration <= 0) return false;
			const seconds = Math.min(cue.startMs / 1_000, duration);
			player.setTime(seconds);
			controller.setCurrentTime(seconds);
			return true;
		});

		recreate = (url: string) => {
			if (!waveform) return;
			initializedSrc = url;
			const version = ++loadVersion;
			player?.destroy();
			player = null;
			controller.reset();

			void import('wavesurfer.js')
				.then(({ default: WaveSurfer }) => {
					if (destroyed || version !== loadVersion || !waveform) return;
					const instance = WaveSurfer.create({
						container: waveform,
						url,
						height,
						waveColor,
						progressColor,
						cursorColor,
						barWidth: 2,
						barGap: 1,
						barRadius: 2
					});
					player = instance;
					instance.setVolume(volume);
					instance.on('ready', (duration) => {
						controller.setDuration(duration);
						controller.setReady(true);
					});
					instance.on('timeupdate', (currentTime) => controller.setCurrentTime(currentTime));
					instance.on('play', () => {
						controller.setPlaying(true);
						refreshDock();
					});
					instance.on('pause', () => {
						controller.setPlaying(false);
						refreshDock();
					});
					instance.on('finish', () => {
						controller.setPlaying(false);
						refreshDock();
					});
					instance.on('error', (error) => controller.setError(error));
				})
				.catch((error: unknown) =>
					controller.setError(error instanceof Error ? error : 'Unable to load the audio player.')
				);
		};

		recreate(src);
		return () => {
			destroyed = true;
			loadVersion += 1;
			player?.destroy();
			player = null;
			controller.reset();
			controller.setCueActivationHandler(null);
			unsubscribe();
			document.removeEventListener('scroll', updateDockPosition, { capture: true });
			window.removeEventListener('resize', updateDockPosition);
			document.removeEventListener('pointerdown', closeVolumeMenuOnOutsidePress, { capture: true });
			if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
			resizeObserver.disconnect();
			recreate = () => undefined;
		};
	});

	$effect(() => {
		const enabled = dockOnScroll;
		untrack(() => {
			if (!enabled) docked = false;
			else refreshDock();
		});
	});

	$effect(() => {
		source?.setCues(cues);
	});

	$effect(() => {
		const url = src;
		if (initializedSrc !== url) recreate(url);
	});
</script>

<div
	bind:this={dockAnchor}
	class="media-element-anchor"
	style:min-block-size={docked && dockHeight ? `${dockHeight}px` : undefined}
>
	<section
		bind:this={mediaElement}
		class={`media-element ${className}`}
		class:is-docked={docked}
		data-reading-overlay={docked ? 'bottom' : undefined}
		aria-label={ariaLabel}
	>
		<div bind:this={waveform} class="media-element-waveform"></div>
		<input
			class="media-element-seek"
			type="range"
			min="0"
			max={mediaState.durationMs ?? 1}
			step="100"
			value={mediaState.currentTimeMs}
			disabled={!mediaState.isReady}
			aria-label="Audio progress"
			aria-valuetext={`${formatTime(mediaState.currentTimeMs)} of ${formatTime(mediaState.durationMs)}`}
			oninput={(event) => player?.setTime(event.currentTarget.valueAsNumber / 1_000)}
		/>
		<output class="media-element-timestamp" aria-label="Audio position"
			>{formatTime(mediaState.currentTimeMs)} / {formatTime(mediaState.durationMs)}</output
		>
		<div class="media-element-controls">
			<div class="media-element-control-actions">
				<button
					type="button"
					class="media-element-icon-button"
					disabled={!mediaState.isReady}
					onclick={() => skip(-10)}
					aria-label="Back 10 seconds"
					data-tooltip="Back 10 seconds"
				>
					<RewindIcon aria-hidden="true" />
				</button>
				<button
					type="button"
					class="media-element-icon-button"
					disabled={!mediaState.isReady}
					onclick={playPause}
					aria-label={mediaState.isPlaying ? 'Pause audio' : 'Play audio'}
					data-tooltip={mediaState.isPlaying ? 'Pause audio' : 'Play audio'}
					>{#if mediaState.isPlaying}<PauseIcon aria-hidden="true" />{:else}<PlayIcon
							aria-hidden="true"
						/>{/if}</button
				>
				<button
					type="button"
					class="media-element-icon-button"
					disabled={!mediaState.isReady}
					onclick={() => skip(10)}
					aria-label="Forward 10 seconds"
					data-tooltip="Forward 10 seconds"
				>
					<FastForwardIcon aria-hidden="true" />
				</button>
				<div bind:this={volumeControl} class="media-element-volume">
					<button
						type="button"
						class="media-element-icon-button"
						disabled={!mediaState.isReady}
						onclick={() => (volumeMenuOpen = !volumeMenuOpen)}
						aria-label="Volume"
						aria-expanded={volumeMenuOpen}
						aria-haspopup="dialog"
						data-tooltip="Volume"
					>
						<VolumeIcon aria-hidden="true" />
					</button>
					{#if volumeMenuOpen}
						<div
							class="media-element-volume-popover"
							role="dialog"
							aria-label="Volume control"
							tabindex="-1"
							onkeydown={(event) => {
								if (event.key === 'Escape') volumeMenuOpen = false;
							}}
						>
							<label>
								<span>Volume</span>
								<input
									type="range"
									min="0"
									max="1"
									step="0.01"
									value={volume}
									aria-valuetext={`${Math.round(volume * 100)}%`}
									oninput={(event) => setVolume(event.currentTarget.valueAsNumber)}
								/>
							</label>
						</div>
					{/if}
				</div>
				{#if segments.length}
					<button
						type="button"
						class="media-element-icon-button"
						disabled={!mediaState.isReady}
						onclick={() => moveSegment(-1)}
						aria-label="Previous sentence"
						data-tooltip="Previous sentence"><SkipBackIcon aria-hidden="true" /></button
					>
					<button
						type="button"
						class="media-element-icon-button"
						disabled={!mediaState.isReady}
						onclick={repeatSegment}
						aria-label="Repeat sentence"
						data-tooltip="Repeat sentence"><Repeat2Icon aria-hidden="true" /></button
					>
					<button
						type="button"
						class="media-element-icon-button"
						disabled={!mediaState.isReady}
						onclick={() => moveSegment(1)}
						aria-label="Next sentence"
						data-tooltip="Next sentence"><SkipForwardIcon aria-hidden="true" /></button
					>
				{/if}
				<button
					type="button"
					class="media-element-icon-button playback-rate"
					disabled={!mediaState.isReady}
					onclick={cyclePlaybackRate}
					aria-label={`Playback speed ${playbackRate}×`}
					data-tooltip={`${playbackRate}× speed`}
					><GaugeIcon aria-hidden="true" /><span>{playbackRate}×</span></button
				>
				{#if onToggleAutoScroll}
					<button
						type="button"
						class="media-element-icon-button"
						onclick={onToggleAutoScroll}
						aria-label={autoScroll
							? 'Pause automatic transcript scrolling'
							: 'Resume automatic transcript scrolling'}
						aria-pressed={autoScroll}
						data-tooltip={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
					>
						{#if autoScroll}<LocateFixedIcon aria-hidden="true" />{:else}<LocateOffIcon
								aria-hidden="true"
							/>{/if}
					</button>
				{/if}
			</div>
		</div>
		{#if mediaState.error}
			<p class="media-element-error" role="alert">{mediaState.error}</p>
		{/if}
	</section>
</div>

<style>
	.media-element {
		min-inline-size: 0;
	}
	.media-element-seek {
		display: none;
	}
	.media-element.is-docked {
		position: fixed;
		inset-block-end: calc(
			var(--reader-visual-bottom, 0px) +
				max(0.75rem, calc(var(--app-bottom-inset, 0rem) + 0.75rem), env(safe-area-inset-bottom))
		);
		left: 50%;
		z-index: 50;
		inline-size: min(31rem, calc(100vw - 1.5rem));
		transform: translateX(-50%);
		border: 0.0625rem solid var(--border);
		border-radius: 0.8rem;
		padding: 0.65rem;
		background: color-mix(in oklch, var(--background) 94%, transparent);
		box-shadow: 0 1rem 2.5rem color-mix(in oklch, var(--foreground) 20%, transparent);
		backdrop-filter: blur(0.75rem);
	}
	.media-element-waveform {
		min-block-size: 4rem;
		border-radius: 0.5rem;
		background: color-mix(in oklch, var(--muted, #e2e8f0) 60%, transparent);
		overflow: hidden;
	}
	.media-element.is-docked .media-element-waveform {
		min-block-size: 2.75rem;
	}
	.media-element-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		min-inline-size: 0;
		gap: 0.4rem;
		margin-block-start: 0.5rem;
	}
	.media-element-control-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		max-inline-size: 100%;
		gap: inherit;
	}
	.media-element.is-docked .media-element-controls {
		gap: 0.3rem;
		margin-block-start: 0.4rem;
	}
	.media-element-controls button {
		min-block-size: 2rem;
		padding-inline: 0.6rem;
		border: 0.0625rem solid var(--border, currentColor);
		border-radius: 0.35rem;
		background: var(--background, transparent);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.media-element-icon-button {
		position: relative;
		display: grid;
		inline-size: 2.5rem;
		min-block-size: 2.5rem;
		place-items: center;
		padding: 0;
	}
	.media-element-icon-button :global(svg) {
		inline-size: 1.15rem;
		block-size: 1.15rem;
	}
	.playback-rate {
		gap: 0.08rem;
	}
	.playback-rate span {
		font-size: 0.55rem;
		font-weight: 700;
		line-height: 1;
	}
	.media-element.is-docked .media-element-icon-button {
		inline-size: 2rem;
		min-block-size: 2rem;
	}
	.media-element.is-docked .media-element-icon-button :global(svg) {
		inline-size: 1rem;
		block-size: 1rem;
	}
	.media-element-icon-button::after {
		position: absolute;
		inset-block-end: calc(100% + 0.45rem);
		left: 50%;
		z-index: 10;
		inline-size: max-content;
		max-inline-size: min(14rem, 90vw);
		transform: translateX(-50%) translateY(0.2rem);
		border-radius: 0.3rem;
		padding: 0.3rem 0.45rem;
		background: var(--foreground, #0f172a);
		color: var(--background, white);
		content: attr(data-tooltip);
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.2;
		pointer-events: none;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 120ms ease,
			transform 120ms ease,
			visibility 120ms ease;
	}
	.media-element-icon-button:hover::after,
	.media-element-icon-button:focus-visible::after {
		transform: translateX(-50%) translateY(0);
		opacity: 1;
		visibility: visible;
	}
	.media-element-controls button:disabled {
		cursor: wait;
		opacity: 0.5;
	}
	.media-element-timestamp {
		display: block;
		margin-block-start: 0.25rem;
		text-align: end;
		font-variant-numeric: tabular-nums;
		font-size: 0.875rem;
		opacity: 0.75;
	}
	.media-element-volume {
		position: relative;
		display: flex;
		align-items: center;
	}
	.media-element-volume-popover {
		position: absolute;
		inset-block-end: calc(100% + 0.45rem);
		left: 50%;
		z-index: 20;
		inline-size: 13rem;
		transform: translateX(-50%);
		border: 0.0625rem solid var(--border);
		border-radius: 0.5rem;
		padding: 0.65rem;
		background: var(--background);
		box-shadow: 0 0.6rem 1.5rem color-mix(in oklch, var(--foreground) 16%, transparent);
	}
	.media-element-volume-popover label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.media-element-volume-popover input {
		inline-size: 100%;
		accent-color: var(--primary, #0284c7);
	}
	@media (max-width: 38rem) {
		.media-element-waveform {
			min-block-size: 3rem;
			border-radius: 0.4rem;
		}
		.media-element-timestamp {
			margin-block-start: 0.2rem;
			font-size: 0.75rem;
			line-height: 1.2;
		}
		.media-element-controls {
			gap: 0.35rem;
			margin-block-start: 0.35rem;
		}
		.media-element-icon-button {
			inline-size: 2.75rem;
			min-block-size: 2.75rem;
		}
		.media-element-volume-popover {
			inline-size: min(13rem, calc(100vw - 2rem));
			padding: 0.5rem;
		}
		.media-element.is-docked {
			inset-block-end: calc(
				var(--reader-visual-bottom, 0px) +
					max(0.5rem, calc(var(--app-bottom-inset, 0rem) + 0.5rem), env(safe-area-inset-bottom))
			);
			inline-size: calc(100vw - 1rem);
			border-radius: 0.9rem;
			padding: 0.5rem 0.6rem;
		}
		.media-element.is-docked .media-element-waveform {
			display: none;
		}
		.media-element.is-docked .media-element-seek {
			display: block;
			inline-size: 100%;
			block-size: 1.75rem;
			margin: 0;
			accent-color: var(--primary);
			cursor: pointer;
			touch-action: pan-x;
		}
		.media-element.is-docked .media-element-controls {
			gap: 0.25rem;
			margin-block-start: 0.3rem;
		}
		.media-element.is-docked .media-element-icon-button {
			inline-size: 100%;
			min-inline-size: 2.75rem;
			min-block-size: 2.75rem;
			border-radius: 0.55rem;
		}
		.media-element.is-docked .media-element-control-actions {
			display: grid;
			grid-template-columns: repeat(5, minmax(0, 1fr));
			inline-size: 100%;
			gap: 0.3rem;
		}
		.media-element.is-docked button[aria-label='Play audio'],
		.media-element.is-docked button[aria-label='Pause audio'] {
			background: var(--primary);
			color: var(--primary-foreground);
			border-color: transparent;
		}
		.media-element.is-docked .media-element-volume:has(.media-element-volume-popover) {
			grid-column: 1 / -1;
			gap: 0.6rem;
		}
		.media-element.is-docked .media-element-volume:has(.media-element-volume-popover) > button {
			inline-size: 2.75rem;
		}
		.media-element.is-docked .media-element-volume-popover {
			position: static;
			flex: 1;
			inline-size: auto;
			transform: none;
			box-shadow: none;
		}
		.media-element.is-docked .media-element-timestamp {
			font-size: 0.75rem;
		}
	}
	@media (min-width: 32rem) and (max-width: 38rem) and (max-height: 30rem) {
		.media-element.is-docked .media-element-control-actions {
			grid-template-columns: repeat(9, minmax(0, 1fr));
		}
		.media-element.is-docked .media-element-controls {
			gap: 0.2rem;
		}
	}
	@media (hover: none) {
		.media-element-icon-button::after {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.media-element-icon-button::after {
			transition: none;
		}
	}
	.media-element-error {
		margin-block: 0.5rem 0;
		color: var(--destructive, #b91c1c);
		font-size: 0.875rem;
	}
</style>
