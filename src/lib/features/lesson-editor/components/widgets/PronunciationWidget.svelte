<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import MicIcon from '@lucide/svelte/icons/mic';
	import RotateIcon from '@lucide/svelte/icons/rotate-ccw';
	import VolumeIcon from '@lucide/svelte/icons/volume-2';
	import { Button } from '$lib/components/ui/button';
	import { untrack } from 'svelte';
	import type { WidgetInstance } from '../../model/types';
	import EditableText from './EditableText.svelte';
	import type { PronunciationPracticeState } from './runtime-types';
	import WidgetSurface from './WidgetSurface.svelte';

	type PronunciationInstance = WidgetInstance<'language.pronunciation'>;

	let {
		widget,
		selected = false,
		editing = false,
		practice: controlledPractice = undefined,
		onSelect,
		onContentChange,
		onPracticeChange = () => undefined
	}: {
		widget: PronunciationInstance;
		selected?: boolean;
		editing?: boolean;
		practice?: PronunciationPracticeState;
		onSelect: () => void;
		onContentChange: (content: PronunciationInstance['content']) => void;
		onPracticeChange?: (practice: PronunciationPracticeState) => void;
	} = $props();

	let localPractice = $state<PronunciationPracticeState>({
		status: 'idle',
		recordedSeconds: 0,
		referencePlaying: false
	});
	let currentWidgetId = $state('');

	const practice = $derived(controlledPractice ?? localPractice);
	const practiceState = $derived(practice.status);
	const recordedSeconds = $derived(practice.recordedSeconds);
	const playingReference = $derived(practice.referencePlaying);

	$effect(() => {
		if (widget.id === currentWidgetId) return;
		currentWidgetId = widget.id;
		if (controlledPractice === undefined) {
			localPractice = { status: 'idle', recordedSeconds: 0, referencePlaying: false };
		}
	});

	$effect(() => {
		if (practiceState !== 'recording') return;
		const startedAt = performance.now() - untrack(() => recordedSeconds) * 1000;
		const timer = window.setInterval(() => {
			const nextRecordedSeconds = (performance.now() - startedAt) / 1000;
			if (nextRecordedSeconds >= 8) {
				finishRecording(8);
			} else {
				setPractice({ ...untrack(() => practice), recordedSeconds: nextRecordedSeconds });
			}
		}, 100);

		return () => window.clearInterval(timer);
	});

	$effect(() => {
		if (!playingReference) return;
		const timer = window.setTimeout(
			() => setPractice({ ...untrack(() => practice), referencePlaying: false }),
			2200
		);
		return () => window.clearTimeout(timer);
	});

	function toggleRecording() {
		onSelect();
		if (practiceState === 'recording') {
			finishRecording();
		} else {
			setPractice({ ...practice, status: 'recording', recordedSeconds: 0 });
		}
	}

	function finishRecording(finalSeconds = recordedSeconds) {
		setPractice({ ...practice, status: 'complete', recordedSeconds: finalSeconds });
	}

	function resetPractice() {
		onSelect();
		setPractice({ ...practice, status: 'idle', recordedSeconds: 0 });
	}

	function setPractice(nextPractice: PronunciationPracticeState) {
		if (controlledPractice === undefined) localPractice = nextPractice;
		onPracticeChange(nextPractice);
	}

	function formatTime(seconds: number) {
		return `0:${String(Math.floor(seconds)).padStart(2, '0')}`;
	}
</script>

<WidgetSurface widgetType={widget.type} label="Pronunciation" {selected} {editing} {onSelect}>
	<div
		class="content-language pronunciation-content"
		lang={widget.content.language}
		dir={widget.content.direction}
	>
		<EditableText
			value={widget.content.prompt}
			editable={editing}
			placeholder="Add pronunciation guidance…"
			ariaLabel="Pronunciation prompt"
			language={widget.content.language}
			direction={widget.content.direction}
			class="pronunciation-prompt"
			onFocus={onSelect}
			onChange={(prompt) => onContentChange({ ...widget.content, prompt })}
		/>

		<div class="target-phrase">
			<EditableText
				value={widget.content.targetText}
				editable={editing}
				placeholder="Word or phrase to practise"
				ariaLabel="Pronunciation target"
				language={widget.content.language}
				direction={widget.content.direction}
				class="target-text"
				onFocus={onSelect}
				onChange={(targetText) => onContentChange({ ...widget.content, targetText })}
			/>
		</div>
	</div>

	<div class="practice-controls" dir="ltr">
		<Button
			type="button"
			variant="secondary"
			size="lg"
			class={`reference-button ${playingReference ? 'is-playing' : ''}`}
			disabled={!widget.content.referenceAudioUrl}
			aria-label="Play reference pronunciation"
			onclick={(event) => {
				event.stopPropagation();
				onSelect();
				setPractice({ ...practice, referencePlaying: !playingReference });
			}}
		>
			<VolumeIcon />
			<span>{playingReference ? 'Playing reference' : 'Hear reference'}</span>
		</Button>

		<div class="practice-action">
			{#if practiceState === 'complete'}
				<span class="result" role="status"><CheckIcon /> Attempt captured</span>
				<Button
					type="button"
					variant="secondary"
					size="lg"
					class="reset-button"
					aria-label="Try pronunciation again"
					onclick={(event) => {
						event.stopPropagation();
						resetPractice();
					}}
				>
					<RotateIcon />
					<span>Try again</span>
				</Button>
			{:else}
				<span class="recording-status" aria-live="polite">
					{practiceState === 'recording' ? formatTime(recordedSeconds) : 'Ready'}
				</span>
				<Button
					type="button"
					variant="default"
					size="lg"
					class={`record-button ${practiceState === 'recording' ? 'is-recording' : ''}`}
					aria-label={practiceState === 'recording' ? 'Finish recording' : 'Start recording'}
					onclick={(event) => {
						event.stopPropagation();
						toggleRecording();
					}}
				>
					<MicIcon />
					<span>{practiceState === 'recording' ? 'Finish' : 'Practise'}</span>
				</Button>
			{/if}
		</div>
	</div>
</WidgetSurface>

<style>
	.pronunciation-content {
		text-align: start;
		unicode-bidi: plaintext;
		font-family: var(--font-content, 'Segoe UI', Tahoma, Arial, sans-serif);
	}

	.pronunciation-content:lang(fa),
	.pronunciation-content:lang(ar) {
		font-family: var(--font-content-arabic, Tahoma, 'Segoe UI', Arial, sans-serif);
	}

	:global(.pronunciation-prompt) {
		color: var(--muted-foreground);
		font-size: clamp(0.8rem, 1.1cqi, 0.92rem);
		font-weight: 600;
		line-height: 1.5;
	}

	.target-phrase {
		margin-block-start: 0.55rem;
		padding-block: clamp(0.7rem, 1.7cqi, 1rem);
		padding-inline: clamp(0.75rem, 1.8cqi, 1.1rem);
		border-radius: 0.8rem;
		background: color-mix(in oklch, #14b8a6 8%, transparent);
	}

	:global(.target-text) {
		font-size: clamp(1.15rem, 2.4cqi, 1.65rem);
		font-weight: 680;
		line-height: 1.45;
	}

	.practice-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-block-start: 0.85rem;
	}

	.practice-controls :global(.reference-button),
	.practice-controls :global(.reset-button),
	.practice-controls :global(.record-button),
	.result {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		min-block-size: 2.35rem;
		border-radius: 999rem;
		padding-inline: 0.8rem;
		font-size: 0.78rem;
		font-weight: 620;
	}

	.practice-controls :global(.reference-button),
	.practice-controls :global(.reset-button) {
		background: color-mix(in oklch, var(--muted) 72%, transparent);
		color: var(--foreground);
	}

	.practice-controls :global(.reference-button:disabled) {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.practice-controls :global(.reference-button.is-playing) {
		background: color-mix(in oklch, #14b8a6 13%, transparent);
		color: color-mix(in oklch, #0f766e 90%, var(--foreground));
	}

	.practice-action {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.practice-controls :global(.record-button) {
		background: var(--foreground);
		color: var(--background);
	}

	.practice-controls :global(.record-button.is-recording) {
		background: color-mix(in oklch, #ef4444 84%, var(--foreground));
	}

	.recording-status {
		min-inline-size: 2.6rem;
		color: var(--muted-foreground);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		text-align: end;
	}

	.result {
		background: color-mix(in oklch, #22c55e 10%, transparent);
		color: color-mix(in oklch, #15803d 88%, var(--foreground));
	}

	.practice-controls :global(.reference-button:focus-visible),
	.practice-controls :global(.reset-button:focus-visible),
	.practice-controls :global(.record-button:focus-visible) {
		outline: 0.0625rem solid var(--ring);
		outline-offset: 0.2rem;
	}

	.practice-controls :global(.reference-button svg),
	.practice-controls :global(.reset-button svg),
	.practice-controls :global(.record-button svg),
	.result :global(svg) {
		inline-size: 0.95rem;
		block-size: 0.95rem;
	}

	@container (width < 25rem) {
		.practice-controls {
			align-items: stretch;
			flex-direction: column;
		}

		.practice-action {
			justify-content: flex-end;
		}
	}
</style>
