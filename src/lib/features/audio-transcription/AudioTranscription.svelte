<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Check,
		CircleAlert,
		CloudUpload,
		Copy,
		FileAudio,
		LoaderCircle,
		RefreshCw,
		Sparkles,
		X
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import type { AudioTranscriptionResponse } from './model';

	let {
		language = 'en',
		disabled = false,
		compact = false,
		heading = 'Transcribe an MP3',
		description = 'Upload audio and generate a transcript.',
		onTranscript = () => undefined
	}: {
		language?: string;
		disabled?: boolean;
		compact?: boolean;
		heading?: string;
		description?: string;
		onTranscript?: (result: AudioTranscriptionResponse) => void | Promise<void>;
	} = $props();

	const maxBytes = 25 * 1024 * 1024;
	let input: HTMLInputElement;
	let selectedFile = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let result = $state<AudioTranscriptionResponse | null>(null);
	let phase = $state<'idle' | 'uploading' | 'success' | 'error'>('idle');
	let message = $state<string | null>(null);
	let dragActive = $state(false);
	let copied = $state(false);
	let requestController: AbortController | null = null;

	onDestroy(() => {
		requestController?.abort();
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});

	function chooseFile(event: Event) {
		setFile((event.currentTarget as HTMLInputElement).files?.[0] ?? null);
	}

	function dropFile(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		if (disabled || phase === 'uploading') return;
		setFile(event.dataTransfer?.files?.[0] ?? null);
	}

	function setFile(file: File | null) {
		message = null;
		result = null;
		copied = false;
		phase = 'idle';
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;

		if (!file) {
			selectedFile = null;
			return;
		}
		if (!file.name.toLocaleLowerCase().endsWith('.mp3')) {
			selectedFile = null;
			phase = 'error';
			message = 'Choose a file with the .mp3 extension.';
			return;
		}
		if (file.size === 0 || file.size > maxBytes) {
			selectedFile = null;
			phase = 'error';
			message = file.size === 0 ? 'That file is empty.' : 'The MP3 file must be 25 MB or smaller.';
			return;
		}
		selectedFile = file;
		previewUrl = URL.createObjectURL(file);
	}

	function clearFile() {
		requestController?.abort();
		requestController = null;
		if (input) input.value = '';
		setFile(null);
	}

	async function transcribe() {
		if (!selectedFile || phase === 'uploading') return;
		requestController?.abort();
		requestController = new AbortController();
		phase = 'uploading';
		message = null;
		result = null;

		try {
			const form = new FormData();
			form.set('file', selectedFile);
			form.set('language', language);
			const response = await fetch('/api/transcriptions', {
				method: 'POST',
				body: form,
				signal: requestController.signal
			});
			const body = (await response.json().catch(() => null)) as
				AudioTranscriptionResponse | { error?: string } | null;
			if (!response.ok || !isTranscription(body)) {
				throw new Error(
					body && 'error' in body && body.error ? body.error : 'The audio could not be transcribed.'
				);
			}
			result = body;
			phase = 'success';
			await onTranscript(body);
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') return;
			phase = 'error';
			message = error instanceof Error ? error.message : 'The audio could not be transcribed.';
		} finally {
			requestController = null;
		}
	}

	async function copyTranscript() {
		if (!result?.transcript) return;
		await navigator.clipboard.writeText(result.transcript);
		copied = true;
		window.setTimeout(() => (copied = false), 1600);
	}

	function isTranscription(value: unknown): value is AudioTranscriptionResponse {
		return (
			typeof value === 'object' &&
			value !== null &&
			'sha256' in value &&
			typeof value.sha256 === 'string' &&
			'transcript' in value &&
			typeof value.transcript === 'string' &&
			'transcribedText' in value &&
			typeof value.transcribedText === 'object' &&
			value.transcribedText !== null &&
			'cacheHit' in value &&
			typeof value.cacheHit === 'boolean'
		);
	}

	function formatBytes(bytes: number) {
		return bytes < 1024 * 1024
			? `${Math.max(1, Math.round(bytes / 1024))} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<section class:compact class="transcriber" aria-labelledby="audio-transcriber-title">
	<header>
		<div class="heading-icon" aria-hidden="true"><Sparkles size={17} /></div>
		<div>
			<h3 id="audio-transcriber-title">{heading}</h3>
			<p>{description}</p>
		</div>
	</header>

	<label
		class:drag-active={dragActive}
		class:has-file={selectedFile}
		class="file-drop"
		ondragenter={(event) => {
			event.preventDefault();
			if (!disabled && phase !== 'uploading') dragActive = true;
		}}
		ondragover={(event) => event.preventDefault()}
		ondragleave={(event) => {
			if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dragActive = false;
		}}
		ondrop={dropFile}
	>
		<input
			bind:this={input}
			type="file"
			accept=".mp3,audio/mpeg,audio/mp3"
			disabled={disabled || phase === 'uploading'}
			onchange={chooseFile}
		/>
		<span class="file-icon"><FileAudio size={20} /></span>
		<span class="file-copy">
			<strong>{selectedFile?.name ?? 'Choose an MP3 file'}</strong>
			<small
				>{selectedFile
					? `${formatBytes(selectedFile.size)} · Ready to transcribe`
					: 'Click to browse or drop a file here · 25 MB maximum'}</small
			>
		</span>
		{#if selectedFile && phase !== 'uploading'}
			<button
				type="button"
				class="clear-file"
				aria-label="Remove selected audio"
				onclick={(event) => {
					event.preventDefault();
					clearFile();
				}}><X size={15} /></button
			>
		{:else}
			<span class="browse">Browse</span>
		{/if}
	</label>

	{#if previewUrl && selectedFile}
		<audio class="audio-preview" controls preload="metadata" src={previewUrl}>
			<track kind="captions" />
		</audio>
	{/if}

	<div class="actions">
		<Button
			type="button"
			disabled={disabled || !selectedFile || phase === 'uploading'}
			onclick={transcribe}
		>
			{#if phase === 'uploading'}
				<LoaderCircle class="spin" data-icon="inline-start" /> Processing audio…
			{:else if phase === 'success'}
				<RefreshCw data-icon="inline-start" /> Transcribe again
			{:else}
				<CloudUpload data-icon="inline-start" /> Generate transcript
			{/if}
		</Button>
		{#if selectedFile}<span>Language: {language}</span>{/if}
	</div>

	{#if phase === 'error' && message}
		<div class="message error" role="alert">
			<CircleAlert size={16} /><span>{message}</span>
		</div>
	{/if}

	{#if result}
		<div class="result">
			<header>
				<div>
					<span class:cache-hit={result.cacheHit} class="result-status"
						><Check size={12} />{result.cacheHit ? 'Loaded from cache' : 'New transcription'}</span
					>
					<small>SHA-256 · {result.sha256.slice(0, 16)}…</small>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={!result.transcript}
					onclick={copyTranscript}
				>
					{#if copied}<Check data-icon="inline-start" />Copied{:else}<Copy
							data-icon="inline-start"
						/>Copy{/if}
				</Button>
			</header>
			<textarea
				readonly
				value={result.transcript}
				aria-label="Generated transcript"
				lang={result.language}
				dir="auto"
				rows={compact ? 4 : 8}
				placeholder="No speech was detected in this file."></textarea>
			<footer>
				<span>{result.model}</span>
				{#if result.durationSeconds !== null}<span>{Math.round(result.durationSeconds)} sec</span
					>{/if}
				{#if result.confidence !== null}
					<span>{Math.round(result.confidence * 100)}% confidence</span>
				{/if}
			</footer>
		</div>
	{/if}
</section>

<style>
	.transcriber {
		display: grid;
		gap: 0.9rem;
		inline-size: 100%;
		border: 0.0625rem solid var(--border);
		border-radius: 1rem;
		padding: 1rem;
		background: color-mix(in oklab, var(--card) 97%, transparent);
		color: var(--foreground);
	}
	.transcriber > header,
	.transcriber > header > div:last-child,
	.file-copy,
	.actions,
	.message,
	.result > header,
	.result > header > div,
	.result-status,
	.result footer {
		display: flex;
		align-items: center;
	}
	.transcriber > header {
		gap: 0.65rem;
	}
	.transcriber > header > div:last-child,
	.file-copy,
	.result > header > div {
		min-inline-size: 0;
		align-items: flex-start;
		flex-direction: column;
	}
	.heading-icon,
	.file-icon {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 0.65rem;
	}
	.heading-icon {
		inline-size: 2.1rem;
		block-size: 2.1rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}
	h3,
	p {
		margin: 0;
	}
	h3 {
		font-size: 0.84rem;
		font-weight: 680;
	}
	.transcriber > header p {
		margin-block-start: 0.08rem;
		color: var(--muted-foreground);
		font-size: 0.68rem;
		line-height: 1.4;
	}
	.file-drop {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-inline-size: 0;
		min-block-size: 4.3rem;
		border: 0.0625rem dashed color-mix(in oklab, var(--editor-selection) 38%, var(--border));
		border-radius: 0.8rem;
		padding: 0.7rem;
		background: color-mix(in oklab, var(--editor-selection-soft) 30%, transparent);
		cursor: pointer;
		transition: 140ms ease;
	}
	.file-drop:hover,
	.file-drop.drag-active {
		border-color: var(--editor-selection);
		background: color-mix(in oklab, var(--editor-selection-soft) 62%, transparent);
	}
	.file-drop:focus-within {
		outline: 0.125rem solid color-mix(in oklab, var(--editor-selection) 55%, transparent);
		outline-offset: 0.125rem;
	}
	.file-drop input {
		position: absolute;
		inline-size: 0.0625rem;
		block-size: 0.0625rem;
		overflow: hidden;
		opacity: 0;
	}
	.file-icon {
		inline-size: 2.45rem;
		block-size: 2.45rem;
		background: var(--background);
		color: var(--editor-selection);
		box-shadow: inset 0 0 0 0.0625rem var(--border);
	}
	.file-copy {
		flex: 1;
		gap: 0.12rem;
	}
	.file-copy strong,
	.file-copy small {
		max-inline-size: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-copy strong {
		font-size: 0.72rem;
	}
	.file-copy small,
	.browse,
	.actions > span {
		color: var(--muted-foreground);
		font-size: 0.61rem;
	}
	.browse {
		border: 0.0625rem solid var(--border);
		border-radius: 0.5rem;
		padding: 0.3rem 0.48rem;
		background: var(--background);
		font-weight: 650;
	}
	.clear-file {
		display: grid;
		inline-size: 1.8rem;
		block-size: 1.8rem;
		place-items: center;
		border: 0;
		border-radius: 0.5rem;
		background: transparent;
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.clear-file:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	.audio-preview {
		inline-size: 100%;
		block-size: 2.5rem;
	}
	.actions {
		justify-content: space-between;
		gap: 0.75rem;
	}
	.message {
		gap: 0.45rem;
		border-radius: 0.65rem;
		padding: 0.6rem 0.7rem;
		font-size: 0.68rem;
	}
	.message.error {
		background: color-mix(in oklab, var(--destructive) 10%, transparent);
		color: var(--destructive);
	}
	.result {
		display: grid;
		gap: 0.6rem;
		border-block-start: 0.0625rem solid var(--border);
		padding-block-start: 0.8rem;
	}
	.result > header {
		justify-content: space-between;
		gap: 0.5rem;
	}
	.result > header > div {
		gap: 0.18rem;
	}
	.result-status {
		gap: 0.28rem;
		color: var(--studio-green, #52816c);
		font-size: 0.65rem;
		font-weight: 680;
	}
	.result-status.cache-hit {
		color: var(--editor-selection);
	}
	.result header small,
	.result footer {
		color: var(--muted-foreground);
		font-size: 0.58rem;
	}
	.result textarea {
		inline-size: 100%;
		resize: vertical;
		border: 0.0625rem solid var(--border);
		border-radius: 0.7rem;
		padding: 0.75rem;
		background: color-mix(in oklab, var(--muted) 30%, var(--background));
		color: var(--foreground);
		font: inherit;
		font-size: 0.74rem;
		line-height: 1.6;
	}
	.result footer {
		flex-wrap: wrap;
		gap: 0.4rem 0.8rem;
	}
	.result footer span + span::before {
		margin-inline-end: 0.8rem;
		content: '·';
	}
	.compact {
		gap: 0.65rem;
		margin-block: 0.8rem;
		padding: 0.75rem;
	}
	.compact > header p,
	.compact .audio-preview,
	.compact .actions > span {
		display: none;
	}
	.compact .file-drop {
		min-block-size: 3.7rem;
	}
	:global(.spin) {
		animation: spin 850ms linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@container (max-width: 28rem) {
		.actions {
			align-items: stretch;
			flex-direction: column;
		}
		.actions :global([data-slot='button']) {
			inline-size: 100%;
		}
		.browse {
			display: none;
		}
	}
</style>
