<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { Model as VoskModel } from 'vosk-browser';
	import {
		MAX_RECORDING_SECONDS,
		PracticeRecorder,
		SPEECH_SAMPLE_RATE,
		createWavBlob,
		resampleMono,
		validateRecording
	} from '$lib/features/speaking-practice/audio-recorder';

	type LabLanguage = 'fa' | 'en';
	type EngineId = 'tiny' | 'base' | 'vosk' | 'native';
	type LocalEngineId = Exclude<EngineId, 'native'>;
	type EnginePhase = 'idle' | 'loading' | 'transcribing' | 'ready' | 'error';
	type EngineState = {
		phase: EnginePhase;
		message: string;
		progress: number | null;
		transcript: string;
		metrics: {
			loadMs: number;
			inferenceMs: number;
			durationSeconds: number | null;
			warm: boolean;
		} | null;
	};
	type Rating = { accuracy: number; usability: number; notes: string };
	type AudioSource = {
		samples: Float32Array;
		blob: Blob;
		durationSeconds: number;
		label: string;
		url: string;
	};
	type WhisperResponse =
		| {
				type: 'status';
				id: string;
				phase: 'loading' | 'transcribing';
				progress: number | null;
				message: string;
		  }
		| {
				type: 'result';
				id: string;
				transcript: string;
				loadMs: number;
				inferenceMs: number;
				warm: boolean;
		  }
		| { type: 'error'; id: string; message: string };

	type BrowserRecognitionResult = {
		isFinal: boolean;
		0: { transcript: string; confidence: number };
	};
	type BrowserRecognitionEvent = {
		resultIndex: number;
		results: ArrayLike<BrowserRecognitionResult>;
	};
	type BrowserRecognition = {
		lang: string;
		continuous: boolean;
		interimResults: boolean;
		maxAlternatives: number;
		onstart: (() => void) | null;
		onresult: ((event: BrowserRecognitionEvent) => void) | null;
		onerror: ((event: { error: string }) => void) | null;
		onend: (() => void) | null;
		start(): void;
		stop(): void;
		abort(): void;
	};
	type BrowserRecognitionConstructor = new () => BrowserRecognition;
	type VoskRecognizerMessage =
		| { event: 'result'; result: { text: string } }
		| { event: 'partialresult'; result: { partial: string } }
		| { event: 'error'; error: string };

	let { language = 'fa' } = $props<{ language?: LabLanguage }>();
	const isEnglish = untrack(() => language === 'en');
	const languageName = isEnglish ? 'English' : 'Persian';
	const localeCode = isEnglish ? 'en-US' : 'fa-IR';
	const textDirection = isEnglish ? 'ltr' : 'rtl';
	const VOSK_MODEL_URL = isEnglish
		? 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz'
		: 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-fa-0.4.tar.gz';
	const PERSIAN_SAMPLE_TEXTS = [
		'امروز هوا خوب است و من برای یادگیری زبان فارسی تمرین می‌کنم.',
		'جلسه بعدی روز سه‌شنبه ساعت ده و سی دقیقه برگزار می‌شود.',
		'فناوری هوش مصنوعی می‌تواند به آموزش بهتر و سریع‌تر کمک کند.',
		'لطفاً فایل پی‌دی‌اف را دانلود کنید و نتیجه را برای من بفرستید.'
	] as const;
	const ENGLISH_SAMPLE_TEXTS = [
		'Today the weather is pleasant, and I am practicing English pronunciation.',
		'The next meeting begins on Tuesday at ten thirty in the morning.',
		'Artificial intelligence can make language learning faster and more accessible.',
		'Please download the PDF file and send me the final result.'
	] as const;
	const SAMPLE_TEXTS = isEnglish ? ENGLISH_SAMPLE_TEXTS : PERSIAN_SAMPLE_TEXTS;
	const SCORE_VALUES = [1, 2, 3, 4, 5] as const;
	const ENGINE_CARDS = [
		{
			id: 'tiny' as const,
			index: '01',
			title: isEnglish ? 'Whisper Tiny' : 'Whisper Tiny (Persian)',
			badge: isEnglish ? 'WASM · q8' : 'WASM · q8 · fa',
			detail: isEnglish
				? 'onnx-community/whisper-tiny.en · English-only · fully local after download'
				: 'onnx-community/whisper-tiny · Persian forced · fully local after download',
			action: () => runWhisper('tiny'),
			cancel: () => cancelWhisper('tiny')
		},
		{
			id: 'base' as const,
			index: '02',
			title: isEnglish ? 'Whisper Base' : 'Whisper Base (Persian)',
			badge: isEnglish ? 'WASM · q8' : 'WASM · q8 · fa',
			detail: isEnglish
				? 'onnx-community/whisper-base.en · recommended English candidate · fully local'
				: 'onnx-community/whisper-base · recommended first candidate · fully local',
			action: () => runWhisper('base'),
			cancel: () => cancelWhisper('base')
		},
		{
			id: 'vosk' as const,
			index: '03',
			title: `Vosk ${languageName}`,
			badge: 'WASM · Kaldi',
			detail: isEnglish
				? 'vosk-model-small-en-us-0.15 · 40 MB archive · local streaming runtime'
				: 'vosk-model-small-fa-0.4 · 48.7 MB archive · local streaming runtime',
			action: () => void runVosk(),
			cancel: cancelVosk
		}
	];

	function initialEngine(message: string): EngineState {
		return { phase: 'idle', message, progress: null, transcript: '', metrics: null };
	}
	function initialRating(): Rating {
		return { accuracy: 0, usability: 0, notes: '' };
	}

	let referenceText = $state<string>(SAMPLE_TEXTS[0]);
	let source = $state<AudioSource | null>(null);
	let sourceError = $state('');
	let recorder = $state<PracticeRecorder | null>(null);
	let recording = $state(false);
	let recordingSeconds = $state(0);
	let recordingLevel = $state(0);
	let recordingTarget = $state<LocalEngineId | null>(null);
	let startingRecording = $state(false);
	let decoding = $state(false);
	let runningBatch = $state(false);
	let exportMessage = $state('');
	let nativeAvailable = $state(false);
	let isolated = $state(false);

	let engines = $state<Record<EngineId, EngineState>>({
		tiny: initialEngine('Ready. The model downloads only when you run it.'),
		base: initialEngine('Ready. Expect a larger first download than Tiny.'),
		vosk: initialEngine(
			isEnglish
				? 'Ready. Uses the 40 MB browser-ready US-English archive.'
				: 'Ready. Uses the 48.7 MB browser-ready Persian archive.'
		),
		native: initialEngine('Checking this browser for speech recognition…')
	});
	let ratings = $state<Record<EngineId, Rating>>({
		tiny: initialRating(),
		base: initialRating(),
		vosk: initialRating(),
		native: initialRating()
	});

	let whisperWorkers: Partial<Record<'tiny' | 'base', Worker>> = {};
	let whisperWaiters: Partial<Record<'tiny' | 'base', { id: string; resolve: () => void }>> = {};
	let activeRequests: Partial<Record<EngineId, string>> = {};
	let recordingTimer: ReturnType<typeof setInterval> | null = null;
	let recordingStartedAt = 0;
	let finishingRecording = $state(false);
	let voskModel: VoskModel | null = null;
	let voskLoading: Promise<VoskModel> | null = null;
	let voskRun = 0;
	let nativeRecognition: BrowserRecognition | null = null;
	let nativeStartedAt = 0;

	const hasAudio = $derived(source !== null);
	const anyWorking = $derived(
		Object.values(engines).some(
			(engine) => engine.phase === 'loading' || engine.phase === 'transcribing'
		)
	);

	onMount(() => {
		document.body.classList.add('stt-lab-route');
		isolated = crossOriginIsolated;
		nativeAvailable = Boolean(browserRecognitionConstructor());
		engines.native.message = nativeAvailable
			? 'Available. This control listens live and may use a browser cloud service.'
			: 'SpeechRecognition is not available in this browser.';

		return () => document.body.classList.remove('stt-lab-route');
	});

	onDestroy(() => {
		if (recordingTimer) clearInterval(recordingTimer);
		recorder?.dispose();
		Object.values(whisperWorkers).forEach((worker) => worker?.terminate());
		voskModel?.terminate();
		nativeRecognition?.abort();
		if (source) URL.revokeObjectURL(source.url);
	});

	function requestId(): string {
		return typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	function errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	function browserRecognitionConstructor(): BrowserRecognitionConstructor | null {
		if (typeof window === 'undefined') return null;
		const speechWindow = window as typeof window & {
			SpeechRecognition?: BrowserRecognitionConstructor;
			webkitSpeechRecognition?: BrowserRecognitionConstructor;
		};
		return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
	}

	function normalizeTranscript(value: string): string {
		if (isEnglish) {
			return value
				.normalize('NFC')
				.toLocaleLowerCase('en-US')
				.replace(/[^\p{L}\p{N}\s]/gu, ' ')
				.replace(/\s+/gu, ' ')
				.trim();
		}
		const digitMap: Record<string, string> = {
			'۰': '0',
			'۱': '1',
			'۲': '2',
			'۳': '3',
			'۴': '4',
			'۵': '5',
			'۶': '6',
			'۷': '7',
			'۸': '8',
			'۹': '9',
			'٠': '0',
			'١': '1',
			'٢': '2',
			'٣': '3',
			'٤': '4',
			'٥': '5',
			'٦': '6',
			'٧': '7',
			'٨': '8',
			'٩': '9'
		};
		return value
			.normalize('NFC')
			.replace(/[يى]/gu, 'ی')
			.replace(/ك/gu, 'ک')
			.replace(/[ۀة]/gu, 'ه')
			.replace(/[ؤ]/gu, 'و')
			.replace(/[إأٱ]/gu, 'ا')
			.replace(/[‌ـ]/gu, ' ')
			.replace(/[۰-۹٠-٩]/gu, (digit) => digitMap[digit] ?? digit)
			.replace(/[^\p{L}\p{N}\s]/gu, ' ')
			.replace(/\s+/gu, ' ')
			.trim();
	}

	function distance<T>(left: T[], right: T[]): number {
		let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
		for (let row = 1; row <= left.length; row++) {
			const current = [row];
			for (let column = 1; column <= right.length; column++) {
				current[column] = Math.min(
					previous[column] + 1,
					current[column - 1] + 1,
					previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
				);
			}
			previous = current;
		}
		return previous[right.length];
	}

	function errorRate(transcript: string, unit: 'word' | 'character'): number | null {
		const reference = normalizeTranscript(referenceText);
		const hypothesis = normalizeTranscript(transcript);
		if (!reference || !transcript.trim()) return null;
		const expected =
			unit === 'word' ? reference.split(' ') : Array.from(reference.replaceAll(' ', ''));
		const actual =
			unit === 'word' ? hypothesis.split(' ') : Array.from(hypothesis.replaceAll(' ', ''));
		return (distance(expected, actual) / Math.max(1, expected.length)) * 100;
	}

	function formatRate(value: number | null): string {
		return value === null ? '—' : `${value.toFixed(1)}%`;
	}

	function setSource(
		samples: Float32Array,
		blob: Blob,
		durationSeconds: number,
		label: string
	): void {
		validateRecording(samples);
		if (source) URL.revokeObjectURL(source.url);
		source = {
			samples,
			blob,
			durationSeconds,
			label,
			url: URL.createObjectURL(blob)
		};
		sourceError = '';
		for (const engineId of ['tiny', 'base', 'vosk'] as const) {
			if (engineId !== 'vosk') settleWhisper(engineId);
			activeRequests[engineId] = requestId();
			engines[engineId].transcript = '';
			engines[engineId].metrics = null;
			engines[engineId].phase = 'idle';
			engines[engineId].progress = null;
			engines[engineId].message = 'Ready for the new recording.';
		}
		exportMessage = '';
	}

	async function startRecording(target: LocalEngineId | null = null): Promise<void> {
		sourceError = '';
		recorder?.dispose();
		recordingTarget = target;
		startingRecording = true;
		const nextRecorder = new PracticeRecorder(() => void finishRecording());
		recorder = nextRecorder;
		try {
			await nextRecorder.start((level) => (recordingLevel = level));
			recording = true;
			recordingSeconds = 0;
			recordingStartedAt = performance.now();
			recordingTimer = setInterval(() => {
				recordingSeconds = Math.min(
					MAX_RECORDING_SECONDS,
					(performance.now() - recordingStartedAt) / 1000
				);
			}, 100);
		} catch (error) {
			nextRecorder.dispose();
			if (recorder === nextRecorder) recorder = null;
			recordingTarget = null;
			sourceError = errorMessage(error);
		} finally {
			startingRecording = false;
		}
	}

	async function finishRecording(): Promise<void> {
		if (!recorder || finishingRecording) return;
		finishingRecording = true;
		const activeRecorder = recorder;
		const target = recordingTarget;
		let capturedSuccessfully = false;
		if (recordingTimer) clearInterval(recordingTimer);
		recordingTimer = null;
		recording = false;
		recordingLevel = 0;
		try {
			const captured = await activeRecorder.stop();
			setSource(captured.samples, captured.blob, captured.durationSeconds, 'Microphone recording');
			capturedSuccessfully = true;
		} catch (error) {
			if (!(error instanceof DOMException && error.name === 'AbortError')) {
				sourceError = errorMessage(error);
			}
		} finally {
			activeRecorder.dispose();
			if (recorder === activeRecorder) recorder = null;
			recordingTarget = null;
			finishingRecording = false;
		}
		if (capturedSuccessfully && target) {
			if (target === 'vosk') void runVosk();
			else void runWhisper(target);
		}
	}

	async function loadFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		decoding = true;
		sourceError = '';
		let context: AudioContext | null = null;
		try {
			context = new AudioContext();
			const decoded = await context.decodeAudioData(await file.arrayBuffer());
			if (decoded.duration > MAX_RECORDING_SECONDS + 0.05) {
				throw new Error(`Choose audio no longer than ${MAX_RECORDING_SECONDS} seconds.`);
			}
			const mono = new Float32Array(decoded.length);
			for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
				const values = decoded.getChannelData(channel);
				for (let index = 0; index < values.length; index++) {
					mono[index] += values[index] / decoded.numberOfChannels;
				}
			}
			const samples = resampleMono(mono, decoded.sampleRate);
			setSource(samples, createWavBlob(samples), samples.length / SPEECH_SAMPLE_RATE, file.name);
		} catch (error) {
			sourceError = `Could not use that audio: ${errorMessage(error)}`;
		} finally {
			if (context && context.state !== 'closed') await context.close().catch(() => {});
			decoding = false;
		}
	}

	function getWhisperWorker(engineId: 'tiny' | 'base'): Worker {
		let worker = whisperWorkers[engineId];
		if (worker) return worker;
		worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
		whisperWorkers[engineId] = worker;
		worker.onmessage = (event: MessageEvent<WhisperResponse>) => {
			const message = event.data;
			if (activeRequests[engineId] !== message.id) return;
			if (message.type === 'status') {
				engines[engineId].phase = message.phase;
				engines[engineId].progress = message.progress;
				engines[engineId].message = message.message;
				return;
			}
			if (message.type === 'error') {
				engines[engineId].phase = 'error';
				engines[engineId].progress = null;
				engines[engineId].message = message.message;
				settleWhisper(engineId, message.id);
				return;
			}
			engines[engineId].phase = 'ready';
			engines[engineId].progress = 100;
			engines[engineId].message = message.warm
				? 'Complete. The model stayed loaded in this worker.'
				: 'Complete. Model files are now cached by the browser.';
			engines[engineId].transcript = message.transcript;
			engines[engineId].metrics = {
				loadMs: message.loadMs,
				inferenceMs: message.inferenceMs,
				durationSeconds: source?.durationSeconds ?? null,
				warm: message.warm
			};
			settleWhisper(engineId, message.id);
		};
		worker.onerror = (event) => {
			engines[engineId].phase = 'error';
			engines[engineId].progress = null;
			engines[engineId].message = event.message || 'The Whisper worker failed to start.';
			settleWhisper(engineId);
		};
		return worker;
	}

	function settleWhisper(engineId: 'tiny' | 'base', id?: string): void {
		const waiter = whisperWaiters[engineId];
		if (!waiter || (id && waiter.id !== id)) return;
		delete whisperWaiters[engineId];
		waiter.resolve();
	}

	function runWhisper(engineId: 'tiny' | 'base'): Promise<void> {
		if (!source) {
			sourceError = 'Record or upload one sample first.';
			return Promise.resolve();
		}
		settleWhisper(engineId);
		const id = requestId();
		activeRequests[engineId] = id;
		engines[engineId].phase = 'loading';
		engines[engineId].progress = 0;
		engines[engineId].message = 'Starting the isolated Whisper worker…';
		const samples = source.samples.slice();
		getWhisperWorker(engineId).postMessage(
			{ type: 'transcribe', id, model: engineId, language, samples },
			[samples.buffer]
		);
		return new Promise((resolve) => {
			whisperWaiters[engineId] = { id, resolve };
		});
	}

	function cancelWhisper(engineId: 'tiny' | 'base'): void {
		settleWhisper(engineId);
		activeRequests[engineId] = requestId();
		whisperWorkers[engineId]?.terminate();
		delete whisperWorkers[engineId];
		engines[engineId].phase = 'idle';
		engines[engineId].progress = null;
		engines[engineId].message = 'Cancelled. Run again to create a fresh worker.';
	}

	async function ensureVosk(): Promise<{ model: VoskModel; loadMs: number; warm: boolean }> {
		if (voskModel) return { model: voskModel, loadMs: 0, warm: true };
		const startedAt = performance.now();
		if (!voskLoading) {
			voskLoading = import('vosk-browser')
				.then(({ createModel }) => createModel(VOSK_MODEL_URL, -1))
				.then((model) => {
					voskModel = model;
					return model;
				})
				.catch((error) => {
					voskLoading = null;
					throw error;
				});
		}
		const model = await voskLoading;
		return { model, loadMs: performance.now() - startedAt, warm: false };
	}

	function transcribeVosk(model: VoskModel, samples: Float32Array): Promise<string> {
		return new Promise((resolve, reject) => {
			const recognizer = new model.KaldiRecognizer(SPEECH_SAMPLE_RATE);
			const pieces: string[] = [];
			let quietTimer: ReturnType<typeof setTimeout> | null = null;
			let settled = false;
			const hardTimer = setTimeout(
				() => finish(new Error('Vosk timed out on this recording.')),
				120_000
			);

			function finish(error?: Error): void {
				if (settled) return;
				settled = true;
				clearTimeout(hardTimer);
				if (quietTimer) clearTimeout(quietTimer);
				recognizer.remove();
				if (error) reject(error);
				else
					resolve(pieces.filter((piece, index) => piece && piece !== pieces[index - 1]).join(' '));
			}

			recognizer.on('result', (message: VoskRecognizerMessage) => {
				if (message.event !== 'result') return;
				const text = message.result.text.trim();
				if (text) pieces.push(text);
				if (quietTimer) clearTimeout(quietTimer);
				quietTimer = setTimeout(() => finish(), 600);
			});
			recognizer.on('error', (message: VoskRecognizerMessage) => {
				if (message.event === 'error')
					finish(new Error(message.error || 'Vosk recognition failed.'));
			});

			const chunkSize = SPEECH_SAMPLE_RATE;
			for (let offset = 0; offset < samples.length; offset += chunkSize) {
				recognizer.acceptWaveformFloat(
					samples.slice(offset, offset + chunkSize),
					SPEECH_SAMPLE_RATE
				);
			}
			recognizer.retrieveFinalResult();
		});
	}

	async function runVosk(): Promise<void> {
		if (!source) {
			sourceError = 'Record or upload one sample first.';
			return;
		}
		const input = source;
		const run = ++voskRun;
		const id = requestId();
		activeRequests.vosk = id;
		engines.vosk.phase = 'loading';
		engines.vosk.progress = null;
		engines.vosk.message = `Downloading and unpacking the ${languageName} Vosk model…`;
		try {
			const loaded = await ensureVosk();
			if (run !== voskRun || activeRequests.vosk !== id) return;
			engines.vosk.phase = 'transcribing';
			engines.vosk.message = 'Transcribing locally with Kaldi/Vosk…';
			const startedAt = performance.now();
			const transcript = await transcribeVosk(loaded.model, input.samples);
			if (run !== voskRun || activeRequests.vosk !== id) return;
			engines.vosk.phase = 'ready';
			engines.vosk.progress = 100;
			engines.vosk.message = loaded.warm
				? 'Complete. The unpacked model stayed in memory.'
				: 'Complete. This archive is cached by the browser.';
			engines.vosk.transcript = transcript;
			engines.vosk.metrics = {
				loadMs: loaded.loadMs,
				inferenceMs: performance.now() - startedAt,
				durationSeconds: input.durationSeconds,
				warm: loaded.warm
			};
		} catch (error) {
			if (run !== voskRun || activeRequests.vosk !== id) return;
			engines.vosk.phase = 'error';
			engines.vosk.progress = null;
			engines.vosk.message = errorMessage(error);
		}
	}

	function cancelVosk(): void {
		voskRun++;
		activeRequests.vosk = requestId();
		voskModel?.terminate();
		voskModel = null;
		voskLoading = null;
		engines.vosk.phase = 'idle';
		engines.vosk.progress = null;
		engines.vosk.message = 'Cancelled. The in-memory Vosk model was released.';
	}

	function startNative(): void {
		const Constructor = browserRecognitionConstructor();
		if (!Constructor) {
			engines.native.phase = 'error';
			engines.native.message = 'SpeechRecognition is not available in this browser.';
			return;
		}
		nativeRecognition?.abort();
		const recognition = new Constructor();
		nativeRecognition = recognition;
		const id = requestId();
		activeRequests.native = id;
		let finalText = '';
		recognition.lang = localeCode;
		recognition.continuous = false;
		recognition.interimResults = true;
		recognition.maxAlternatives = 1;
		recognition.onstart = () => {
			nativeStartedAt = performance.now();
			engines.native.phase = 'transcribing';
			engines.native.message = 'Listening live… speak the reference sentence now.';
			engines.native.transcript = '';
		};
		recognition.onresult = (event) => {
			let interim = '';
			for (let index = event.resultIndex; index < event.results.length; index++) {
				const result = event.results[index];
				if (result.isFinal) finalText += `${result[0].transcript} `;
				else interim += result[0].transcript;
			}
			engines.native.transcript = `${finalText}${interim}`.trim();
		};
		recognition.onerror = (event) => {
			if (activeRequests.native !== id || event.error === 'aborted') return;
			engines.native.phase = 'error';
			engines.native.message = `Browser recognition failed: ${event.error}.`;
		};
		recognition.onend = () => {
			if (activeRequests.native !== id || engines.native.phase === 'error') return;
			engines.native.phase = 'ready';
			engines.native.message =
				'Live recognition complete. This did not use the shared audio sample.';
			engines.native.metrics = {
				loadMs: 0,
				inferenceMs: performance.now() - nativeStartedAt,
				durationSeconds: null,
				warm: true
			};
			nativeRecognition = null;
		};
		engines.native.phase = 'loading';
		engines.native.message = 'Requesting live microphone recognition…';
		try {
			recognition.start();
		} catch (error) {
			engines.native.phase = 'error';
			engines.native.message = errorMessage(error);
		}
	}

	function stopNative(): void {
		nativeRecognition?.stop();
	}

	async function runAllLocal(): Promise<void> {
		if (!source) {
			sourceError = 'Record or upload one sample first.';
			return;
		}
		runningBatch = true;
		try {
			// Avoid loading and executing three sizeable WASM engines at once on ordinary devices.
			await runWhisper('tiny');
			await runWhisper('base');
			await runVosk();
		} finally {
			runningBatch = false;
		}
	}

	function inferenceFactor(engineId: EngineId): string {
		const metrics = engines[engineId].metrics;
		if (!metrics?.durationSeconds) return '—';
		return `${(metrics.inferenceMs / 1000 / metrics.durationSeconds).toFixed(2)}×`;
	}

	function exportResults(): void {
		const payload = {
			exportedAt: new Date().toISOString(),
			language,
			referenceText,
			normalizedReference: normalizeTranscript(referenceText),
			audio: source
				? {
						label: source.label,
						durationSeconds: source.durationSeconds,
						sampleRate: SPEECH_SAMPLE_RATE
					}
				: null,
			runtime: {
				userAgent: navigator.userAgent,
				crossOriginIsolated: isolated,
				nativeSpeechRecognition: nativeAvailable
			},
			engines: Object.fromEntries(
				(Object.keys(engines) as EngineId[]).map((engineId) => [
					engineId,
					{
						...engines[engineId],
						wer: errorRate(engines[engineId].transcript, 'word'),
						cer: errorRate(engines[engineId].transcript, 'character'),
						rating: ratings[engineId]
					}
				])
			)
		};
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${isEnglish ? 'english' : 'persian'}-stt-lab-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(url);
		exportMessage = 'Results exported.';
	}
</script>

<svelte:head>
	<title>{languageName} STT Lab</title>
	<meta
		name="description"
		content={`An isolated browser lab for evaluating ${languageName} speech recognition engines.`}
	/>
</svelte:head>

<main class="lab-shell">
	<header class="hero">
		<div>
			<p class="eyebrow">Isolated experiment · {isEnglish ? '/en/stt-lab' : '/stt-lab'}</p>
			<h1>{languageName} speech-to-text lab</h1>
			<p class="hero-copy">
				Record once, then compare local Whisper WASM and Vosk transcripts against the same audio.
				The models run in your browser; no transcription API key is required. Nothing here is
				connected to the app’s production STT flow.
			</p>
		</div>
		<div class="runtime-badge" class:isolated>
			<span class="status-dot"></span>
			<div>
				<strong>{isolated ? 'Threaded WASM available' : 'Single-thread WASM'}</strong>
				<small>{isolated ? 'crossOriginIsolated is enabled' : 'No COOP/COEP required'}</small>
			</div>
		</div>
	</header>

	<section class="research-panel" aria-labelledby="shortlist-heading">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Research shortlist</p>
				<h2 id="shortlist-heading">Four materially different paths</h2>
			</div>
			<p>Models load only when their Run button is pressed and remain confined to this route.</p>
		</div>
		<div class="comparison-table">
			<div class="comparison-row comparison-head">
				<span>Option</span><span>Why test it</span><span>Important constraint</span>
			</div>
			<div class="comparison-row">
				<strong>Whisper Tiny · q8</strong><span
					>{isEnglish
						? 'Fast English-only WASM baseline; 39M parameters.'
						: 'Fast multilingual WASM baseline; 39M parameters.'}</span
				><span
					>{isEnglish
						? 'Lower accuracy ceiling than Base.'
						: 'Lower Persian accuracy ceiling.'}</span
				>
			</div>
			<div class="comparison-row">
				<strong>Whisper Base · q8</strong><span
					>Best likely balance for this app; 74M parameters.</span
				><span>Larger download and slower decode.</span>
			</div>
			<div class="comparison-row">
				<strong>Vosk {languageName}</strong><span
					>Streaming-friendly, small and purpose-built for {languageName}.</span
				><span
					>{isEnglish
						? 'The small US-English model trades accuracy for speed.'
						: 'The browser-ready archive is older model 0.4.'}</span
				>
			</div>
			<div class="comparison-row">
				<strong>Browser API</strong><span>Zero model download and a useful product baseline.</span
				><span>Live-only, inconsistent, and may send audio to a service.</span>
			</div>
		</div>
		<p class="scope-note">
			{#if isEnglish}
				This route uses English-only Whisper checkpoints instead of the multilingual builds, plus
				Vosk's official 40 MB small US-English model in the browser-ready archive format. The Web
				Speech control requests en-US; Chrome may still use a remote recognition service.
			{:else}
				Whisper Tiny and Base use their multilingual checkpoints locally through Transformers.js,
				with transcription language forced to Persian (<code>fa</code>). Sherpa-ONNX was researched
				but not wired in: it has a solid WASM runtime, but no maintained, ready-to-run Persian
				browser model bundle. A Persian fine-tuned Whisper Small export was also excluded because
				its repository is nearly 10 GB across artifacts—poor fit for a first browser test. Vosk's
				catalog has a newer 53 MB Persian 0.42 model, but its official ZIP is not in the tar.gz
				layout expected by vosk-browser; if Vosk wins, the next step is repackaging 0.42 rather than
				shipping the older demo archive used here.
			{/if}
		</p>
		<nav class="source-links" aria-label="Primary research sources">
			<a
				href="https://huggingface.co/docs/transformers.js/pipelines"
				target="_blank"
				rel="noreferrer">Transformers.js ASR docs ↗</a
			>
			<a
				href="https://github.com/openai/whisper/blob/main/model-card.md"
				target="_blank"
				rel="noreferrer">Whisper model card ↗</a
			>
			<a href="https://alphacephei.com/vosk/models" target="_blank" rel="noreferrer"
				>Vosk model catalog ↗</a
			>
			<a href="https://github.com/ccoreilly/vosk-browser" target="_blank" rel="noreferrer"
				>Vosk browser runtime ↗</a
			>
			<a
				href="https://k2-fsa.github.io/sherpa/onnx/wasm/build.html"
				target="_blank"
				rel="noreferrer">Sherpa-ONNX WASM ↗</a
			>
		</nav>
	</section>

	<section class="capture-panel" aria-labelledby="capture-heading">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Shared input</p>
				<h2 id="capture-heading">One recording, comparable results</h2>
			</div>
			<button
				class="run-all"
				onclick={() => void runAllLocal()}
				disabled={!hasAudio ||
					anyWorking ||
					runningBatch ||
					recording ||
					startingRecording ||
					finishingRecording ||
					decoding}
			>
				{runningBatch ? 'Running sequentially…' : 'Run all local engines'}
			</button>
		</div>
		<p class="microphone-hint">
			Want to test just one engine? Use its <strong>Speak &amp; transcribe</strong> button below.
		</p>

		<label class="field-label" for="reference">Reference transcript for CER/WER</label>
		<textarea
			id="reference"
			bind:value={referenceText}
			dir={textDirection}
			lang={localeCode}
			rows="3"></textarea>
		<div class="presets" aria-label="Reference sentence presets">
			{#each SAMPLE_TEXTS as preset, index (preset)}
				<button class:active={referenceText === preset} onclick={() => (referenceText = preset)}>
					Sample {index + 1}
				</button>
			{/each}
		</div>

		<div class="capture-controls">
			<div class="record-block">
				{#if recording}
					<button class="record stop" onclick={() => void finishRecording()}>
						<span></span>
						{recordingTarget ? 'Stop & transcribe' : 'Stop'} · {recordingSeconds.toFixed(1)}s
					</button>
					<div class="level-track" aria-label="Microphone level">
						<div style={`width: ${Math.max(3, recordingLevel * 100)}%`}></div>
					</div>
				{:else}
					<button
						class="record"
						onclick={() => void startRecording()}
						disabled={decoding || anyWorking || startingRecording || finishingRecording}
					>
						<span></span>
						{startingRecording ? 'Requesting microphone…' : `Record ${languageName}`}
					</button>
				{/if}
				<small>Maximum {MAX_RECORDING_SECONDS} seconds · captured as 16 kHz mono</small>
			</div>
			<span class="or">or</span>
			<label
				class="upload"
				class:disabled={recording ||
					startingRecording ||
					finishingRecording ||
					decoding ||
					anyWorking}
			>
				<input
					type="file"
					accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac"
					onchange={(event) => void loadFile(event)}
					disabled={recording || startingRecording || finishingRecording || decoding || anyWorking}
				/>
				{decoding ? 'Decoding…' : 'Upload audio'}
			</label>
		</div>

		{#if sourceError}<p class="alert error">{sourceError}</p>{/if}
		{#if source}
			<div class="audio-source">
				<div>
					<strong>{source.label}</strong>
					<small>{source.durationSeconds.toFixed(2)}s · 16 kHz mono WAV</small>
				</div>
				<audio controls src={source.url}></audio>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={source.url} download="stt-lab-sample.wav">Download</a>
			</div>
		{/if}
	</section>

	<section class="engine-grid" aria-label="Speech recognition engines">
		{#each ENGINE_CARDS as card (card.id)}
			<article
				class="engine-card"
				class:working={engines[card.id].phase === 'loading' ||
					engines[card.id].phase === 'transcribing'}
			>
				<div class="card-top">
					<span class="card-index">{card.index}</span>
					<span class="engine-badge">{card.badge}</span>
				</div>
				<h3>{card.title}</h3>
				<p class="engine-detail">{card.detail}</p>
				<div class="engine-status" class:error={engines[card.id].phase === 'error'}>
					<span class={`phase-dot ${engines[card.id].phase}`}></span>
					{engines[card.id].message}
				</div>
				{#if engines[card.id].progress !== null && engines[card.id].phase === 'loading'}
					<div class="progress-track">
						<div style={`width: ${engines[card.id].progress}%`}></div>
					</div>
				{/if}
				<div class="actions">
					<button
						class="primary"
						onclick={card.action}
						disabled={!hasAudio ||
							recording ||
							startingRecording ||
							finishingRecording ||
							anyWorking ||
							engines[card.id].phase === 'loading' ||
							engines[card.id].phase === 'transcribing'}
					>
						{engines[card.id].metrics ? 'Run again' : 'Run transcription'}
					</button>
					<button
						class="speak"
						class:recording={recording && recordingTarget === card.id}
						onclick={() =>
							recording && recordingTarget === card.id
								? void finishRecording()
								: void startRecording(card.id)}
						disabled={startingRecording ||
							finishingRecording ||
							anyWorking ||
							decoding ||
							(recording && recordingTarget !== card.id)}
					>
						<span aria-hidden="true">{recording && recordingTarget === card.id ? '■' : '🎙'}</span>
						{startingRecording && recordingTarget === card.id
							? 'Requesting microphone…'
							: finishingRecording && recordingTarget === card.id
								? 'Preparing audio…'
								: recording && recordingTarget === card.id
									? `Stop & transcribe · ${recordingSeconds.toFixed(1)}s`
									: 'Speak & transcribe'}
					</button>
					{#if engines[card.id].phase === 'loading' || engines[card.id].phase === 'transcribing'}
						<button class="secondary" onclick={card.cancel}>Cancel</button>
					{/if}
				</div>

				<label class="field-label" for={`${card.id}-transcript`}>Transcript</label>
				<textarea
					id={`${card.id}-transcript`}
					class="transcript"
					value={engines[card.id].transcript}
					dir={textDirection}
					lang={localeCode}
					rows="4"
					readonly
					placeholder={`The ${languageName} transcript will appear here.`}></textarea>

				<div class="metrics">
					<div>
						<span>WER</span><strong
							>{formatRate(errorRate(engines[card.id].transcript, 'word'))}</strong
						>
					</div>
					<div>
						<span>CER</span><strong
							>{formatRate(errorRate(engines[card.id].transcript, 'character'))}</strong
						>
					</div>
					<div>
						<span>Inference</span><strong
							>{engines[card.id].metrics
								? `${(engines[card.id].metrics!.inferenceMs / 1000).toFixed(2)}s`
								: '—'}</strong
						>
					</div>
					<div><span>Real-time factor</span><strong>{inferenceFactor(card.id)}</strong></div>
					<div>
						<span>Model load</span><strong
							>{engines[card.id].metrics
								? engines[card.id].metrics!.warm
									? 'warm'
									: `${(engines[card.id].metrics!.loadMs / 1000).toFixed(1)}s`
								: '—'}</strong
						>
					</div>
				</div>

				<div class="rating-block">
					<label>
						<span>Perceived accuracy</span>
						<select bind:value={ratings[card.id].accuracy}>
							<option value={0}>Not rated</option>
							{#each SCORE_VALUES as score (score)}<option value={score}>{score} / 5</option>{/each}
						</select>
					</label>
					<label>
						<span>Product usability</span>
						<select bind:value={ratings[card.id].usability}>
							<option value={0}>Not rated</option>
							{#each SCORE_VALUES as score (score)}<option value={score}>{score} / 5</option>{/each}
						</select>
					</label>
					<textarea
						bind:value={ratings[card.id].notes}
						rows="2"
						placeholder="Notes: names, punctuation, latency, device heat…"></textarea>
				</div>
			</article>
		{/each}

		<article class="engine-card native-card">
			<div class="card-top">
				<span class="card-index">04</span><span class="engine-badge">Browser control</span>
			</div>
			<h3>Web Speech API</h3>
			<p class="engine-detail">
				{localeCode} · zero explicit model download · implementation and privacy vary by browser
			</p>
			<div class="not-comparable">
				Live microphone only — it cannot consume the shared recorded sample.
			</div>
			<div class="engine-status" class:error={engines.native.phase === 'error'}>
				<span class={`phase-dot ${engines.native.phase}`}></span>{engines.native.message}
			</div>
			<div class="actions">
				<button
					class="primary speak-native"
					onclick={startNative}
					disabled={!nativeAvailable ||
						recording ||
						startingRecording ||
						finishingRecording ||
						anyWorking ||
						engines.native.phase === 'transcribing'}
				>
					🎙 Start live microphone
				</button>
				{#if engines.native.phase === 'transcribing'}<button class="secondary" onclick={stopNative}
						>Stop</button
					>{/if}
			</div>
			<label class="field-label" for="native-transcript">Transcript</label>
			<textarea
				id="native-transcript"
				class="transcript"
				value={engines.native.transcript}
				dir={textDirection}
				lang={localeCode}
				rows="4"
				readonly></textarea>
			<div class="metrics">
				<div>
					<span>WER</span><strong>{formatRate(errorRate(engines.native.transcript, 'word'))}</strong
					>
				</div>
				<div>
					<span>CER</span><strong
						>{formatRate(errorRate(engines.native.transcript, 'character'))}</strong
					>
				</div>
				<div>
					<span>Elapsed</span><strong
						>{engines.native.metrics
							? `${(engines.native.metrics.inferenceMs / 1000).toFixed(2)}s`
							: '—'}</strong
					>
				</div>
				<div><span>Same audio?</span><strong>No</strong></div>
			</div>
			<div class="rating-block">
				<label
					><span>Perceived accuracy</span><select bind:value={ratings.native.accuracy}
						><option value={0}>Not rated</option>{#each SCORE_VALUES as score (score)}<option
								value={score}>{score} / 5</option
							>{/each}</select
					></label
				>
				<label
					><span>Product usability</span><select bind:value={ratings.native.usability}
						><option value={0}>Not rated</option>{#each SCORE_VALUES as score (score)}<option
								value={score}>{score} / 5</option
							>{/each}</select
					></label
				>
				<textarea
					bind:value={ratings.native.notes}
					rows="2"
					placeholder="Notes: browser, permission flow, recognition quality…"></textarea>
			</div>
		</article>
	</section>

	<footer class="lab-footer">
		<div>
			<strong>Evaluation note</strong>
			<p>
				{isEnglish
					? 'WER/CER normalize case, punctuation and whitespace.'
					: 'WER/CER normalize Arabic/Persian glyph variants, digits, punctuation, whitespace and ZWNJ.'}
				Lower is better; error rates can exceed 100% when a model inserts many tokens.
			</p>
		</div>
		<div class="export-area">
			{#if exportMessage}<span>{exportMessage}</span>{/if}
			<button onclick={exportResults}>Export JSON</button>
		</div>
	</footer>
</main>

<style>
	:global(body.stt-lab-route) {
		margin: 0;
		background: #f2f4f8;
		color: #162138;
	}
	:global(body.stt-lab-route *) {
		box-sizing: border-box;
	}
	:global(body.stt-lab-route button),
	:global(body.stt-lab-route textarea),
	:global(body.stt-lab-route select) {
		font: inherit;
	}
	.lab-shell {
		--ink: #162138;
		--muted: #687187;
		--blue: #3157d5;
		--violet: #7655d8;
		--line: #dce1eb;
		max-width: 1440px;
		margin: 0 auto;
		padding: 54px 32px 70px;
		font-family: Inter, system-ui, sans-serif;
	}
	.hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 36px;
		margin-bottom: 28px;
	}
	.eyebrow {
		margin: 0 0 10px;
		color: var(--blue);
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		font-size: clamp(2.4rem, 5vw, 4.7rem);
		line-height: 0.98;
		letter-spacing: -0.055em;
	}
	.hero-copy {
		max-width: 760px;
		margin: 20px 0 0;
		color: var(--muted);
		font-size: 1.04rem;
		line-height: 1.7;
	}
	.runtime-badge {
		display: flex;
		gap: 12px;
		align-items: center;
		min-width: 220px;
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: #fff;
		box-shadow: 0 6px 24px #26375e0b;
	}
	.runtime-badge strong,
	.runtime-badge small {
		display: block;
	}
	.runtime-badge strong {
		font-size: 0.83rem;
	}
	.runtime-badge small {
		margin-top: 3px;
		color: var(--muted);
		font-size: 0.72rem;
	}
	.status-dot {
		width: 10px;
		height: 10px;
		flex: 0 0 auto;
		border-radius: 50%;
		background: #eaa82f;
		box-shadow: 0 0 0 5px #eaa82f1c;
	}
	.runtime-badge.isolated .status-dot {
		background: #20a56c;
		box-shadow: 0 0 0 5px #20a56c1c;
	}
	.research-panel,
	.capture-panel {
		margin-bottom: 24px;
		padding: 26px;
		border: 1px solid var(--line);
		border-radius: 20px;
		background: #fff;
		box-shadow: 0 12px 40px #26375e0a;
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		align-items: flex-start;
		margin-bottom: 20px;
	}
	.section-heading h2 {
		margin: 0;
		font-size: 1.35rem;
		letter-spacing: -0.025em;
	}
	.section-heading > p {
		max-width: 510px;
		margin: 0;
		color: var(--muted);
		font-size: 0.88rem;
		line-height: 1.6;
		text-align: right;
	}
	.comparison-table {
		border: 1px solid var(--line);
		border-radius: 13px;
		overflow: hidden;
	}
	.comparison-row {
		display: grid;
		grid-template-columns: 0.8fr 1.25fr 1.05fr;
		gap: 22px;
		padding: 14px 16px;
		border-top: 1px solid var(--line);
		align-items: center;
		font-size: 0.84rem;
		line-height: 1.45;
	}
	.comparison-row:first-child {
		border-top: 0;
	}
	.comparison-row span {
		color: var(--muted);
	}
	.comparison-head {
		background: #f7f8fb;
		font-size: 0.69rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.scope-note {
		margin: 16px 2px 0;
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.6;
	}
	.source-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 15px;
		margin-top: 13px;
	}
	.source-links a {
		color: var(--blue);
		font-size: 0.7rem;
		font-weight: 700;
		text-decoration: none;
	}
	.source-links a:hover {
		text-decoration: underline;
	}
	.field-label {
		display: block;
		margin: 0 0 7px;
		color: #424d64;
		font-size: 0.76rem;
		font-weight: 750;
	}
	.microphone-hint {
		margin: -5px 0 18px;
		padding: 10px 12px;
		border-left: 3px solid var(--blue);
		background: #f4f6ff;
		color: #53617d;
		font-size: 0.78rem;
	}
	textarea {
		width: 100%;
		resize: vertical;
		border: 1px solid #ccd3e0;
		border-radius: 11px;
		padding: 12px 14px;
		background: #fbfcfe;
		color: var(--ink);
		outline: none;
		line-height: 1.65;
	}
	textarea:focus,
	select:focus {
		border-color: var(--blue);
		box-shadow: 0 0 0 3px #3157d514;
	}
	#reference {
		min-height: 86px;
		font-family: 'Noto Sans Arabic', Tahoma, sans-serif;
		font-size: 1.14rem;
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
		margin-top: 10px;
	}
	.presets button {
		padding: 6px 10px;
		border: 1px solid var(--line);
		border-radius: 99px;
		background: white;
		color: var(--muted);
		cursor: pointer;
		font-size: 0.73rem;
	}
	.presets button.active {
		border-color: #3157d560;
		background: #3157d50d;
		color: var(--blue);
	}
	.capture-controls {
		display: flex;
		align-items: center;
		gap: 18px;
		margin-top: 22px;
	}
	.record-block {
		display: grid;
		gap: 7px;
		min-width: 265px;
	}
	.record-block small {
		color: var(--muted);
		font-size: 0.7rem;
	}
	.record,
	.upload,
	.run-all,
	.primary,
	.secondary,
	.speak,
	.export-area button {
		border: 0;
		border-radius: 10px;
		cursor: pointer;
		font-weight: 750;
		transition:
			transform 0.15s,
			opacity 0.15s,
			background 0.15s;
	}
	.record {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		padding: 12px 18px;
		background: #18233c;
		color: white;
	}
	.record span {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #ff4d66;
	}
	.record.stop {
		background: #cc3f54;
	}
	.record.stop span {
		border-radius: 2px;
		background: white;
	}
	.level-track,
	.progress-track {
		height: 4px;
		overflow: hidden;
		border-radius: 99px;
		background: #e6e9f0;
	}
	.level-track div,
	.progress-track div {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--blue), #7c58df);
		transition: width 0.12s;
	}
	.or {
		color: #9da4b3;
		font-size: 0.74rem;
		text-transform: uppercase;
	}
	.upload {
		position: relative;
		overflow: hidden;
		padding: 12px 18px;
		border: 1px solid #cbd2df;
		background: #fff;
		color: #35415a;
	}
	.upload input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.disabled,
	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.run-all {
		padding: 11px 16px;
		background: var(--blue);
		color: white;
	}
	.alert {
		padding: 10px 12px;
		border-radius: 9px;
		font-size: 0.8rem;
	}
	.alert.error {
		background: #fff0f2;
		color: #a42d42;
	}
	.audio-source {
		display: grid;
		grid-template-columns: minmax(160px, 0.7fr) minmax(240px, 1.3fr) auto;
		gap: 18px;
		align-items: center;
		margin-top: 20px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: #f8f9fc;
	}
	.audio-source strong,
	.audio-source small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.audio-source small {
		margin-top: 4px;
		color: var(--muted);
		font-size: 0.72rem;
	}
	.audio-source audio {
		width: 100%;
		height: 35px;
	}
	.audio-source a {
		color: var(--blue);
		font-size: 0.76rem;
		font-weight: 700;
		text-decoration: none;
	}
	.engine-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	.engine-card {
		position: relative;
		min-width: 0;
		padding: 25px;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 20px;
		background: #fff;
		box-shadow: 0 12px 40px #26375e0a;
	}
	.engine-card::before {
		position: absolute;
		inset: 0 auto auto 0;
		width: 100%;
		height: 3px;
		background: linear-gradient(90deg, var(--blue), var(--violet));
		content: '';
		opacity: 0;
	}
	.engine-card.working::before {
		opacity: 1;
		animation: pulse 1.2s ease-in-out infinite alternate;
	}
	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.card-index {
		color: #b1b7c4;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.1em;
	}
	.engine-badge {
		padding: 5px 9px;
		border-radius: 99px;
		background: #eef1fb;
		color: #4b5f9f;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.engine-card h3 {
		margin: 18px 0 5px;
		font-size: 1.55rem;
		letter-spacing: -0.035em;
	}
	.engine-detail {
		min-height: 42px;
		margin: 0 0 17px;
		color: var(--muted);
		font-size: 0.76rem;
		line-height: 1.55;
	}
	.engine-status {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		min-height: 43px;
		padding: 10px 11px;
		border-radius: 9px;
		background: #f7f8fb;
		color: #596277;
		font-size: 0.74rem;
		line-height: 1.45;
	}
	.engine-status.error {
		background: #fff0f2;
		color: #a42d42;
	}
	.phase-dot {
		width: 7px;
		height: 7px;
		flex: 0 0 auto;
		margin-top: 4px;
		border-radius: 50%;
		background: #9fa7b7;
	}
	.phase-dot.loading,
	.phase-dot.transcribing {
		background: #3157d5;
		box-shadow: 0 0 0 4px #3157d514;
	}
	.phase-dot.ready {
		background: #20a56c;
	}
	.phase-dot.error {
		background: #dc3f58;
	}
	.progress-track {
		margin-top: 8px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		min-height: 38px;
		margin: 14px 0 18px;
	}
	.primary,
	.secondary,
	.speak {
		padding: 10px 14px;
	}
	.primary {
		background: #192540;
		color: white;
	}
	.secondary {
		border: 1px solid #d6dbe5;
		background: white;
		color: #596277;
	}
	.speak {
		border: 1px solid #3157d545;
		background: #f2f5ff;
		color: #294cb8;
	}
	.speak.recording {
		border-color: #cc3f54;
		background: #cc3f54;
		color: white;
	}
	.transcript {
		min-height: 105px;
		font-family: 'Noto Sans Arabic', Tahoma, sans-serif;
		font-size: 1rem;
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 1px;
		margin: 16px 0;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--line);
	}
	.metrics div {
		min-width: 0;
		padding: 10px 7px;
		background: #fafbfc;
		text-align: center;
	}
	.metrics span,
	.metrics strong {
		display: block;
	}
	.metrics span {
		overflow: hidden;
		color: var(--muted);
		font-size: 0.61rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.metrics strong {
		margin-top: 4px;
		font-size: 0.79rem;
	}
	.rating-block {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 9px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	.rating-block label span {
		display: block;
		margin-bottom: 5px;
		color: var(--muted);
		font-size: 0.68rem;
	}
	.rating-block select {
		width: 100%;
		padding: 8px 9px;
		border: 1px solid #d5dae4;
		border-radius: 8px;
		background: white;
		outline: none;
		font-size: 0.75rem;
	}
	.rating-block textarea {
		grid-column: 1 / -1;
		font-size: 0.75rem;
	}
	.not-comparable {
		margin: -4px 0 14px;
		padding: 8px 10px;
		border-left: 3px solid #e1a329;
		background: #fff9eb;
		color: #80601e;
		font-size: 0.7rem;
	}
	.lab-footer {
		display: flex;
		justify-content: space-between;
		gap: 28px;
		align-items: center;
		margin-top: 24px;
		padding: 22px 25px;
		border-radius: 18px;
		background: #17223b;
		color: white;
	}
	.lab-footer strong {
		font-size: 0.85rem;
	}
	.lab-footer p {
		max-width: 850px;
		margin: 5px 0 0;
		color: #b7c0d2;
		font-size: 0.73rem;
		line-height: 1.55;
	}
	.export-area {
		display: flex;
		flex: 0 0 auto;
		gap: 11px;
		align-items: center;
	}
	.export-area span {
		color: #a8dfca;
		font-size: 0.72rem;
	}
	.export-area button {
		padding: 10px 14px;
		background: white;
		color: #17223b;
	}
	button:not(:disabled):hover,
	.upload:not(.disabled):hover {
		transform: translateY(-1px);
	}
	@keyframes pulse {
		from {
			opacity: 0.35;
		}
		to {
			opacity: 1;
		}
	}
	@media (max-width: 880px) {
		.lab-shell {
			padding: 34px 18px 50px;
		}
		.hero,
		.section-heading,
		.lab-footer {
			align-items: stretch;
			flex-direction: column;
		}
		.runtime-badge {
			width: fit-content;
		}
		.section-heading > p {
			text-align: left;
		}
		.comparison-row {
			grid-template-columns: 1fr;
			gap: 4px;
		}
		.comparison-head {
			display: none;
		}
		.engine-grid {
			grid-template-columns: 1fr;
		}
		.audio-source {
			grid-template-columns: 1fr;
		}
		.capture-controls {
			align-items: stretch;
			flex-direction: column;
		}
		.or {
			text-align: center;
		}
		.upload {
			text-align: center;
		}
	}
	@media (max-width: 520px) {
		.research-panel,
		.capture-panel,
		.engine-card {
			padding: 19px;
			border-radius: 15px;
		}
		.metrics {
			grid-template-columns: repeat(3, 1fr);
		}
		.rating-block {
			grid-template-columns: 1fr;
		}
		.rating-block textarea {
			grid-column: auto;
		}
	}
</style>
