<script lang="ts">
	import { AudioLines, Database, Fingerprint, ShieldCheck } from '@lucide/svelte';
	import {
		AudioTranscription,
		type AudioTranscriptionResponse
	} from '$lib/features/audio-transcription';

	let language = $state('en');
	let latestResult = $state<AudioTranscriptionResponse | null>(null);
</script>

<svelte:head>
	<title>Speech to text · Learning studio</title>
	<meta
		name="description"
		content="Test MP3 transcription with Deepgram and content-addressed caching."
	/>
</svelte:head>

<div class="stt-page">
	<header class="intro">
		<div class="intro-icon"><AudioLines size={24} /></div>
		<div>
			<p class="eyebrow">Audio tools</p>
			<h1>Speech to text</h1>
			<p>Generate a transcript from an MP3 and verify the SHA-256 database cache.</p>
		</div>
	</header>

	<div class="workspace">
		<section class="transcription-card">
			<label class="language-field">
				<span>Spoken language</span>
				<select bind:value={language}>
					<option value="en">English</option>
					<option value="fa">فارسی · Persian</option>
					<option value="ar">العربية · Arabic</option>
					<option value="multi">Multilingual</option>
				</select>
				<small>Choose the primary language before sending a new file.</small>
			</label>

			<AudioTranscription
				{language}
				onTranscript={(result) => {
					latestResult = result;
				}}
			/>
		</section>

		<aside class="cache-card">
			<p class="eyebrow">How this test works</p>
			<h2>Content-addressed cache</h2>
			<ul>
				<li>
					<span><Fingerprint size={17} /></span>
					<div>
						<strong>Hash</strong>
						<p>The server calculates SHA-256 from the uploaded bytes.</p>
					</div>
				</li>
				<li>
					<span><Database size={17} /></span>
					<div>
						<strong>Cache</strong>
						<p>A matching hash returns the stored transcript without calling Deepgram.</p>
					</div>
				</li>
				<li>
					<span><ShieldCheck size={17} /></span>
					<div>
						<strong>Private key</strong>
						<p>The Deepgram credential never reaches the browser.</p>
					</div>
				</li>
			</ul>

			{#if latestResult}
				<div class="last-request">
					<span>Latest request</span>
					<strong>{latestResult.cacheHit ? 'Cache hit' : 'Deepgram response cached'}</strong>
					<code>{latestResult.sha256}</code>
				</div>
			{/if}
		</aside>
	</div>
</div>

<style>
	.stt-page {
		display: grid;
		gap: 1.5rem;
		inline-size: min(100%, 70rem);
		margin-inline: auto;
	}
	.intro {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
	.intro-icon {
		display: grid;
		inline-size: 3.2rem;
		block-size: 3.2rem;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 1rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}
	.eyebrow,
	h1,
	h2,
	p {
		margin: 0;
	}
	.eyebrow {
		color: var(--editor-selection);
		font-size: 0.63rem;
		font-weight: 760;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}
	h1 {
		font-size: clamp(1.55rem, 4vw, 2.3rem);
		letter-spacing: -0.045em;
	}
	.intro > div:last-child > p:last-child {
		margin-block-start: 0.2rem;
		color: var(--muted-foreground);
		font-size: 0.78rem;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(16rem, 0.7fr);
		gap: 1rem;
		align-items: start;
	}
	.transcription-card,
	.cache-card {
		border: 0.0625rem solid var(--border);
		border-radius: 1.1rem;
		background: color-mix(in oklab, var(--card) 96%, transparent);
		box-shadow: 0 1.4rem 3rem -2.7rem color-mix(in oklab, var(--foreground) 28%, transparent);
	}
	.transcription-card {
		display: grid;
		gap: 1rem;
		padding: 1rem;
	}
	.language-field {
		display: grid;
		grid-template-columns: minmax(8rem, 11rem) minmax(10rem, 15rem);
		align-items: center;
		gap: 0.35rem 0.8rem;
		padding: 0.15rem 0.2rem;
	}
	.language-field > span {
		font-size: 0.72rem;
		font-weight: 670;
	}
	.language-field select {
		min-block-size: 2.35rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.65rem;
		padding-inline: 0.65rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		font-size: 0.72rem;
	}
	.language-field small {
		grid-column: 1 / -1;
		color: var(--muted-foreground);
		font-size: 0.61rem;
	}
	.cache-card {
		display: grid;
		gap: 0.3rem;
		padding: 1rem;
	}
	.cache-card h2 {
		font-size: 1rem;
		letter-spacing: -0.02em;
	}
	.cache-card ul {
		display: grid;
		gap: 0.75rem;
		margin: 0.8rem 0 0;
		padding: 0;
		list-style: none;
	}
	.cache-card li {
		display: flex;
		gap: 0.6rem;
	}
	.cache-card li > span {
		display: grid;
		inline-size: 2rem;
		block-size: 2rem;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 0.6rem;
		background: var(--muted);
		color: var(--muted-foreground);
	}
	.cache-card li strong {
		font-size: 0.69rem;
	}
	.cache-card li p {
		margin-block-start: 0.08rem;
		color: var(--muted-foreground);
		font-size: 0.64rem;
		line-height: 1.45;
	}
	.last-request {
		display: grid;
		gap: 0.25rem;
		margin-block-start: 0.8rem;
		border-radius: 0.75rem;
		padding: 0.7rem;
		background: var(--editor-selection-soft);
	}
	.last-request span {
		color: var(--muted-foreground);
		font-size: 0.57rem;
		text-transform: uppercase;
	}
	.last-request strong {
		font-size: 0.7rem;
	}
	.last-request code {
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.55rem;
		text-overflow: ellipsis;
	}
	@media (max-width: 48rem) {
		.workspace {
			grid-template-columns: 1fr;
		}
		.language-field {
			grid-template-columns: 1fr;
		}
		.language-field small {
			grid-column: auto;
		}
	}
</style>
