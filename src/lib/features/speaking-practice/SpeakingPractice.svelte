<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		ArrowLeft,
		ArrowRight,
		Check,
		ChevronLeft,
		ChevronRight,
		CircleAlert,
		Download,
		Headphones,
		LoaderCircle,
		Mic,
		RotateCcw,
		Search,
		ShieldCheck,
		Square,
		Volume2,
		X
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { PracticeRecorder, MAX_RECORDING_SECONDS } from './audio-recorder';
	import { LocalSpeechEngine } from './speech-engine';
	import {
		compareSentence,
		type SentenceMatch,
		type SpeakingPracticeConfiguration,
		type SpeakingSentence
	} from './model';

	type Stage =
		| 'selecting'
		| 'ready'
		| 'loading'
		| 'requesting'
		| 'recording'
		| 'processing'
		| 'result'
		| 'summary';
	type Attempt = { match: SentenceMatch; recognizedText: string; count: number };
	let {
		sentences,
		configuration,
		editing = false,
		onConfigurationChange = () => undefined
	}: {
		sentences: readonly SpeakingSentence[];
		configuration: SpeakingPracticeConfiguration;
		editing?: boolean;
		onConfigurationChange?: (configuration: SpeakingPracticeConfiguration) => void;
	} = $props();

	let previewing = $state(false);
	let search = $state('');
	let page = $state(1);
	let selectedIds = $state<string[]>([]);
	let stage = $state<Stage>('selecting');
	let queue = $state<SpeakingSentence[]>([]);
	let queueIndex = $state(0);
	let attempts = $state<Record<string, Attempt>>({});
	let errorMessage = $state<string | null>(null);
	let modelReady = $state(false);
	let modelProgress = $state<number | null>(null);
	let modelMessage = $state('Preparing English speech recognition…');
	let recordingSeconds = $state(0);
	let inputLevel = $state(0);
	let recordingUrl = $state<string | null>(null);
	let referencePlaying = $state(false);
	let engine: LocalSpeechEngine | undefined;
	let recorder: PracticeRecorder | undefined;
	let referencePlayer: HTMLAudioElement | undefined;
	let recordingTimer: ReturnType<typeof setInterval> | undefined;
	let operationId = 0;
	let destroyed = false;
	const pageSize = 10;
	const configuring = $derived(editing && !previewing);
	const englishSentences = $derived(
		sentences.filter((sentence) => /^en(?:-|$)/i.test(sentence.language))
	);
	const englishIds = $derived(new Set(englishSentences.map(({ id }) => id)));
	const configuredIds = $derived(new Set(configuration.sentenceIds));
	const unavailableCount = $derived(
		configuration.sentenceIds.filter((id) => !englishIds.has(id)).length
	);
	const availableSentences = $derived(
		configuration.sentenceMode === 'selected'
			? englishSentences.filter(({ id }) => configuredIds.has(id))
			: englishSentences
	);
	const pickerSentences = $derived(configuring ? englishSentences : availableSentences);
	const checkedIds = $derived(configuring ? configuredIds : new Set(selectedIds));
	const checkedSentences = $derived(pickerSentences.filter(({ id }) => checkedIds.has(id)));
	const filtered = $derived(
		pickerSentences.filter((sentence) =>
			(sentence.text + ' ' + sentence.sourceLabel)
				.toLocaleLowerCase()
				.includes(search.trim().toLocaleLowerCase())
		)
	);
	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const activePage = $derived(Math.min(page, pageCount));
	const pageSentences = $derived(
		filtered.slice((activePage - 1) * pageSize, activePage * pageSize)
	);
	const sentenceNumbers = $derived(
		new Map(englishSentences.map(({ id }, index) => [id, index + 1]))
	);
	const selectedOnPage = $derived(pageSentences.filter(({ id }) => checkedIds.has(id)).length);
	const current = $derived(queue[queueIndex]);
	const currentAvailable = $derived(
		current &&
			availableSentences.some(
				(sentence) => sentence.id === current.id && sentence.text === current.text
			)
	);
	const currentAttempt = $derived(current ? attempts[current.id] : undefined);
	const completed = $derived(queue.filter(({ id }) => attempts[id]));
	const difficult = $derived(
		queue.filter(({ id }) => attempts[id] && attempts[id].match.score < 100)
	);
	const isBusy = $derived(
		stage === 'loading' || stage === 'requesting' || stage === 'recording' || stage === 'processing'
	);
	const showPicker = $derived(configuring || stage === 'selecting');

	function configure(changes: Partial<SpeakingPracticeConfiguration>) {
		onConfigurationChange({ ...configuration, ...changes });
	}

	function setChecked(ids: string[]) {
		if (configuring) configure({ sentenceIds: ids });
		else selectedIds = ids;
	}

	function toggleSentence(id: string, checked: boolean) {
		setChecked(
			checked ? [...new Set([...checkedIds, id])] : [...checkedIds].filter((value) => value !== id)
		);
	}

	function togglePage(checked: boolean) {
		const visibleIds = new Set(pageSentences.map(({ id }) => id));
		setChecked(
			checked
				? [...new Set([...checkedIds, ...visibleIds])]
				: [...checkedIds].filter((id) => !visibleIds.has(id))
		);
	}

	function stopReference() {
		if (referencePlayer) {
			referencePlayer.pause();
			referencePlayer.removeAttribute('src');
			referencePlayer.load();
			referencePlayer = undefined;
		}
		referencePlaying = false;
	}

	function clearRecording() {
		if (recordingUrl) URL.revokeObjectURL(recordingUrl);
		recordingUrl = null;
	}

	function stopTimer() {
		if (recordingTimer) clearInterval(recordingTimer);
		recordingTimer = undefined;
		inputLevel = 0;
	}

	function cancelOperation() {
		operationId += 1;
		stopTimer();
		recorder?.dispose();
		recorder = undefined;
		if (stage === 'loading' || stage === 'processing') {
			engine?.dispose();
			engine = undefined;
			modelReady = false;
		}
		stopReference();
		stage = current ? 'ready' : 'selecting';
	}

	function chooseSentences() {
		cancelOperation();
		clearRecording();
		errorMessage = null;
		stage = 'selecting';
	}

	async function loadModel() {
		if (modelReady || destroyed) return;
		const id = ++operationId;
		stage = 'loading';
		errorMessage = null;
		modelProgress = null;
		modelMessage = 'Preparing English speech recognition…';
		try {
			engine ??= new LocalSpeechEngine((status) => {
				if (destroyed) return;
				modelProgress = status.progress;
				modelMessage = status.message;
			});
			await engine.load();
			if (destroyed || id !== operationId) return;
			modelReady = true;
			stage = 'ready';
		} catch (error) {
			if (destroyed || id !== operationId) return;
			engine?.dispose();
			engine = undefined;
			modelReady = false;
			errorMessage =
				error instanceof Error ? error.message : 'The speech model could not be loaded. Try again.';
			stage = 'ready';
		}
	}

	async function startPractice(items = checkedSentences) {
		if (!items.length) return;
		queue = [...items];
		queueIndex = 0;
		stage = 'ready';
		errorMessage = null;
		clearRecording();
		stopReference();
		await loadModel();
	}

	async function record() {
		if (!modelReady || !currentAvailable || isBusy) return;
		const id = ++operationId;
		errorMessage = null;
		stopReference();
		clearRecording();
		recordingSeconds = 0;
		stage = 'requesting';
		const capture = new PracticeRecorder(() => {
			if (stage === 'recording') void finishRecording();
		});
		recorder = capture;
		try {
			await capture.start((level) => {
				if (!destroyed && id === operationId) inputLevel = level;
			});
			if (destroyed || id !== operationId) {
				capture.dispose();
				return;
			}
			stage = 'recording';
			const startedAt = performance.now();
			recordingTimer = setInterval(() => {
				recordingSeconds = Math.min(MAX_RECORDING_SECONDS, (performance.now() - startedAt) / 1000);
			}, 100);
		} catch (error) {
			capture.dispose();
			if (destroyed || id !== operationId) return;
			recorder = undefined;
			errorMessage =
				error instanceof Error ? error.message : 'Your microphone could not be opened.';
			stage = 'ready';
		}
	}

	async function finishRecording() {
		if (stage !== 'recording' || !recorder || !current) return;
		const id = operationId;
		const sentence = current;
		const capture = recorder;
		recorder = undefined;
		stopTimer();
		stage = 'processing';
		try {
			const audio = await capture.stop();
			if (destroyed || id !== operationId) return;
			recordingUrl = URL.createObjectURL(audio.blob);
			recordingSeconds = audio.durationSeconds;
			if (!engine) throw new Error('Load the speech model and try again.');
			const recognizedText = (await engine.transcribe(audio.samples)).trim();
			if (destroyed || id !== operationId) return;
			if (!recognizedText)
				throw new Error('No words were recognized. Check your microphone and try again.');
			const match = compareSentence(sentence.text, recognizedText);
			attempts = {
				...attempts,
				[sentence.id]: { match, recognizedText, count: (attempts[sentence.id]?.count ?? 0) + 1 }
			};
			stage = 'result';
		} catch (error) {
			if (destroyed || id !== operationId) return;
			errorMessage =
				error instanceof Error ? error.message : 'This recording could not be compared. Try again.';
			stage = 'ready';
		} finally {
			capture.dispose();
		}
	}

	function nextSentence() {
		stopReference();
		clearRecording();
		errorMessage = null;
		if (queueIndex + 1 >= queue.length) stage = 'summary';
		else {
			queueIndex += 1;
			stage = 'ready';
		}
	}

	function retry() {
		stopReference();
		clearRecording();
		errorMessage = null;
		stage = 'ready';
	}

	async function playReference() {
		if (referencePlaying) {
			stopReference();
			return;
		}
		const reference = current?.referenceAudio;
		if (!reference || isBusy) return;
		stopReference();
		const audio = new Audio(reference.url);
		referencePlayer = audio;
		referencePlaying = true;
		audio.currentTime = reference.startSeconds;
		audio.ontimeupdate = () => {
			if (audio.currentTime >= reference.endSeconds && referencePlayer === audio) stopReference();
		};
		audio.onended = () => {
			if (referencePlayer === audio) stopReference();
		};
		try {
			await audio.play();
		} catch {
			if (referencePlayer !== audio || destroyed) return;
			stopReference();
			errorMessage = 'Reference audio could not be played. You can still practise the sentence.';
		}
	}

	onDestroy(() => {
		destroyed = true;
		operationId += 1;
		stopTimer();
		recorder?.dispose();
		engine?.dispose();
		stopReference();
		clearRecording();
	});
</script>

<section class="speaking-practice" aria-label="Speaking practice" dir="ltr">
	<header class="practice-header">
		<div class="practice-heading">
			<span class="practice-icon"><Mic size={20} /></span>
			<div>
				<p class="eyebrow">Speak · listen · improve</p>
				<h3>{configuration.title || 'Speaking practice'}</h3>
			</div>
		</div>
		<span class="local-badge"><ShieldCheck size={13} />On-device</span>
	</header>
	{#if configuration.instructions && !configuring}<p class="instructions">
			{configuration.instructions}
		</p>{/if}

	{#if configuring}
		<div class="author-settings">
			<div class="settings-heading">
				<strong>Set up this activity</strong><span>English sentence practice</span>
			</div>
			<label
				>Activity title<input
					aria-label="Speaking practice title"
					value={configuration.title}
					maxlength="120"
					placeholder="Speaking practice"
					oninput={(event) => configure({ title: event.currentTarget.value })}
				/></label
			>
			<label
				>Instructions<textarea
					aria-label="Speaking practice instructions"
					value={configuration.instructions}
					rows="2"
					maxlength="2000"
					placeholder="Read each sentence aloud, then review the words you said."
					oninput={(event) => configure({ instructions: event.currentTarget.value })}
				></textarea></label
			>
			<label
				>Available sentences<select
					aria-label="Available practice sentences"
					value={configuration.sentenceMode}
					onchange={(event) => {
						configure({ sentenceMode: event.currentTarget.value as 'lesson' | 'selected' });
						page = 1;
					}}
					><option value="lesson">All English sentences in this lesson</option><option
						value="selected">Only sentences I choose</option
					></select
				></label
			>
			{#if configuration.sentenceMode === 'selected' && unavailableCount}
				<div class="notice">
					<CircleAlert size={15} /><span
						>{unavailableCount} selected {unavailableCount === 1
							? 'sentence has'
							: 'sentences have'} changed or been removed. Select replacements below.</span
					><button
						type="button"
						onclick={() =>
							configure({
								sentenceIds: configuration.sentenceIds.filter((id) => englishIds.has(id))
							})}>Remove unavailable</button
					>
				</div>
			{/if}
		</div>
	{/if}

	{#if showPicker}
		{#if !configuring || configuration.sentenceMode === 'selected'}
			<div class="picker-heading">
				<div>
					<h4>{configuring ? 'Choose available sentences' : 'What would you like to practise?'}</h4>
					<p>
						{configuring
							? 'Learners can practise any of the sentences you select.'
							: 'Choose a few sentences. You’ll record them one at a time.'}
					</p>
				</div>
				<span>{checkedSentences.length} selected</span>
			</div>
			{#if pickerSentences.length}
				<label class="search"
					><Search size={16} /><input
						aria-label="Search sentences"
						placeholder="Search sentences or source…"
						value={search}
						oninput={(event) => {
							search = event.currentTarget.value;
							page = 1;
						}}
					/>{#if search}<button
							type="button"
							aria-label="Clear sentence search"
							onclick={() => {
								search = '';
								page = 1;
							}}><X size={14} /></button
						>{/if}</label
				>
				<div class="selection-actions">
					<label
						><input
							type="checkbox"
							aria-label="Select sentence page"
							checked={pageSentences.length > 0 && selectedOnPage === pageSentences.length}
							indeterminate={selectedOnPage > 0 && selectedOnPage < pageSentences.length}
							disabled={!pageSentences.length}
							onchange={(event) => togglePage(event.currentTarget.checked)}
						/>Select page</label
					><button
						type="button"
						disabled={!filtered.length}
						onclick={() =>
							setChecked([...new Set([...checkedIds, ...filtered.map(({ id }) => id)])])}
						>Select all {filtered.length} results</button
					><button type="button" disabled={!checkedSentences.length} onclick={() => setChecked([])}
						>Clear</button
					>
				</div>
				<div class="sentence-picker">
					{#each pageSentences as sentence (sentence.id)}
						<label class="sentence-option" class:checked={checkedIds.has(sentence.id)}
							><input
								type="checkbox"
								aria-label={'Select sentence ' + sentenceNumbers.get(sentence.id)}
								checked={checkedIds.has(sentence.id)}
								onchange={(event) => toggleSentence(sentence.id, event.currentTarget.checked)}
							/><span class="sentence-number">{sentenceNumbers.get(sentence.id)}</span><span
								class="sentence-copy"
								><span lang={sentence.language} dir={sentence.direction}>{sentence.text}</span
								><small
									>{sentence.sourceLabel}{attempts[sentence.id]
										? ' · Last match: ' + attempts[sentence.id].match.score + '%'
										: ''}</small
								></span
							>{#if attempts[sentence.id]?.match.score === 100}<Check size={15} />{/if}</label
						>
					{:else}<p class="picker-empty">No matching sentences. Try another search.</p>{/each}
				</div>
				<nav class="pagination" aria-label="Practice sentence pages">
					<span
						>{filtered.length ? (activePage - 1) * pageSize + 1 : 0}–{Math.min(
							activePage * pageSize,
							filtered.length
						)} of {filtered.length}</span
					>
					<div>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Previous sentence page"
							disabled={activePage === 1}
							onclick={() => (page = activePage - 1)}><ChevronLeft /></Button
						><span>{activePage} / {pageCount}</span><Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label="Next sentence page"
							disabled={activePage === pageCount}
							onclick={() => (page = activePage + 1)}><ChevronRight /></Button
						>
					</div>
				</nav>
			{:else}
				<div class="empty-state">
					<Mic size={25} /><strong>No sentences available</strong>
					<p>
						{configuring
							? 'Add English passage, rich text, or audio transcript content to this lesson first.'
							: configuration.sentenceMode === 'selected'
								? 'The author needs to choose available English sentences for this activity.'
								: 'This activity needs English sentences in the lesson.'}
					</p>
				</div>
			{/if}
		{:else}
			<div class="all-sentences">
				<Check size={17} />
				<div>
					<strong>{englishSentences.length} English sentences available</strong>
					<p>
						New English sentences are included automatically. Learners choose their own practice
						queue.
					</p>
				</div>
			</div>
		{/if}
		<div class="picker-footer">
			<p>
				<ShieldCheck size={14} />Recordings stay on this device. First use downloads an English
				speech model; it is cached when your browser allows it.
			</p>
			{#if configuring}<Button
					type="button"
					size="sm"
					disabled={!availableSentences.length}
					onclick={() => {
						previewing = true;
						selectedIds = [];
						search = '';
						page = 1;
					}}><Headphones size={15} />Preview practice</Button
				>{:else}<Button
					type="button"
					disabled={!checkedSentences.length}
					onclick={() => void startPractice()}
					>Start practice{checkedSentences.length
						? ' (' + checkedSentences.length + ')'
						: ''}<ArrowRight size={15} /></Button
				>{/if}
		</div>
	{:else if stage === 'summary'}
		<div class="summary">
			<span class="summary-icon"><Check size={26} /></span>
			<h4>Practice session complete</h4>
			<p>{completed.length} of {queue.length} sentences attempted</p>
			<div class="summary-stats">
				<div>
					<strong>{completed.filter(({ id }) => attempts[id].match.score === 100).length}</strong
					><span>Full sentence matches</span>
				</div>
				<div><strong>{difficult.length}</strong><span>To practise again</span></div>
			</div>
			<div class="summary-list">
				{#each queue as sentence (sentence.id)}<div>
						<p>{sentence.text}</p>
						<span
							>{attempts[sentence.id]
								? attempts[sentence.id].match.score + '% match'
								: 'Skipped'}</span
						>
					</div>{/each}
			</div>
			<div class="session-actions">
				{#if difficult.length}<Button type="button" onclick={() => void startPractice(difficult)}
						><RotateCcw size={15} />Practise difficult sentences</Button
					>{/if}<Button type="button" variant="outline" onclick={chooseSentences}
					>Choose sentences</Button
				>
			</div>
			<p class="feedback-note">
				Matches compare recognized words with the reference. They are not pronunciation grades.
			</p>
		</div>
	{:else if current}
		<div class="session-navigation">
			<button type="button" disabled={isBusy} onclick={chooseSentences}
				><ArrowLeft size={14} />Sentences</button
			><span>Sentence {queueIndex + 1} of {queue.length}</span>
		</div>
		<progress
			class="queue-progress"
			aria-label="Practice queue progress"
			value={queueIndex}
			max={queue.length}
		></progress>
		<div class="reference">
			<div class="reference-heading">
				<span>Read aloud</span>{#if current.referenceAudio}<button
						type="button"
						disabled={isBusy}
						onclick={() => void playReference()}
						><Volume2 size={15} />{referencePlaying ? 'Stop reference' : 'Hear reference'}</button
					>{/if}
			</div>
			<p lang={current.language} dir={current.direction}>{current.text}</p>
			<small>{current.sourceLabel}</small>
		</div>
		{#if !currentAvailable}<div class="notice" role="alert">
				<CircleAlert size={16} /><span
					>This sentence changed or is no longer available. Return to the sentence picker to refresh
					your queue.</span
				>
			</div>{/if}
		{#if stage === 'loading'}
			<div class="model-loading" role="status">
				<LoaderCircle size={24} class="spin" /><strong>Getting ready for local practice</strong>
				<p>{modelMessage}</p>
				<progress aria-label="Speech model download" max="100" value={modelProgress ?? undefined}
				></progress><small>This may take a moment on first use. No recording is uploaded.</small
				><Button type="button" variant="outline" size="sm" onclick={cancelOperation}
					>Cancel download</Button
				>
			</div>
		{:else if stage === 'requesting'}
			<div class="capture-status" role="status">
				<Mic size={24} /><strong>Allow microphone access to begin</strong>
				<p>Your browser may be asking for permission.</p>
				<Button type="button" variant="outline" size="sm" onclick={cancelOperation}>Cancel</Button>
			</div>
		{:else if stage === 'recording'}
			<div class="capture-status recording">
				<span class="recording-indicator"
					><span></span>Recording · {Math.floor(recordingSeconds)} / {MAX_RECORDING_SECONDS}s</span
				>
				<div
					class="input-meter"
					role="meter"
					aria-label="Microphone level"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(inputLevel * 100)}
				>
					<span style:width={Math.max(2, inputLevel * 100) + '%'}></span>
				</div>
				<p>Read the sentence naturally, then stop.</p>
				<div class="session-actions">
					<Button type="button" onclick={() => void finishRecording()}
						><Square size={15} />Stop recording</Button
					><Button type="button" variant="ghost" onclick={cancelOperation}>Discard recording</Button
					>
				</div>
			</div>
		{:else if stage === 'processing'}
			<div class="capture-status" role="status">
				<LoaderCircle size={25} class="spin" /><strong>Comparing your words…</strong>
				<p>Processing on this device. Longer recordings may take a moment.</p>
				<Button type="button" variant="outline" size="sm" onclick={cancelOperation}
					>Cancel comparison</Button
				>
			</div>
		{:else if stage === 'result' && currentAttempt}
			<div class="match-result" aria-live="polite">
				<div class="result-heading">
					<div>
						<p class="eyebrow">Sentence match</p>
						<strong class="score">{currentAttempt.match.score}<small>%</small></strong>
					</div>
					<div class="match-stats">
						<span
							>{currentAttempt.match.matched} / {currentAttempt.match.referenceWords} words matched</span
						><small
							>{currentAttempt.match.missing} missing · {currentAttempt.match.extra} extra · {currentAttempt
								.match.different} different</small
						>
					</div>
				</div>
				<div class="word-comparison" aria-label="Word comparison">
					{#each currentAttempt.match.words as word, index (index)}<span
							class="word"
							data-kind={word.kind}
							>{#if word.kind === 'match'}{word.reference}{:else if word.kind === 'missing'}<small
									>Missing</small
								>{word.reference}{:else if word.kind === 'extra'}<small>Extra</small
								>{word.spoken}{:else}<small>Heard “{word.spoken}”</small>{word.reference}{/if}</span
						>{/each}
				</div>
				<details>
					<summary>Recognized transcript</summary>
					<p>{currentAttempt.recognizedText}</p>
				</details>
				<p class="feedback-note">
					This checks recognized words, not pronunciation. Recognition can make mistakes; listen to
					your recording if a result looks wrong.
				</p>
			</div>
		{/if}
		{#if recordingUrl && stage !== 'recording' && stage !== 'requesting'}<div
				class="recording-playback"
			>
				<span>Your recording · {recordingSeconds.toFixed(1)}s</span><audio
					controls
					src={recordingUrl}
					aria-label="Your recording"
				></audio>
			</div>{/if}
		{#if !isBusy}<div class="session-actions">
				{#if stage === 'result'}<Button type="button" variant="outline" onclick={retry}
						><RotateCcw size={15} />Retry</Button
					><Button type="button" onclick={nextSentence}
						>{queueIndex + 1 === queue.length ? 'Finish practice' : 'Next sentence'}<ArrowRight
							size={15}
						/></Button
					>{:else if !modelReady}<Button
						type="button"
						disabled={!currentAvailable}
						onclick={() => void loadModel()}><Download size={15} />Load practice model</Button
					>{:else}<Button type="button" disabled={!currentAvailable} onclick={() => void record()}
						><Mic size={16} />Record</Button
					><Button type="button" variant="ghost" onclick={nextSentence}
						>{queueIndex + 1 === queue.length ? 'Finish practice' : 'Skip sentence'}</Button
					>{/if}
			</div>{/if}
	{/if}
	{#if errorMessage}<div class="notice error" role="alert">
			<CircleAlert size={16} /><span>{errorMessage}</span>
		</div>{/if}
	{#if editing && previewing}<button
			type="button"
			class="back-to-settings"
			onclick={() => {
				chooseSentences();
				previewing = false;
				search = '';
				page = 1;
			}}>Back to activity settings</button
		>{/if}
</section>

<style>
	.speaking-practice {
		container-type: inline-size;
		min-inline-size: 0;
		color: var(--foreground);
		font-size: 0.85rem;
	}
	.practice-header,
	.practice-heading,
	.local-badge,
	.settings-heading,
	.picker-heading,
	.selection-actions,
	.sentence-option,
	.pagination,
	.pagination > div,
	.session-navigation,
	.reference-heading,
	.session-actions,
	.notice,
	.result-heading,
	.all-sentences {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.practice-header {
		justify-content: space-between;
		margin-block-end: 1rem;
		gap: 0.75rem;
	}
	.practice-heading {
		min-inline-size: 0;
	}
	h3,
	h4,
	p {
		margin: 0;
	}
	h3 {
		font-size: 1.1rem;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	h4 {
		font-size: 0.88rem;
		font-weight: 700;
	}
	.eyebrow {
		color: var(--editor-selection);
		font-size: 0.6rem;
		font-weight: 750;
		letter-spacing: 0.065em;
		text-transform: uppercase;
	}
	.practice-icon,
	.summary-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		inline-size: 2.7rem;
		block-size: 2.7rem;
		border-radius: 0.85rem;
		color: var(--editor-selection);
		background: color-mix(in oklab, var(--editor-selection) 10%, transparent);
	}
	.local-badge {
		flex-shrink: 0;
		gap: 0.25rem;
		color: var(--studio-green, #52816c);
		font-size: 0.65rem;
	}
	.instructions {
		margin-block-end: 1rem;
		color: var(--muted-foreground);
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.author-settings {
		display: grid;
		gap: 0.7rem;
		margin-block-end: 1rem;
		padding: 0.9rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		background: color-mix(in oklab, var(--muted) 35%, transparent);
	}
	.settings-heading {
		justify-content: space-between;
		flex-wrap: wrap;
	}
	.settings-heading strong {
		font-size: 0.8rem;
	}
	.settings-heading > span {
		color: var(--muted-foreground);
		font-size: 0.65rem;
	}
	.author-settings label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 600;
	}
	.author-settings input,
	.author-settings textarea,
	.author-settings select {
		inline-size: 100%;
		min-inline-size: 0;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.55rem 0.65rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 400;
	}
	.author-settings textarea {
		resize: vertical;
	}
	.picker-heading {
		justify-content: space-between;
		align-items: start;
		margin-block-end: 0.75rem;
	}
	.picker-heading p,
	.all-sentences p {
		margin-block-start: 0.2rem;
		color: var(--muted-foreground);
		font-size: 0.74rem;
		line-height: 1.5;
	}
	.picker-heading > span {
		flex-shrink: 0;
		padding: 0.25rem 0.5rem;
		border-radius: 2rem;
		background: var(--muted);
		color: var(--muted-foreground);
		font-size: 0.65rem;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		padding: 0.55rem 0.65rem;
		color: var(--muted-foreground);
	}
	.search input {
		flex: 1;
		min-inline-size: 0;
		border: 0;
		background: transparent;
		color: var(--foreground);
		outline: none;
		font: inherit;
		font-size: 0.78rem;
	}
	.search button {
		display: grid;
		place-items: center;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
	}
	.selection-actions {
		flex-wrap: wrap;
		gap: 0.85rem;
		padding-block: 0.75rem;
		color: var(--muted-foreground);
		font-size: 0.68rem;
	}
	.selection-actions label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
	}
	.selection-actions button,
	.session-navigation button,
	.reference-heading button,
	.notice button,
	.back-to-settings {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 0;
		padding: 0;
		background: none;
		color: var(--editor-selection);
		font: inherit;
		font-size: 0.7rem;
		cursor: pointer;
	}
	input[type='checkbox'] {
		flex-shrink: 0;
		inline-size: 1rem;
		block-size: 1rem;
		margin: 0;
		accent-color: var(--editor-selection);
	}
	.sentence-picker {
		display: grid;
		gap: 0.4rem;
		max-block-size: 25rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}
	.sentence-option {
		align-items: flex-start;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.7rem;
		cursor: pointer;
	}
	.sentence-option input {
		margin-block-start: 0.2rem;
	}
	.sentence-option.checked {
		border-color: color-mix(in oklab, var(--editor-selection) 55%, var(--border));
		background: color-mix(in oklab, var(--editor-selection) 5%, transparent);
	}
	.sentence-number {
		flex-shrink: 0;
		padding-block-start: 0.15rem;
		color: var(--muted-foreground);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
	}
	.sentence-copy {
		display: grid;
		gap: 0.25rem;
		flex: 1;
		min-inline-size: 0;
		line-height: 1.55;
		overflow-wrap: anywhere;
	}
	.sentence-copy small {
		color: var(--muted-foreground);
		font-size: 0.63rem;
	}
	.picker-empty {
		padding: 2rem 1rem;
		color: var(--muted-foreground);
		text-align: center;
		font-size: 0.8rem;
	}
	.pagination {
		justify-content: space-between;
		margin-block-start: 0.5rem;
		color: var(--muted-foreground);
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
	}
	.picker-footer {
		display: grid;
		gap: 0.8rem;
		justify-items: start;
		margin-block-start: 0.85rem;
	}
	.picker-footer p {
		display: flex;
		align-items: start;
		gap: 0.4rem;
		color: var(--muted-foreground);
		font-size: 0.68rem;
		line-height: 1.5;
	}
	.picker-footer p :global(svg) {
		flex-shrink: 0;
		margin-block-start: 0.1rem;
	}
	.empty-state {
		display: grid;
		justify-items: center;
		gap: 0.6rem;
		padding: 2rem 1rem;
		color: var(--muted-foreground);
		text-align: center;
		border: 1px dashed var(--border);
		border-radius: 0.75rem;
	}
	.empty-state p {
		max-inline-size: 26rem;
		line-height: 1.6;
		font-size: 0.8rem;
	}
	.all-sentences {
		align-items: start;
		padding: 0.75rem;
		border-radius: 0.6rem;
		background: color-mix(in oklab, var(--editor-selection) 5%, transparent);
	}
	.all-sentences > :global(svg) {
		flex-shrink: 0;
		color: var(--editor-selection);
	}
	.all-sentences strong {
		font-size: 0.8rem;
	}
	.session-navigation {
		justify-content: space-between;
		color: var(--muted-foreground);
		font-size: 0.7rem;
	}
	.queue-progress {
		inline-size: 100%;
		block-size: 0.25rem;
		margin-block: 0.6rem 1rem;
		accent-color: var(--editor-selection);
	}
	.reference {
		padding: 1rem;
		border: 1px solid color-mix(in oklab, var(--editor-selection) 18%, var(--border));
		border-radius: 0.8rem;
		background: color-mix(in oklab, var(--editor-selection) 5%, transparent);
	}
	.reference-heading {
		justify-content: space-between;
		color: var(--muted-foreground);
		font-size: 0.66rem;
		font-weight: 650;
	}
	.reference > p {
		margin-block: 0.75rem;
		font-size: clamp(1.05rem, 3.5cqi, 1.35rem);
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
	.reference > small {
		color: var(--muted-foreground);
		font-size: 0.65rem;
	}
	.model-loading,
	.capture-status {
		display: grid;
		justify-items: center;
		gap: 0.65rem;
		padding: 1.5rem 1rem;
		text-align: center;
	}
	.model-loading > :global(svg),
	.capture-status > :global(svg) {
		color: var(--editor-selection);
	}
	.model-loading p,
	.capture-status p {
		color: var(--muted-foreground);
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.model-loading small {
		color: var(--muted-foreground);
		font-size: 0.67rem;
	}
	.model-loading progress {
		inline-size: min(100%, 20rem);
		block-size: 0.45rem;
		accent-color: var(--editor-selection);
	}
	.recording-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--destructive);
		font-size: 0.78rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.recording-indicator > span {
		inline-size: 0.5rem;
		block-size: 0.5rem;
		border-radius: 50%;
		background: currentColor;
	}
	.input-meter {
		inline-size: min(100%, 15rem);
		block-size: 0.45rem;
		overflow: hidden;
		border-radius: 1rem;
		background: var(--muted);
	}
	.input-meter > span {
		display: block;
		block-size: 100%;
		background: var(--editor-selection);
		transition: width 100ms;
	}
	.session-actions {
		justify-content: center;
		flex-wrap: wrap;
		margin-block-start: 1rem;
	}
	.notice {
		align-items: flex-start;
		flex-wrap: wrap;
		padding: 0.7rem;
		margin-block-start: 0.75rem;
		border-radius: 0.55rem;
		background: var(--muted);
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.notice > span {
		flex: 1 1 12rem;
		overflow-wrap: anywhere;
	}
	.notice > :global(svg) {
		flex-shrink: 0;
		margin-block-start: 0.1rem;
	}
	.notice.error {
		color: var(--destructive);
		background: color-mix(in oklab, var(--destructive) 7%, transparent);
	}
	.match-result {
		margin-block-start: 1rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
	}
	.result-heading {
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.score {
		font-size: 2.1rem;
		line-height: 1.25;
		letter-spacing: -0.04em;
		font-variant-numeric: tabular-nums;
	}
	.score small {
		font-size: 1rem;
		color: var(--muted-foreground);
	}
	.match-stats {
		display: grid;
		gap: 0.3rem;
		font-size: 0.78rem;
	}
	.match-stats small {
		color: var(--muted-foreground);
		font-size: 0.68rem;
	}
	.word-comparison {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.4rem;
		margin-block: 1rem;
	}
	.word {
		display: inline-grid;
		gap: 0.2rem;
		border-radius: 0.4rem;
		padding: 0.35rem 0.5rem;
		background: color-mix(in oklab, var(--studio-green, #52816c) 10%, transparent);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
		max-inline-size: 100%;
	}
	.word[data-kind='missing'] {
		background: color-mix(in oklab, var(--destructive) 9%, transparent);
		color: var(--destructive);
		border-block-end: 2px dashed currentColor;
	}
	.word[data-kind='different'] {
		background: color-mix(in oklab, #b97719 12%, transparent);
		border-block-end: 2px solid #b97719;
	}
	.word[data-kind='extra'] {
		background: color-mix(in oklab, var(--editor-selection) 10%, transparent);
		border-block-end: 2px dotted var(--editor-selection);
	}
	.word small {
		font-size: 0.58rem;
	}
	.match-result details {
		font-size: 0.72rem;
		color: var(--muted-foreground);
	}
	.match-result summary {
		cursor: pointer;
	}
	.match-result details p {
		padding-block: 0.5rem;
		font-size: 0.82rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.feedback-note {
		margin-block-start: 0.7rem;
		color: var(--muted-foreground);
		font-size: 0.67rem;
		line-height: 1.5;
	}
	.recording-playback {
		display: grid;
		gap: 0.4rem;
		margin-block-start: 0.85rem;
	}
	.recording-playback > span {
		color: var(--muted-foreground);
		font-size: 0.68rem;
	}
	.recording-playback audio {
		inline-size: 100%;
		max-block-size: 2.7rem;
	}
	.back-to-settings {
		margin-block-start: 1rem;
		text-decoration: underline;
	}
	.summary {
		display: grid;
		justify-items: center;
		gap: 0.6rem;
		padding-block: 1rem;
		text-align: center;
	}
	.summary > p {
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}
	.summary h4 {
		font-size: 1.1rem;
	}
	.summary-stats {
		display: flex;
		gap: 2rem;
		margin-block: 0.7rem;
	}
	.summary-stats > div {
		display: grid;
		gap: 0.2rem;
	}
	.summary-stats strong {
		font-size: 1.6rem;
	}
	.summary-stats span {
		color: var(--muted-foreground);
		font-size: 0.68rem;
	}
	.summary-list {
		inline-size: 100%;
		max-block-size: 16rem;
		overflow: auto;
		scrollbar-width: thin;
		border-block: 1px solid var(--border);
	}
	.summary-list > div {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		justify-content: space-between;
		padding: 0.7rem 0;
		text-align: start;
		border-block-end: 1px solid var(--border);
	}
	.summary-list p {
		min-inline-size: 0;
		overflow-wrap: anywhere;
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.summary-list span {
		flex-shrink: 0;
		color: var(--editor-selection);
		font-size: 0.7rem;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	button:focus-visible,
	select:focus-visible,
	textarea:focus,
	input:focus-visible,
	summary:focus-visible,
	.search:focus-within {
		outline: 2px solid color-mix(in oklab, var(--editor-selection) 65%, transparent);
		outline-offset: 2px;
	}
	.search input:focus {
		outline: none;
	}
	:global(.spin) {
		animation: speaking-spin 900ms linear infinite;
	}
	@keyframes speaking-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@container (max-width: 26rem) {
		.practice-header {
			flex-wrap: wrap;
		}
		.local-badge {
			margin-inline-start: 3.3rem;
		}
		.picker-heading {
			flex-direction: column;
		}
		.result-heading {
			gap: 0.5rem;
		}
		.session-actions :global(button) {
			flex: 1;
		}
		.author-settings {
			padding: 0.65rem;
		}
		.reference {
			padding: 0.75rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.spin) {
			animation: none;
		}
		.input-meter > span {
			transition: none;
		}
	}
</style>
