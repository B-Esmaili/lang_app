<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		Mic,
		Square,
		Volume2,
		RotateCcw,
		Sparkles,
		Settings2,
		MessageCircle,
		AudioLines,
		Languages,
		LoaderCircle,
		AlertCircle,
		Info,
		ChevronDown
	} from '@lucide/svelte';
	import { PracticeRecorder, MAX_RECORDING_SECONDS } from '../speaking-practice/audio-recorder';
	import { LocalSpeechEngine, type SpeechEngineMode } from '../speaking-practice/speech-engine';
	import { WEB_STT } from '../speaking-practice/stt-config';
	import { BrowserSpeechRecognition } from './browser-speech-recognition';
	import { recognizeVoiceTurn, type SpeechLanguageMode } from './stt-routing';
	import {
		createSpeechEngine,
		speechVoiceFor,
		VoicePlayback,
		type SpeechEngine
	} from './tts-engine';
	import { spokenTextAt } from './spoken-text';
	import { TurnDetector, HANDS_FREE_ECHO_GAP_MS, HANDS_FREE_IDLE_MS } from './turn-detector';
	import {
		emptyVoiceChatContext,
		VOICE_CHAT_LIMITS,
		type VoiceChatAction,
		type VoiceChatConfiguration,
		type VoiceChatResult
	} from './model';
	import {
		DEFAULT_DESKTOP_VOICE,
		DEFAULT_VOICE_CHAT_VOICE,
		isDesktopVoiceId,
		isVoiceChatVoiceId,
		type VoiceChatPreferences
	} from './voices';

	let {
		configuration,
		lessonContext = ''
	}: { configuration: VoiceChatConfiguration; lessonContext?: string } = $props();
	const widgetId = $props.id();
	type Phase =
		| 'idle'
		| 'waiting'
		| 'preparing'
		| 'recording'
		| 'transcribing'
		| 'thinking'
		| 'synthesizing'
		| 'speaking';
	type Entry = {
		id: number;
		role: 'user' | 'assistant';
		content: string;
		visibleContent?: string;
		feedback?: boolean;
	};
	let phase = $state<Phase>('idle');
	let status = $state('Start a conversation, then take turns speaking.');
	let progress = $state<number | null>(null);
	let error = $state('');
	let audioError = $state('');
	let speechProvider = $state('');
	let draft = $state('');
	let recordingLanguage: SpeechLanguageMode = 'en';
	let helpMode = $state(false);
	let reviewTranscript = $state(false);
	let handsFree = $state(false);
	let context = $state(emptyVoiceChatContext());
	let entries = $state<Entry[]>([]);
	let hasSummary = $state(false);
	let level = $state(0);
	let seconds = $state(0);
	let transcriptHost: HTMLDivElement | undefined = $state();
	let preferences: VoiceChatPreferences | null = null;
	let recorder: PracticeRecorder | null = null;
	let localSpeech: { mode: SpeechEngineMode; engine: LocalSpeechEngine } | null = null;
	let browserRecognition: BrowserSpeechRecognition | null = null;
	let speaker: SpeechEngine | null = null;
	let playback: VoicePlayback | null = null;
	let controller: AbortController | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let autoListenTimer: ReturnType<typeof setTimeout> | null = null;
	let turnDetector: TurnDetector | null = null;
	let generation = 0;
	let entryId = 0;
	let lastAudio: { text: string; voiceId: string; blob: Blob } | null = null;
	let disposed = false;
	const started = $derived(context.messages.length > 0);
	const working = $derived(phase !== 'idle');
	const canCorrect = $derived(context.messages.some((message) => message.role === 'user'));
	const lastAssistant = $derived(entries.findLast((entry) => entry.role === 'assistant'));
	const canInterruptListening = $derived(
		handsFree && (phase === 'recording' || phase === 'waiting')
	);
	const activityLabels: Record<Phase, string> = {
		idle: 'Your turn',
		waiting: 'Getting ready to listen',
		preparing: 'Getting ready',
		recording: 'Listening to you',
		transcribing: 'Turning speech into text',
		thinking: 'Your partner is thinking',
		synthesizing: 'Preparing the voice',
		speaking: 'Your partner is speaking'
	};
	const activityTitle = $derived(
		phase === 'idle' && draft.trim() ? 'Your answer is ready' : activityLabels[phase]
	);

	function setHandsFree(enabled: boolean) {
		if (!enabled) {
			cancel();
			status = 'Hands-free paused. Tap Speak to answer manually.';
			return;
		}
		unlockAudio();
		handsFree = true;
		if (started && !working && !draft.trim()) void startRecording();
	}

	function listenAfterReply(run: number) {
		// Replay/corrections must not replace an answer still waiting for approval.
		if (!handsFree || disposed || document.hidden || run !== generation || draft.trim()) return;
		phase = 'waiting';
		status = 'Your turn. The microphone will start automatically…';
		// Let the speaker's acoustic tail fade; never record while AI playback is active.
		autoListenTimer = setTimeout(() => {
			autoListenTimer = null;
			if (!handsFree || disposed || document.hidden || run !== generation) return;
			phase = 'idle';
			void startRecording(true);
		}, HANDS_FREE_ECHO_GAP_MS);
	}

	function pauseForSilence() {
		cancel();
		status = 'No speech detected. Hands-free paused; enable it again when you are ready.';
	}

	function requestCorrection() {
		if (canInterruptListening) {
			cancel();
			handsFree = true;
		}
		helpMode = false;
		void ask('correct', '');
	}

	function getLocalSpeech(mode: SpeechEngineMode) {
		if (localSpeech?.mode === mode) return localSpeech.engine;
		localSpeech?.engine.dispose();
		const engine = new LocalSpeechEngine((value) => {
			if (phase === 'preparing' || phase === 'transcribing') {
				status = value.message;
				progress = value.progress;
			}
		}, mode);
		localSpeech = { mode, engine };
		return engine;
	}
	function disposeLocalSpeech() {
		localSpeech?.engine.dispose();
		localSpeech = null;
	}
	function askInPersian() {
		if (working || !started) return;
		if (helpMode) {
			helpMode = false;
			status = 'English practice resumed.';
			return;
		}
		helpMode = true;
		void startRecording(false, 'fa');
	}
	function handleAnswerKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
			return;
		event.preventDefault();
		if (!event.repeat) void ask(helpMode ? 'help' : 'reply');
	}
	function getSpeaker() {
		return (speaker ??= createSpeechEngine((value) => {
			if (phase === 'synthesizing') {
				status = value.message;
				progress = value.progress;
			}
		}));
	}
	function unlockAudio() {
		playback ??= new VoicePlayback();
		// Invoke synchronously from the click; transcription/network work follows later.
		void playback.unlock().catch(() => {
			if (!disposed) audioError = 'Audio is unavailable. You can read replies below.';
		});
	}
	function failure(value: unknown): string {
		return value instanceof Error ? value.message : 'Something went wrong. Please try again.';
	}
	function append(entry: Omit<Entry, 'id'>) {
		const id = ++entryId;
		entries = [...entries, { ...entry, id }].slice(-VOICE_CHAT_LIMITS.displayMessages);
		void tick().then(() =>
			transcriptHost?.scrollTo({
				top: transcriptHost.scrollHeight,
				behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
			})
		);
		return id;
	}
	function showReply(id: number, content: string) {
		const entry = entries.find((item) => item.id === id);
		if (!entry || entry.visibleContent === content) return;
		const follow =
			transcriptHost &&
			transcriptHost.scrollHeight - transcriptHost.scrollTop - transcriptHost.clientHeight < 48;
		entry.visibleContent = content;
		if (follow)
			void tick().then(() => {
				transcriptHost?.scrollTo({ top: transcriptHost.scrollHeight, behavior: 'instant' });
			});
	}
	async function loadPreferences(signal?: AbortSignal) {
		if (preferences) return;
		const response = await fetch(resolve('/api/account/voice-chat'), { signal });
		const value = await response.json();
		if (!response.ok) throw new Error(value.error ?? 'Could not load your voice chat settings.');
		preferences = {
			connectionId: value.connectionId ?? null,
			voiceId: isVoiceChatVoiceId(value.voiceId) ? value.voiceId : DEFAULT_VOICE_CHAT_VOICE,
			desktopVoiceId: isDesktopVoiceId(value.desktopVoiceId)
				? value.desktopVoiceId
				: DEFAULT_DESKTOP_VOICE
		};
	}

	async function speak(text: string, run: number, replyId?: number) {
		audioError = '';
		phase = 'synthesizing';
		progress = null;
		status = 'Preparing spoken reply…';
		let played = false;
		try {
			// Desktop and browser voice IDs never overlap, so one cache serves both engines.
			const voiceId = speechVoiceFor(
				preferences ?? {
					voiceId: DEFAULT_VOICE_CHAT_VOICE,
					desktopVoiceId: DEFAULT_DESKTOP_VOICE
				}
			);
			const blob =
				lastAudio?.text === text && lastAudio.voiceId === voiceId
					? lastAudio.blob
					: await getSpeaker().synthesize(text, voiceId);
			if (run !== generation) return;
			lastAudio = { text, voiceId, blob };
			if (!playback) throw new Error('Tap Replay to enable audio.');
			await playback.play(blob, (fraction) => {
				if (run !== generation) return;
				if (phase !== 'speaking') {
					phase = 'speaking';
					progress = null;
					status = 'Your conversation partner is speaking…';
				}
				if (replyId !== undefined) showReply(replyId, spokenTextAt(text, fraction));
			});
			played = true;
		} catch (cause) {
			if (run === generation) {
				handsFree = false;
				audioError = `${failure(cause)} Tap Replay to try again, or Read reply to view the text.`;
			}
		} finally {
			if (run === generation) {
				if (played && replyId !== undefined) showReply(replyId, text);
				phase = 'idle';
				progress = null;
				status = draft.trim()
					? 'Your answer is kept below. Review it before sending.'
					: 'Your turn. Tap the microphone to answer.';
				if (played) listenAfterReply(run);
			}
		}
	}

	async function ask(action: VoiceChatAction, studentText = draft.trim()) {
		if (working) return;
		if ((action === 'reply' || action === 'help') && !studentText) return;
		if (
			(action === 'reply' || action === 'help') &&
			studentText.length > VOICE_CHAT_LIMITS.studentText
		) {
			error = 'Please use a shorter answer.';
			return;
		}
		unlockAudio();
		const run = ++generation;
		const requestController = new AbortController();
		controller = requestController;
		phase = 'thinking';
		progress = null;
		status =
			action === 'correct'
				? 'Reviewing your last answer…'
				: action === 'help'
					? 'Finding the English words to help you…'
					: 'Thinking about a reply…';
		error = '';
		try {
			await loadPreferences(requestController.signal);
			if (run !== generation) return;
			const response = await fetch(resolve('/api/voice-chat'), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(95_000)]),
				body: JSON.stringify({
					action,
					text: studentText,
					configuration,
					lessonContext: lessonContext.slice(0, VOICE_CHAT_LIMITS.lessonContext),
					context
				})
			});
			const result = (await response.json()) as VoiceChatResult & { error?: string };
			if (!response.ok)
				throw new Error(result.error ?? 'The conversation partner could not reply. Try again.');
			if (run !== generation) return;
			context = result.context;
			hasSummary ||= result.compacted;
			if (action === 'reply' || action === 'help') {
				append({ role: 'user', content: studentText });
				draft = '';
				if (action === 'help') helpMode = false;
			}
			const replyId = append({
				role: 'assistant',
				content: result.text,
				visibleContent: '',
				feedback: action === 'correct'
			});
			await speak(result.text, run, replyId);
		} catch (cause) {
			if (run === generation) {
				handsFree = false;
				error = failure(cause);
				phase = 'idle';
				status = started
					? 'Your answer is kept below. You can try sending it again.'
					: 'Check your AI connection in Account settings, then try again.';
			}
		} finally {
			if (controller === requestController) controller = null;
		}
	}

	async function startRecording(
		automatic = false,
		language: SpeechLanguageMode = helpMode ? 'fa' : 'en'
	) {
		if (working || !started || disposed || document.hidden) return;
		if (!automatic) unlockAudio();
		recordingLanguage = language;
		const run = ++generation;
		phase = 'preparing';
		status = 'Preparing the microphone…';
		speechProvider = '';
		error = '';
		try {
			// Automatic turns borrow the audio context unlocked by the initial user tap.
			const sharedContext = automatic ? playback?.recordingContext() : undefined;
			if (automatic && !sharedContext) throw new Error('Tap Speak to resume microphone audio.');
			turnDetector = handsFree ? new TurnDetector() : null;
			const next = new PracticeRecorder(() => void finishRecording(), sharedContext);
			recorder = next;
			browserRecognition?.abort();
			browserRecognition = null;
			await next.start(
				(value) => {
					if (run === generation) level = value;
				},
				(samples, sampleRate) => {
					if (run !== generation || phase !== 'recording' || !turnDetector) return;
					const decision = turnDetector.push(samples, sampleRate);
					if (decision === 'finished') void finishRecording();
					else if (decision === 'empty') pauseForSilence();
					else if (turnDetector.hasSpeech)
						status = 'Listening. Pause for 2 seconds to send your answer.';
				}
			);
			if (run !== generation) {
				next.dispose();
				return;
			}
			// Wait for microphone permission before starting the browser service.
			const recognition = new BrowserSpeechRecognition(language);
			browserRecognition = recognition;
			const browserStarted = recognition.start();
			speechProvider = browserStarted
				? `Trying Web Speech API · ${recognition.language === 'fa' ? 'Persian (fa-IR)' : 'English (en-US)'}`
				: WEB_STT === 'moonshine' && language === 'fa'
					? 'Web Speech API could not start. Select a language or type your answer.'
					: 'Web Speech API could not start. A local fallback will be used.';
			phase = 'recording';
			progress = null;
			seconds = 0;
			status = handsFree
				? 'Listening automatically. Start speaking when you are ready.'
				: `Listening. Tap ${reviewTranscript ? 'Stop & review' : 'Stop & send'} when you finish.`;
			// Wait until Web Speech has finished before loading a local model.
			// If the service is unavailable, warm the one model needed for this mode.
			if (!browserStarted && (WEB_STT === 'whisper' || language === 'en')) {
				void getLocalSpeech(language === 'en' ? 'english' : 'persian')
					.load()
					.catch(() => {});
			}
			const startedAt = performance.now();
			timer = setInterval(() => {
				seconds = Math.min(MAX_RECORDING_SECONDS, (performance.now() - startedAt) / 1000);
				if (turnDetector && !turnDetector.hasSpeech && seconds * 1000 >= HANDS_FREE_IDLE_MS)
					pauseForSilence();
			}, 100);
		} catch (cause) {
			if (run === generation) {
				handsFree = false;
				turnDetector = null;
				error = failure(cause);
				recorder?.dispose();
				recorder = null;
				browserRecognition?.abort();
				browserRecognition = null;
				phase = 'idle';
				progress = null;
				status = 'Try the microphone again, or type your answer.';
			}
		}
	}

	async function finishRecording() {
		if (phase !== 'recording' || !recorder) return;
		if (turnDetector && !turnDetector.hasSpeech) {
			pauseForSilence();
			return;
		}
		turnDetector = null;
		const run = generation;
		const current = recorder;
		const browserSession = browserRecognition;
		if (timer) clearInterval(timer);
		timer = null;
		phase = 'transcribing';
		level = 0;
		status = 'Listening to your recording…';
		try {
			const mode = recordingLanguage;
			const browserResultPromise = browserSession?.stop() ?? Promise.resolve(null);
			const recording = await current.stop();
			current.dispose();
			if (run !== generation) return;
			recorder = null;

			const browser = await browserResultPromise;
			if (run !== generation) return;
			if (browser?.text && !browser.error)
				speechProvider = `Web Speech API (${browser.language === 'fa' ? 'fa-IR' : 'en-US'}) returned text.`;
			else
				speechProvider =
					WEB_STT === 'moonshine' && mode === 'fa'
						? `Web Speech API: ${browser?.error ?? 'no transcript'}. Type your question instead.`
						: `Web Speech API: ${browser?.error ?? 'no transcript'}. Checking the local fallback…`;
			const { text, language, provider } = await recognizeVoiceTurn(
				mode,
				browser,
				{
					transcribe: (language) => {
						if (run !== generation) throw new DOMException('Recording cancelled.', 'AbortError');
						return getLocalSpeech(language === 'en' ? 'english' : 'persian').transcribe(
							recording.samples,
							language
						);
					}
				},
				(provider) => {
					if (run === generation) speechProvider = provider;
				},
				WEB_STT
			);
			if (run !== generation) return;
			speechProvider = `Transcript: ${provider}`;
			if (!text.trim()) throw new Error('No speech was recognized. Please try again.');
			if (text.length > VOICE_CHAT_LIMITS.studentText)
				throw new Error('Please use a shorter answer.');
			draft = text;
			phase = 'idle';
			progress = null;
			status = reviewTranscript
				? language === 'fa'
					? 'Review your Persian question, then press Enter to ask for help.'
					: 'Review your answer, then press Enter to send.'
				: 'Sending your answer…';
			if (!reviewTranscript) await ask(language === 'fa' ? 'help' : 'reply', text);
		} catch (cause) {
			if (run === generation) {
				handsFree = false;
				error = failure(cause);
				phase = 'idle';
				progress = null;
				status = helpMode
					? 'Please try asking in Persian again, or type your question.'
					: 'Please try speaking again, or type your answer.';
			}
		} finally {
			current.dispose();
			browserSession?.abort();
			if (browserRecognition === browserSession) browserRecognition = null;
		}
	}

	async function replay() {
		if (working || !lastAssistant) return;
		unlockAudio();
		const revealId =
			lastAssistant.visibleContent !== undefined &&
			lastAssistant.visibleContent !== lastAssistant.content
				? lastAssistant.id
				: undefined;
		await speak(lastAssistant.content, ++generation, revealId);
	}
	function cancel() {
		generation++;
		speechProvider = '';
		recordingLanguage = 'en';
		handsFree = false;
		turnDetector = null;
		browserRecognition?.abort();
		browserRecognition = null;
		if (autoListenTimer) clearTimeout(autoListenTimer);
		autoListenTimer = null;
		controller?.abort();
		controller = null;
		if (timer) clearInterval(timer);
		timer = null;
		recorder?.dispose();
		recorder = null;
		if (phase === 'preparing' || phase === 'recording' || phase === 'transcribing') {
			disposeLocalSpeech();
		}
		if (phase === 'synthesizing') speaker?.cancel();
		playback?.stop();
		phase = 'idle';
		progress = null;
		level = 0;
		status = started
			? 'Your turn. Tap the microphone to answer.'
			: 'Start a conversation when you are ready.';
	}
	function reset() {
		cancel();
		disposeLocalSpeech();
		speaker?.dispose();
		speaker = null;
		playback?.dispose();
		playback = null;
		context = emptyVoiceChatContext();
		entries = [];
		hasSummary = false;
		draft = '';
		helpMode = false;
		error = '';
		audioError = '';
		preferences = null;
		lastAudio = null;
		status = 'Start a new conversation when you are ready.';
	}
	onDestroy(() => {
		disposed = true;
		reset();
	});
	function visibilityChanged() {
		if (document.hidden && (working || handsFree)) cancel();
	}
</script>

<svelte:document onvisibilitychange={visibilityChanged} />

<div class="voice-chat" lang="en" dir="ltr" data-phase={phase}>
	<header>
		<span class="avatar" aria-hidden="true"><AudioLines size={24} /></span>
		<div class="heading">
			<div class="heading-meta">
				<span class="eyebrow">Conversation practice</span>
				<span class="level-badge" aria-label={`English level ${configuration.level}`}
					>{configuration.level}</span
				>
			</div>
			<h3>{configuration.title || 'Voice chat'}</h3>
			{#if configuration.topic}<p>{configuration.topic}</p>{/if}
		</div>
		<a
			class="settings"
			href={resolve('/account')}
			aria-label="Voice chat settings"
			title="Choose your AI model and speaker"><Settings2 size={18} /></a
		>
	</header>
	<div class="preferences">
		<label class="hands-free">
			<span class="preference-copy">
				<span class="field-heading">Hands-free</span>
				<small>Listen after each reply. A 2-second pause finishes your turn.</small>
			</span>
			<span class="switch">
				<input
					type="checkbox"
					aria-label="Hands-free — automatically listen and send when I pause"
					checked={handsFree}
					disabled={working && !handsFree}
					onchange={(event) => setHandsFree(event.currentTarget.checked)}
				/>
				<span class="switch-track" aria-hidden="true"></span>
			</span>
		</label>
	</div>
	{#if !started}
		<div class="welcome">
			<div class="voice-emblem" aria-hidden="true"><AudioLines size={32} strokeWidth={1.5} /></div>
			<h4>Your space to speak.</h4>
			<p>
				Practice with your AI partner at your own pace. Speak in English, or ask a question in <span
					lang="fa">فارسی</span
				>.
			</p>
			<button class="primary" onclick={() => void ask('start')} disabled={working}
				><MessageCircle size={17} aria-hidden="true" />Start conversation</button
			>
			<small>No pressure. Ask for feedback whenever you’re ready.</small>
		</div>
	{/if}
	{#if entries.length}
		<div class="conversation-heading">
			<span>Conversation</span><span>Listen, speak, learn.</span>
		</div>
		<div
			class="transcript"
			role="log"
			aria-label="Voice conversation"
			aria-live="polite"
			bind:this={transcriptHost}
		>
			{#each entries as entry (entry.id)}
				<div class="turn" class:student={entry.role === 'user'} class:feedback={entry.feedback}>
					<div class="message-meta">
						{#if entry.role !== 'user'}
							{#if entry.feedback}<Sparkles size={12} aria-hidden="true" />{:else}<AudioLines
									size={12}
									aria-hidden="true"
								/>{/if}
						{/if}
						<span
							>{entry.role === 'user'
								? 'You'
								: entry.feedback
									? 'Requested feedback'
									: 'AI partner'}</span
						>
					</div>
					{#if entry.visibleContent !== ''}<p dir="auto">
							{entry.visibleContent ?? entry.content}
						</p>{/if}
					{#if entry.role === 'assistant' && entry.visibleContent !== undefined && entry.visibleContent !== entry.content && !working}
						<button class="quiet read-reply" onclick={() => showReply(entry.id, entry.content)}
							>Read reply</button
						>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
	{#if started || working}
		<div class="activity" class:is-recording={phase === 'recording'}>
			<div class="activity-row">
				<div class="status" role="status" aria-atomic="true">
					<span class="status-icon" aria-hidden="true">
						{#if phase === 'recording'}<Mic size={18} />
						{:else if phase === 'speaking'}<Volume2 size={18} />
						{:else if working}<LoaderCircle size={18} class="spinner" />
						{:else}<MessageCircle size={18} />{/if}
					</span>
					<div>
						<strong>{activityTitle}</strong>
						<p>{status}</p>
					</div>
				</div>
				{#if working || handsFree}
					<button class="quiet cancel" onclick={cancel}>
						<Square size={13} aria-hidden="true" />{handsFree
							? 'Pause hands-free'
							: phase === 'speaking'
								? 'Stop speaking'
								: 'Cancel'}
					</button>
				{/if}
			</div>
			{#if speechProvider}
				<p class="speech-provider" aria-label="Speech recognition provider" aria-live="polite">
					{speechProvider}
				</p>
			{/if}
			{#if phase === 'recording'}
				<div class="recording-details">
					<div
						class="meter"
						role="meter"
						aria-label="Microphone level"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={Math.round(Math.min(1, Math.max(0, level)) * 100)}
					>
						<span style={`width:${Math.min(100, Math.max(2, level * 100))}%`}></span>
					</div>
					<span>{MAX_RECORDING_SECONDS}s maximum</span>
				</div>
			{/if}
			{#if progress !== null && (phase === 'preparing' || phase === 'transcribing' || phase === 'synthesizing')}
				<div class="download-progress">
					<progress max="100" value={progress} aria-label="Speech model download"></progress><span
						>{Math.round(progress)}%</span
					>
				</div>
			{/if}
		</div>
	{/if}
	{#if error}<div class="notice error" role="alert">
			<AlertCircle size={18} aria-hidden="true" />
			<p>{error}</p>
		</div>{/if}
	{#if audioError}<div class="notice audio-error" role="status">
			<Info size={18} aria-hidden="true" />
			<p>{audioError}</p>
		</div>{/if}
	{#if started}
		<div class="composer">
			<div class="controls">
				{#if phase === 'recording'}
					<button class="primary speak recording" onclick={() => void finishRecording()}
						><Square size={16} aria-hidden="true" />{reviewTranscript
							? 'Stop & review'
							: 'Stop & send'}<span class="recording-time">{seconds.toFixed(0)}s</span></button
					>
				{:else}
					<button
						class="speak"
						class:primary={!draft.trim()}
						aria-label="Speak"
						disabled={working}
						onclick={() => void startRecording()}
						><Mic size={18} aria-hidden="true" />Speak<span class="speak-hint"
							>{draft.trim() ? 'Record again' : 'Your turn'}</span
						></button
					>
				{/if}
				<div class="secondary-controls">
					<button
						class="quiet"
						type="button"
						aria-pressed={helpMode}
						aria-label={helpMode ? 'Back to English' : 'Ask for help in Persian'}
						title={helpMode
							? 'Use English for your next answer'
							: 'Ask a question in Persian; your partner will help in English'}
						disabled={working}
						onclick={askInPersian}
						><Languages size={16} aria-hidden="true" />{helpMode
							? 'Back to English'
							: 'Ask in Persian'}</button
					>
					<button
						class="quiet"
						disabled={working || !lastAssistant}
						onclick={() => void replay()}
						title="Listen to the last reply again"
						><Volume2 size={16} aria-hidden="true" />Replay</button
					>
					<button
						class="quiet"
						aria-label="Correct my last answer"
						title="Get feedback on your last answer"
						disabled={(working && !canInterruptListening) || !canCorrect}
						onclick={requestCorrection}
						><Sparkles size={16} aria-hidden="true" />Get feedback</button
					>
				</div>
			</div>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void ask(helpMode ? 'help' : 'reply');
				}}
			>
				<label class="draft-label"
					>{helpMode ? 'Your Persian question' : 'Your answer'}<textarea
						bind:value={draft}
						dir="auto"
						maxlength={VOICE_CHAT_LIMITS.studentText}
						rows="2"
						enterkeyhint="send"
						aria-describedby={`${widgetId}-answer-hint`}
						disabled={working}
						onkeydown={handleAnswerKeydown}
						placeholder={helpMode
							? 'Ask your question in فارسی…'
							: 'Speak or type your answer in English…'}></textarea></label
				>
			</form>
			<p class="composer-hint" id={`${widgetId}-answer-hint`}>
				{helpMode
					? 'Ask in Persian · your partner answers in English · Enter to send'
					: 'Enter to send · Shift+Enter for a new line'}
			</p>
			<div class="composer-options">
				<label class="review"
					><input type="checkbox" bind:checked={reviewTranscript} disabled={working} />Review
					transcript before sending</label
				>
				{#if draft.length}<span
						class="character-count"
						aria-label={`${draft.length} of ${VOICE_CHAT_LIMITS.studentText} characters`}
						>{draft.length} / {VOICE_CHAT_LIMITS.studentText}</span
					>{/if}
			</div>
		</div>
	{/if}
	<footer>
		<details class="privacy">
			<summary
				><Info size={14} aria-hidden="true" />Speech & privacy<ChevronDown
					size={14}
					class="chevron"
					aria-hidden="true"
				/></summary
			>
			<p>
				Browser recognition may use an online speech service. If unavailable, English uses the
				selected local speech model; Persian uses a local fallback only with Whisper. You can always
				type your answer or question. Speech models download on first use.
			</p>
		</details>
		{#if started}<button class="quiet reset" onclick={reset}
				><RotateCcw size={14} aria-hidden="true" />New conversation</button
			>{/if}
	</footer>
	{#if hasSummary}<small class="memory-note"
			>Earlier exchanges are summarized to keep the conversation focused.</small
		>{/if}
</div>

<style>
	.voice-chat {
		container: voice-chat / inline-size;
		display: grid;
		gap: 1.1rem;
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-radius: 1.25rem;
		background: var(--card);
		color: var(--foreground);
		font-family: var(--font-content);
		box-shadow: 0 4px 24px rgb(0 0 0 / 3%);
	}
	:global(.dark) .voice-chat {
		color-scheme: dark;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	.avatar,
	.voice-emblem {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		color: var(--primary);
		background: var(--muted);
	}
	.avatar {
		width: 3rem;
		height: 3rem;
		border: 1px solid var(--border);
		border-radius: 0.95rem;
	}
	.heading {
		flex: 1;
		min-width: 0;
	}
	.heading-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}
	.eyebrow {
		color: var(--muted-foreground);
		font-size: 0.64rem;
		font-weight: 550;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.level-badge {
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--border);
		border-radius: 0.35rem;
		font-size: 0.6rem;
		font-weight: 650;
		line-height: 1.3;
	}
	h3 {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 650;
		line-height: 1.4;
		letter-spacing: -0.025em;
		overflow-wrap: anywhere;
	}
	.heading p {
		margin: 0.2rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.77rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.settings {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		flex-shrink: 0;
		color: var(--muted-foreground);
		border-radius: 0.7rem;
		transition: background 150ms;
	}
	.settings:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	button,
	textarea {
		box-sizing: border-box;
		font: inherit;
		color: inherit;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		min-height: 2.75rem;
		padding: 0.65rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: 0.7rem;
		background: var(--card);
		font-size: 0.8rem;
		font-weight: 550;
		line-height: 1.4;
		cursor: pointer;
		transition:
			background 150ms,
			border-color 150ms,
			box-shadow 150ms;
	}
	button:hover:not(:disabled) {
		background: var(--muted);
		border-color: color-mix(in oklch, var(--foreground) 25%, var(--border));
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	button.primary {
		background: var(--primary);
		border-color: var(--primary);
		color: var(--primary-foreground);
	}
	button.primary:hover:not(:disabled) {
		background: color-mix(in oklch, var(--primary) 88%, var(--card));
	}
	button.quiet {
		background: transparent;
		border-color: transparent;
		color: var(--muted-foreground);
	}
	button.quiet:hover:not(:disabled) {
		background: var(--muted);
		color: var(--foreground);
	}
	button:focus-visible,
	a:focus-visible,
	textarea:focus-visible,
	summary:focus-visible,
	.review input:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: 3px;
	}
	.preferences {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		padding: 0.9rem;
		border: 1px solid var(--border);
		border-radius: 0.85rem;
		background: color-mix(in oklch, var(--muted) 55%, var(--card));
	}
	.field-heading {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.74rem;
		font-weight: 600;
	}
	.hands-free {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		cursor: pointer;
	}
	.preference-copy {
		display: grid;
		flex: 1;
		gap: 0.3rem;
	}
	.preference-copy small {
		color: var(--muted-foreground);
		font-size: 0.69rem;
		line-height: 1.65;
	}
	.switch {
		position: relative;
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		flex-shrink: 0;
	}
	.switch input {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.switch-track {
		width: 2.5rem;
		height: 1.5rem;
		border-radius: 2rem;
		background: color-mix(in oklch, var(--muted-foreground) 35%, var(--card));
		transition: background 150ms;
	}
	.switch-track::after {
		content: '';
		display: block;
		width: 1.125rem;
		height: 1.125rem;
		margin: 0.1875rem;
		border-radius: 50%;
		background: var(--card);
		box-shadow: 0 1px 3px rgb(0 0 0 / 16%);
		transition: transform 150ms;
	}
	.switch input:checked + .switch-track {
		background: var(--primary);
	}
	.switch input:checked + .switch-track::after {
		transform: translateX(1rem);
		background: var(--primary-foreground);
	}
	.switch input:focus-visible + .switch-track {
		outline: 2px solid var(--primary);
		outline-offset: 4px;
	}
	.switch input:disabled {
		cursor: not-allowed;
	}
	.switch input:disabled + .switch-track {
		opacity: 0.45;
	}
	.welcome {
		display: grid;
		justify-items: center;
		gap: 0.9rem;
		padding: 1.75rem 1rem;
		text-align: center;
	}
	.voice-emblem {
		width: 4.25rem;
		height: 4.25rem;
		margin-bottom: 0.2rem;
		border-radius: 1.4rem;
		border: 1px solid var(--border);
		box-shadow: 0 0 0 0.55rem color-mix(in oklch, var(--muted) 45%, transparent);
	}
	.welcome h4 {
		margin: 0;
		font-size: 1.35rem;
		font-weight: 600;
		letter-spacing: -0.03em;
	}
	.welcome p {
		max-width: 24rem;
		margin: 0;
		color: var(--muted-foreground);
		font-size: 0.85rem;
		line-height: 1.8;
	}
	.welcome .primary {
		margin-top: 0.25rem;
		padding-inline: 1.3rem;
	}
	.welcome small {
		color: var(--muted-foreground);
		font-size: 0.7rem;
		line-height: 1.65;
	}
	.conversation-heading {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: -0.5rem;
		font-size: 0.74rem;
		font-weight: 600;
	}
	.conversation-heading span:last-child {
		color: var(--muted-foreground);
		font-size: 0.69rem;
		font-weight: 400;
	}
	.transcript {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		min-height: 7rem;
		max-height: 24rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.25rem 0.25rem 0.65rem;
		scrollbar-width: thin;
		scrollbar-gutter: stable;
	}
	.turn {
		align-self: flex-start;
		max-width: 88%;
		padding: 0.8rem 1rem;
		background: var(--muted);
		border: 1px solid transparent;
		border-radius: 1rem 1rem 1rem 0.3rem;
		overflow-wrap: anywhere;
	}
	.turn.student {
		align-self: flex-end;
		border-radius: 1rem 1rem 0.3rem 1rem;
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.turn.feedback {
		background: var(--card);
		border-color: var(--border);
	}
	.message-meta {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.65rem;
		font-weight: 600;
		opacity: 0.72;
	}
	.turn p {
		margin: 0.35rem 0 0;
		font-size: 0.86rem;
		line-height: 1.85;
		white-space: pre-wrap;
	}
	.read-reply {
		min-height: 2rem;
		margin-top: 0.35rem;
		padding: 0.3rem 0.5rem;
	}
	.activity {
		display: grid;
		gap: 0.65rem;
		padding: 0.85rem;
		border: 1px solid var(--border);
		border-radius: 0.85rem;
	}
	.activity.is-recording {
		border-color: color-mix(in oklch, var(--destructive) 30%, var(--border));
		background: color-mix(in oklch, var(--destructive) 4%, var(--card));
	}
	.activity-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.speech-provider {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 0.72rem;
		line-height: 1.65;
		overflow-wrap: anywhere;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex: 1 1 12rem;
		min-width: 0;
	}
	.status-icon {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		flex-shrink: 0;
		border-radius: 0.65rem;
		background: var(--muted);
	}
	.is-recording .status-icon {
		color: var(--destructive);
		background: color-mix(in oklch, var(--destructive) 10%, var(--card));
	}
	.status strong {
		display: block;
		font-size: 0.77rem;
		font-weight: 600;
	}
	.status p {
		margin: 0.2rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.72rem;
		line-height: 1.65;
		overflow-wrap: anywhere;
	}
	:global(.voice-chat .spinner) {
		animation: voice-spin 1s linear infinite;
	}
	@keyframes voice-spin {
		to {
			transform: rotate(360deg);
		}
	}
	.cancel {
		flex-shrink: 0;
		font-size: 0.71rem;
		padding-inline: 0.5rem;
	}
	.recording-details,
	.download-progress {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		color: var(--muted-foreground);
		font-size: 0.65rem;
	}
	.recording-details > span,
	.download-progress > span {
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}
	.meter {
		flex: 1;
		height: 0.3rem;
		background: color-mix(in oklch, var(--destructive) 12%, var(--card));
		border-radius: 1rem;
		overflow: hidden;
	}
	.meter span {
		display: block;
		height: 100%;
		background: var(--destructive);
		transition: width 100ms;
	}
	progress {
		width: 100%;
		height: 0.35rem;
		accent-color: var(--primary);
	}
	.notice {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		padding: 0.85rem;
		border: 1px solid var(--border);
		border-radius: 0.8rem;
		font-size: 0.78rem;
		line-height: 1.7;
	}
	.notice :global(svg) {
		flex-shrink: 0;
		margin-top: 0.15rem;
	}
	.notice p {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.error {
		border-color: color-mix(in oklch, var(--destructive) 25%, var(--border));
		background: color-mix(in oklch, var(--destructive) 5%, var(--card));
		color: var(--destructive);
	}
	.audio-error {
		color: var(--muted-foreground);
	}
	.composer {
		display: grid;
		gap: 0.9rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.65rem;
	}
	.speak {
		flex: 1 0 10rem;
		min-height: 3rem;
	}
	.speak-hint {
		margin-inline-start: 0.35rem;
		padding-inline-start: 0.65rem;
		border-inline-start: 1px solid currentColor;
		font-size: 0.66rem;
		font-weight: 400;
		opacity: 0.65;
	}
	button.recording,
	button.recording:hover:not(:disabled) {
		background: color-mix(in oklch, var(--destructive) 80%, black);
		border-color: color-mix(in oklch, var(--destructive) 80%, black);
		color: white;
	}
	.recording-time {
		min-width: 2rem;
		margin-inline-start: 0.2rem;
		padding: 0.15rem 0.4rem;
		border-radius: 0.35rem;
		background: rgb(0 0 0 / 12%);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
	}
	.secondary-controls {
		display: flex;
		gap: 0.15rem;
		margin-inline-start: auto;
	}
	.secondary-controls button {
		padding-inline: 0.65rem;
		font-size: 0.75rem;
	}
	form {
		display: flex;
		gap: 0.65rem;
		align-items: end;
		min-width: 0;
	}
	.draft-label {
		display: grid;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
		font-size: 0.74rem;
		font-weight: 550;
	}
	textarea {
		width: 100%;
		resize: vertical;
		min-height: 5.4rem;
		max-height: 16rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 0.85rem;
		font-size: 0.85rem;
		font-weight: 400;
		line-height: 1.75;
		background: var(--card);
	}
	textarea::placeholder {
		color: var(--muted-foreground);
		opacity: 0.85;
	}
	textarea:disabled {
		background: var(--muted);
	}
	.composer-hint {
		margin: -0.35rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.7rem;
		line-height: 1.6;
	}
	.composer-options {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin-top: -0.45rem;
	}
	.review {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		font-size: 0.71rem;
		line-height: 1.6;
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.review input {
		width: 0.95rem;
		height: 0.95rem;
		flex-shrink: 0;
		margin: 0;
		accent-color: var(--primary);
	}
	.character-count {
		color: var(--muted-foreground);
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
	}
	footer {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		border-top: 1px solid var(--border);
		padding-top: 0.6rem;
	}
	.privacy {
		flex: 1 1 8rem;
		min-width: 0;
	}
	.privacy[open] {
		flex-basis: 100%;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: fit-content;
		min-height: 2.75rem;
		border-radius: 0.35rem;
		color: var(--muted-foreground);
		font-size: 0.69rem;
		list-style: none;
		cursor: pointer;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.privacy[open] :global(.chevron) {
		transform: rotate(180deg);
	}
	.privacy p {
		max-width: 28rem;
		margin: 0.2rem 0 0.5rem;
		color: var(--muted-foreground);
		font-size: 0.7rem;
		line-height: 1.75;
	}
	.reset {
		padding-inline: 0.3rem;
		font-size: 0.69rem;
	}
	.memory-note {
		color: var(--muted-foreground);
		font-size: 0.68rem;
		line-height: 1.65;
	}
	@container voice-chat (max-width: 30rem) {
		.preferences {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.8rem;
		}
		.controls {
			gap: 0.25rem;
		}
		.speak {
			flex-basis: 100%;
		}
		.secondary-controls {
			width: 100%;
			margin: 0;
		}
		.secondary-controls button {
			flex: 1;
		}
		.turn {
			max-width: 94%;
			padding: 0.75rem 0.85rem;
		}
		.welcome {
			padding: 1.5rem 0.25rem;
		}
		.welcome h4 {
			font-size: 1.2rem;
		}
		.conversation-heading span:last-child {
			display: none;
		}
	}
	@container voice-chat (max-width: 21rem) {
		.avatar {
			width: 2.5rem;
			height: 2.5rem;
			border-radius: 0.75rem;
		}
		header {
			gap: 0.6rem;
		}
		.eyebrow {
			font-size: 0.57rem;
			letter-spacing: 0.03em;
		}
		h3 {
			font-size: 1.05rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.voice-chat .spinner) {
			animation: none;
		}
		button,
		.settings,
		.switch-track,
		.switch-track::after,
		.meter span {
			transition: none;
		}
	}
</style>
