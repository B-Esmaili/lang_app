<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';

	type LabLanguage = 'fa' | 'en';
	type EngineId = 'mms' | 'piper' | 'native';
	type EnginePhase = 'idle' | 'loading' | 'generating' | 'ready' | 'error';
	type PiperVoiceId = 'mana' | 'amir' | 'gyro' | 'lessac' | 'amy' | 'sam';

	let { language = 'fa' } = $props<{ language?: LabLanguage }>();
	const isEnglish = $derived(language === 'en');
	const languageName = $derived(isEnglish ? 'English' : 'Persian');
	const localeCode = $derived(isEnglish ? 'en-US' : 'fa-IR');

	type Metrics = {
		loadMs: number;
		generationMs: number;
		durationSeconds: number;
		sampleRate: number | null;
		bytes: number | null;
		cached: boolean | null;
	};

	type EngineState = {
		phase: EnginePhase;
		message: string;
		progress: number | null;
		audioUrl: string | null;
		metrics: Metrics | null;
	};

	type Rating = {
		pronunciation: number;
		naturalness: number;
		notes: string;
	};

	type WorkerResponse =
		| {
				type: 'status';
				id: string;
				phase: Exclude<EnginePhase, 'idle' | 'error'>;
				progress: number | null;
				message: string;
		  }
		| {
				type: 'result';
				id: string;
				blob: Blob;
				loadMs: number;
				generationMs: number;
				durationSeconds: number;
				sampleRate: number;
				bytes: number;
				cached: boolean;
		  }
		| { type: 'error'; id: string; message: string };

	const PERSIAN_PRESETS = [
		{
			label: 'Conversation',
			text: 'سلام! امروز هوا چطور است؟ امیدوارم روز خوبی داشته باشید.'
		},
		{
			label: 'Ezafe',
			text: 'کتاب قدیمی استاد روی میز بزرگ کتابخانه مرکزی دانشگاه تهران قرار دارد.'
		},
		{
			label: 'Homographs',
			text: 'شیر جنگل کنار شیر آب ایستاد و بعد یک لیوان شیر سرد خورد.'
		},
		{
			label: 'Numbers',
			text: 'جلسه در ساعت ۱۴:۳۰ روز ۲۵ شهریور ۱۴۰۵ برگزار می‌شود و هزینه آن ۱٬۲۵۰٬۰۰۰ تومان است.'
		},
		{
			label: 'Mixed script',
			text: 'لطفاً فایل PDF را در پوشه Downloads ذخیره کنید و سپس روی دکمه Start کلیک کنید.'
		},
		{
			label: 'Long form',
			text: 'فناوری‌های نوین آموزشی می‌توانند شیوه یادگیری زبان را تغییر دهند. با این حال، کیفیت محتوا، تلفظ درست واژه‌ها و بازخورد دقیق همچنان اهمیت زیادی دارند. یک سامانه خوب باید در دستگاه‌های مختلف سریع، قابل اعتماد و برای همه کاربران قابل دسترس باشد.'
		}
	] as const;
	const ENGLISH_PRESETS = [
		{
			label: 'Conversation',
			text: 'Hello! How is the weather today? I hope you are having a wonderful afternoon.'
		},
		{
			label: 'Pronunciation',
			text: 'The thoughtful author thoroughly reviewed three different theories.'
		},
		{
			label: 'Homographs',
			text: 'Please record the record, then present the present to the project lead.'
		},
		{
			label: 'Numbers',
			text: 'The meeting starts at 2:30 PM on September 25, 2026, and costs $1,250.'
		},
		{
			label: 'Mixed content',
			text: 'Save the PDF in your Downloads folder, then click the Start button.'
		},
		{
			label: 'Long form',
			text: 'Modern educational technology can transform the way people learn languages. Even so, clear pronunciation, accurate feedback, and thoughtful content remain essential. A strong learning system should be fast, dependable, and accessible across many different devices.'
		}
	] as const;
	const PRESETS = $derived(isEnglish ? ENGLISH_PRESETS : PERSIAN_PRESETS);

	const SCORE_VALUES = [1, 2, 3, 4, 5] as const;

	function initialEngine(message: string): EngineState {
		return { phase: 'idle', message, progress: null, audioUrl: null, metrics: null };
	}

	function initialRating(): Rating {
		return { pronunciation: 0, naturalness: 0, notes: '' };
	}

	let sourceText = $state<string>(
		untrack(() => (language === 'en' ? ENGLISH_PRESETS[0].text : PERSIAN_PRESETS[0].text))
	);
	let normalizeInput = $state(true);
	let piperVoice = $state<PiperVoiceId>(untrack(() => (language === 'en' ? 'lessac' : 'mana')));
	let piperSpeed = $state(1);
	let nativeRate = $state(1);
	let nativeVoices = $state<SpeechSynthesisVoice[]>([]);
	let nativeVoiceUri = $state('');
	let isolated = $state(false);
	let exportMessage = $state('');

	let engines = $state<Record<EngineId, EngineState>>({
		mms: initialEngine('Ready to load the MMS model on first use.'),
		piper: initialEngine('Ready to load the selected Piper voice on first use.'),
		native: initialEngine('Checking this browser for matching system voices…')
	});

	let ratings = $state<Record<EngineId, Rating>>({
		mms: initialRating(),
		piper: initialRating(),
		native: initialRating()
	});

	let activeRequests: Partial<Record<EngineId, string>> = {};
	let mmsWorker: Worker | null = null;
	let piperWorker: Worker | null = null;
	let piperWorkerVoice: PiperVoiceId | null = null;
	let nativeStartedAt = 0;
	let nativeSpeakingAt = 0;

	const normalizedText = $derived(normalizeInput ? normalizeText(sourceText) : sourceText.trim());
	const anyWorking = $derived(
		engines.mms.phase === 'loading' ||
			engines.mms.phase === 'generating' ||
			engines.piper.phase === 'loading' ||
			engines.piper.phase === 'generating' ||
			engines.native.phase === 'generating'
	);

	onMount(() => {
		isolated = crossOriginIsolated;
		document.body.classList.add('tts-lab-route');
		const refreshVoices = () => {
			nativeVoices = window.speechSynthesis
				.getVoices()
				.filter((voice) => new RegExp(`^${language}(?:-|_|$)`, 'iu').test(voice.lang));
			if (!nativeVoiceUri && nativeVoices.length) nativeVoiceUri = nativeVoices[0].voiceURI;
			engines.native.message = nativeVoices.length
				? `${nativeVoices.length} ${languageName} browser voice${nativeVoices.length === 1 ? '' : 's'} available.`
				: `No ${languageName} system voice was reported by this browser.`;
		};

		refreshVoices();
		window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
		return () => {
			document.body.classList.remove('tts-lab-route');
			window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
		};
	});

	onDestroy(() => {
		mmsWorker?.terminate();
		piperWorker?.terminate();
		if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
		for (const engine of Object.values(engines)) {
			if (engine.audioUrl) URL.revokeObjectURL(engine.audioUrl);
		}
	});

	function normalizeText(value: string): string {
		const normalized = value.normalize('NFC');
		return (
			isEnglish
				? normalized
				: normalized.replaceAll('ي', 'ی').replaceAll('ى', 'ی').replaceAll('ك', 'ک')
		)
			.replace(/[ \t]+/gu, ' ')
			.replace(/\s*\n\s*/gu, '\n')
			.trim();
	}

	function requestId(): string {
		return typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	function workerFor(engineId: 'mms' | 'piper'): Worker {
		if (engineId === 'mms') {
			if (!mmsWorker) {
				mmsWorker = new Worker(new URL('./mms.worker.ts', import.meta.url), { type: 'module' });
				wireWorker('mms', mmsWorker);
			}
			return mmsWorker;
		}

		if (!piperWorker || piperWorkerVoice !== piperVoice) {
			piperWorker?.terminate();
			piperWorker = new Worker(new URL('./piper.worker.ts', import.meta.url), { type: 'module' });
			piperWorkerVoice = piperVoice;
			wireWorker('piper', piperWorker);
		}
		return piperWorker;
	}

	function wireWorker(engineId: 'mms' | 'piper', worker: Worker): void {
		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
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
				return;
			}

			if (engines[engineId].audioUrl) URL.revokeObjectURL(engines[engineId].audioUrl);
			engines[engineId].audioUrl = URL.createObjectURL(message.blob);
			engines[engineId].metrics = {
				loadMs: message.loadMs,
				generationMs: message.generationMs,
				durationSeconds: message.durationSeconds,
				sampleRate: message.sampleRate,
				bytes: message.bytes,
				cached: message.cached
			};
		};

		worker.onerror = (event) => {
			engines[engineId].phase = 'error';
			engines[engineId].progress = null;
			engines[engineId].message = event.message || `${engineId} worker failed to start.`;
		};
		worker.onmessageerror = () => {
			engines[engineId].phase = 'error';
			engines[engineId].message = 'The browser could not read the audio worker response.';
		};
	}

	function prepareGeneration(engineId: EngineId, message: string): string | null {
		if (!normalizedText) {
			engines[engineId].phase = 'error';
			engines[engineId].message = `Enter some ${languageName} text first.`;
			return null;
		}
		const id = requestId();
		activeRequests[engineId] = id;
		engines[engineId].phase = engineId === 'native' ? 'generating' : 'loading';
		engines[engineId].progress = engineId === 'native' ? null : 0;
		engines[engineId].message = message;
		return id;
	}

	function generateMms(): void {
		const id = prepareGeneration('mms', 'Starting the MMS worker…');
		if (!id) return;
		workerFor('mms').postMessage({ type: 'generate', id, text: normalizedText, language });
	}

	function generatePiper(): void {
		const id = prepareGeneration('piper', 'Starting the Piper worker…');
		if (!id) return;
		workerFor('piper').postMessage({
			type: 'generate',
			id,
			text: normalizedText,
			voiceId: piperVoice,
			speed: piperSpeed
		});
	}

	function speakNative(): void {
		const id = prepareGeneration('native', 'Waiting for the browser voice to begin…');
		if (!id) return;
		if (!nativeVoices.length) {
			engines.native.phase = 'error';
			engines.native.message = `This browser has no ${languageName} voice to evaluate.`;
			return;
		}

		speechSynthesis.cancel();
		const utterance = new SpeechSynthesisUtterance(normalizedText);
		utterance.lang = localeCode;
		utterance.rate = nativeRate;
		utterance.voice = nativeVoices.find((voice) => voice.voiceURI === nativeVoiceUri) ?? null;
		nativeStartedAt = performance.now();
		nativeSpeakingAt = 0;

		utterance.onstart = () => {
			if (activeRequests.native !== id) return;
			nativeSpeakingAt = performance.now();
			engines.native.message = 'The browser is speaking now.';
		};
		utterance.onend = () => {
			if (activeRequests.native !== id) return;
			const endedAt = performance.now();
			engines.native.phase = 'ready';
			engines.native.message = 'Browser speech finished. Rate what you heard below.';
			engines.native.metrics = {
				loadMs: Math.max(0, (nativeSpeakingAt || endedAt) - nativeStartedAt),
				generationMs: Math.max(0, endedAt - (nativeSpeakingAt || nativeStartedAt)),
				durationSeconds: Math.max(0, endedAt - (nativeSpeakingAt || nativeStartedAt)) / 1000,
				sampleRate: null,
				bytes: null,
				cached: null
			};
		};
		utterance.onerror = (event) => {
			if (activeRequests.native !== id || event.error === 'canceled') return;
			engines.native.phase = 'error';
			engines.native.message = `Browser speech failed: ${event.error}.`;
		};

		speechSynthesis.speak(utterance);
	}

	function cancelEngine(engineId: EngineId): void {
		activeRequests[engineId] = requestId();
		if (engineId === 'mms') {
			mmsWorker?.terminate();
			mmsWorker = null;
		} else if (engineId === 'piper') {
			piperWorker?.terminate();
			piperWorker = null;
			piperWorkerVoice = null;
		} else {
			speechSynthesis.cancel();
		}
		engines[engineId].phase = 'idle';
		engines[engineId].progress = null;
		engines[engineId].message = 'Canceled. You can run this engine again.';
	}

	function isWorking(engineId: EngineId): boolean {
		return engines[engineId].phase === 'loading' || engines[engineId].phase === 'generating';
	}

	function formatTime(milliseconds: number): string {
		if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
		return `${(milliseconds / 1000).toFixed(2)} s`;
	}

	function formatBytes(bytes: number | null): string {
		if (bytes === null) return '—';
		return bytes < 1_000_000
			? `${(bytes / 1000).toFixed(0)} kB`
			: `${(bytes / 1_000_000).toFixed(1)} MB`;
	}

	function formatRate(metrics: Metrics): string {
		if (!metrics.durationSeconds) return '—';
		return (metrics.generationMs / 1000 / metrics.durationSeconds).toFixed(2);
	}

	async function clearPiperCache(): Promise<void> {
		if (!('caches' in window)) return;
		cancelEngine('piper');
		await caches.delete('tts-lab-piper-models-v1');
		engines.piper.message = 'Piper model cache cleared. The next run will download it again.';
	}

	function setScore(
		engineId: EngineId,
		field: 'pronunciation' | 'naturalness',
		score: number
	): void {
		ratings[engineId][field] = ratings[engineId][field] === score ? 0 : score;
	}

	function exportEvaluation(): void {
		const selectedNativeVoice = nativeVoices.find((voice) => voice.voiceURI === nativeVoiceUri);
		const report = {
			createdAt: new Date().toISOString(),
			language,
			text: sourceText,
			normalizedText,
			normalizationEnabled: normalizeInput,
			environment: {
				userAgent: navigator.userAgent,
				crossOriginIsolated,
				hardwareConcurrency: navigator.hardwareConcurrency
			},
			options: {
				piperVoice,
				piperSpeed,
				nativeRate,
				nativeVoice: selectedNativeVoice
					? {
							name: selectedNativeVoice.name,
							lang: selectedNativeVoice.lang,
							localService: selectedNativeVoice.localService
						}
					: null
			},
			results: {
				mms: { metrics: engines.mms.metrics, rating: ratings.mms },
				piper: { metrics: engines.piper.metrics, rating: ratings.piper },
				native: { metrics: engines.native.metrics, rating: ratings.native }
			}
		};
		const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${language === 'en' ? 'english' : 'persian'}-tts-evaluation-${Date.now()}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
		exportMessage = 'Evaluation JSON exported.';
		setTimeout(() => (exportMessage = ''), 2500);
	}
</script>

<svelte:head>
	<title>{languageName} TTS lab · temporary</title>
	<meta
		name="description"
		content={`An isolated, browser-local comparison of ${languageName} MMS, Piper, and system text-to-speech.`}
	/>
</svelte:head>

<main class="lab-shell">
	<header class="hero">
		<div class="hero-copy">
			<div class="lab-mark" aria-hidden="true">{isEnglish ? 'A' : 'آ'}</div>
			<div>
				<p class="eyebrow">Temporary isolated route · {isEnglish ? '/en/tts-lab' : '/tts-lab'}</p>
				<h1>{languageName} TTS evaluation lab</h1>
				<p class="lede">
					Compare browser-local MMS and Piper output against the {languageName} voice installed in your
					browser. No generated text or audio is sent to this app's server.
				</p>
			</div>
		</div>
		<div class="isolation-state good">
			<span></span>
			{isolated ? 'Cross-origin isolated · one WASM thread' : 'Browser-local · one WASM thread'}
		</div>
	</header>

	<section class="composer" aria-labelledby="test-text-title">
		<div class="section-heading">
			<div>
				<p class="eyebrow">Shared input</p>
				<h2 id="test-text-title">Test the same sentence everywhere</h2>
			</div>
			<span class="character-count">{normalizedText.length} characters</span>
		</div>

		<div class="preset-row" aria-label={`${languageName} test presets`}>
			{#each PRESETS as preset (preset.label)}
				<button
					type="button"
					class:active={sourceText === preset.text}
					onclick={() => (sourceText = preset.text)}>{preset.label}</button
				>
			{/each}
		</div>

		<textarea
			bind:value={sourceText}
			dir={isEnglish ? 'ltr' : 'rtl'}
			lang={language}
			rows="5"
			spellcheck="true"
			aria-label={`${languageName} text to synthesize`}></textarea>

		<div class="composer-footer">
			<label class="check-field">
				<input type="checkbox" bind:checked={normalizeInput} />
				<span
					>{isEnglish
						? 'Normalize Unicode and whitespace'
						: 'Normalize Arabic ي/ك variants and whitespace'}</span
				>
			</label>
			<div class="privacy-note"><span aria-hidden="true">●</span> Inference stays in this tab</div>
		</div>
	</section>

	<section class="engine-grid" aria-label="Text to speech engines">
		<article class="engine-card mms-card">
			<header class="engine-header">
				<div class="engine-number">01</div>
				<div>
					<div class="title-row">
						<h2>MMS {languageName}</h2>
						<span class="tag research">non-commercial</span>
					</div>
					<p>Transformers.js · q8 ONNX · 16 kHz · approximately 38 MB</p>
				</div>
			</header>

			<p class="engine-summary">
				The lowest-friction option for this app. A single {languageName} voice running through the same
				WASM stack as local speech recognition.
			</p>

			<div class="status-box" class:error={engines.mms.phase === 'error'}>
				<div class="status-line">
					<span class:working={isWorking('mms')} class="status-dot"></span>
					<strong>{engines.mms.phase}</strong>
					<span>{engines.mms.message}</span>
				</div>
				{#if engines.mms.progress !== null}
					<progress max="100" value={engines.mms.progress}></progress>
				{/if}
			</div>

			<div class="actions">
				<button class="primary" type="button" onclick={generateMms} disabled={isWorking('mms')}>
					{engines.mms.audioUrl ? 'Generate again' : 'Generate MMS'}
				</button>
				{#if isWorking('mms')}
					<button class="quiet" type="button" onclick={() => cancelEngine('mms')}>Cancel</button>
				{/if}
			</div>

			{#if engines.mms.audioUrl}
				<div class="output-panel">
					<audio controls preload="metadata" src={engines.mms.audioUrl}></audio>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="download" href={engines.mms.audioUrl} download={`${language}-mms.wav`}
						>Download WAV</a
					>
				</div>
			{/if}

			{@render metrics(engines.mms.metrics)}
			{@render ratingPanel('mms')}

			<footer class="license-note">
				<strong>License gate:</strong> CC-BY-NC-4.0. Useful for evaluation, not commercial deployment.
			</footer>
		</article>

		<article class="engine-card piper-card">
			<header class="engine-header">
				<div class="engine-number">02</div>
				<div>
					<div class="title-row">
						<h2>Piper {languageName}</h2>
						<span class="tag candidate">product candidate</span>
					</div>
					<p>Direct ONNX Runtime WASM · 22.05 kHz · approximately 63.5 MB per voice</p>
				</div>
			</header>

			<div class="controls-row">
				<label>
					<span>Voice model</span>
					<select bind:value={piperVoice} disabled={isWorking('piper')}>
						{#if isEnglish}
							<option value="lessac">Lessac · US English</option>
							<option value="amy">Amy · US English</option>
							<option value="sam">Sam · US English</option>
						{:else}
							<option value="mana">Mana · recent research model</option>
							<option value="amir">Amir · stock Piper</option>
							<option value="gyro">Gyro · stock Piper</option>
						{/if}
					</select>
				</label>
				<label>
					<span>Speed · {piperSpeed.toFixed(2)}×</span>
					<input type="range" min="0.7" max="1.35" step="0.05" bind:value={piperSpeed} />
				</label>
			</div>

			<p class="engine-summary">
				{isEnglish
					? 'Compare three medium-quality US English voices using the same eSpeak phonemizer and ONNX runtime.'
					: 'Choose Mana for the newer acoustic model, then compare it with Amir and Gyro. All three use the baseline eSpeak Persian phonemizer in this lab—not the research-only LCA pipeline.'}
			</p>

			<div class="status-box" class:error={engines.piper.phase === 'error'}>
				<div class="status-line">
					<span class:working={isWorking('piper')} class="status-dot"></span>
					<strong>{engines.piper.phase}</strong>
					<span>{engines.piper.message}</span>
				</div>
				{#if engines.piper.progress !== null}
					<progress max="100" value={engines.piper.progress}></progress>
				{/if}
			</div>

			<div class="actions split-actions">
				<div>
					<button
						class="primary"
						type="button"
						onclick={generatePiper}
						disabled={isWorking('piper')}
					>
						{engines.piper.audioUrl ? 'Generate again' : 'Generate Piper'}
					</button>
					{#if isWorking('piper')}
						<button class="quiet" type="button" onclick={() => cancelEngine('piper')}>Cancel</button
						>
					{/if}
				</div>
				<button class="text-action" type="button" onclick={clearPiperCache}
					>Clear model cache</button
				>
			</div>

			{#if engines.piper.audioUrl}
				<div class="output-panel">
					<audio controls preload="metadata" src={engines.piper.audioUrl}></audio>
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class="download"
						href={engines.piper.audioUrl}
						download={`${language}-piper-${piperVoice}.wav`}>Download WAV</a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</div>
			{/if}

			{@render metrics(engines.piper.metrics)}
			{@render ratingPanel('piper')}

			<footer class="license-note warning">
				<strong>License review:</strong> voice weights are permissive, but the eSpeak phonemizer bundled
				in the WASM asset is GPL-3.0.
			</footer>
		</article>

		<article class="engine-card native-card">
			<header class="engine-header">
				<div class="engine-number">03</div>
				<div>
					<div class="title-row">
						<h2>Browser voice</h2>
						<span class="tag baseline">baseline</span>
					</div>
					<p>Web Speech API · supplied by the operating system or browser</p>
				</div>
			</header>

			<div class="controls-row">
				<label>
					<span>{languageName} system voice</span>
					<select
						bind:value={nativeVoiceUri}
						disabled={!nativeVoices.length || isWorking('native')}
					>
						{#if !nativeVoices.length}<option value="">No {languageName} voices found</option>{/if}
						{#each nativeVoices as voice (voice.voiceURI)}
							<option value={voice.voiceURI}>
								{voice.name} · {voice.lang}{voice.localService ? ' · local' : ' · may be remote'}
							</option>
						{/each}
					</select>
				</label>
				<label>
					<span>Rate · {nativeRate.toFixed(2)}×</span>
					<input type="range" min="0.7" max="1.35" step="0.05" bind:value={nativeRate} />
				</label>
			</div>

			<p class="engine-summary">
				This is the zero-download control. Results vary by device and cannot be exported or assumed
				to work offline.
			</p>

			<div class="status-box" class:error={engines.native.phase === 'error'}>
				<div class="status-line">
					<span class:working={isWorking('native')} class="status-dot"></span>
					<strong>{engines.native.phase}</strong>
					<span>{engines.native.message}</span>
				</div>
			</div>

			<div class="actions">
				<button
					class="primary"
					type="button"
					onclick={speakNative}
					disabled={!nativeVoices.length || isWorking('native')}>Speak with browser</button
				>
				{#if isWorking('native')}
					<button class="quiet" type="button" onclick={() => cancelEngine('native')}>Stop</button>
				{/if}
			</div>

			{@render metrics(engines.native.metrics)}
			{@render ratingPanel('native')}

			<footer class="license-note neutral">
				<strong>Portability warning:</strong> the chosen voice may not exist for another user or browser.
			</footer>
		</article>
	</section>

	<section class="decision-panel">
		<div>
			<p class="eyebrow">Evaluation record</p>
			<h2>Take the evidence with you</h2>
			<p>
				The report includes the exact text, engine settings, measured timings, browser environment,
				and your ratings. It never includes the generated audio.
			</p>
		</div>
		<div class="export-area">
			<button type="button" onclick={exportEvaluation} disabled={anyWorking}
				>Export evaluation JSON</button
			>
			{#if exportMessage}<span role="status">{exportMessage}</span>{/if}
		</div>
	</section>

	<aside class="scope-note">
		{#if isEnglish}
			<strong>Scope:</strong> this route mirrors the Persian bakeoff with a browser-compatible English
			MMS model, three medium Piper voices, and installed system voices. Larger generative models are
			excluded to keep the comparison viable on ordinary browsers.
		{:else}
			<strong>Deliberately excluded:</strong> the LCA Ezafe/homograph enhancement is not currently an
			end-to-end browser package. The Mana option evaluates its acoustic model with baseline G2P; if it
			wins this bakeoff, porting the LCA preprocessing can be evaluated separately. Direct eSpeak audio
			is also excluded because its robotic output is not a credible lesson voice.
		{/if}
	</aside>
</main>

{#snippet metrics(value: Metrics | null)}
	<div class="metrics" aria-label="Performance measurements">
		<div><span>Load</span><strong>{value ? formatTime(value.loadMs) : '—'}</strong></div>
		<div><span>Synthesis</span><strong>{value ? formatTime(value.generationMs) : '—'}</strong></div>
		<div>
			<span>Audio</span><strong>{value ? `${value.durationSeconds.toFixed(2)} s` : '—'}</strong>
		</div>
		<div><span>RTF</span><strong>{value ? formatRate(value) : '—'}</strong></div>
		<div>
			<span>Sample rate</span><strong
				>{value?.sampleRate ? `${(value.sampleRate / 1000).toFixed(2)} kHz` : '—'}</strong
			>
		</div>
		<div><span>WAV size</span><strong>{formatBytes(value?.bytes ?? null)}</strong></div>
	</div>
{/snippet}

{#snippet ratingPanel(engineId: EngineId)}
	<div class="rating-panel">
		<div class="score-row">
			<span>Pronunciation</span>
			<div aria-label="Pronunciation score out of five">
				{#each SCORE_VALUES as score (score)}
					<button
						type="button"
						class:active={ratings[engineId].pronunciation === score}
						onclick={() => setScore(engineId, 'pronunciation', score)}>{score}</button
					>
				{/each}
			</div>
		</div>
		<div class="score-row">
			<span>Naturalness</span>
			<div aria-label="Naturalness score out of five">
				{#each SCORE_VALUES as score (score)}
					<button
						type="button"
						class:active={ratings[engineId].naturalness === score}
						onclick={() => setScore(engineId, 'naturalness', score)}>{score}</button
					>
				{/each}
			</div>
		</div>
		<label class="notes-field">
			<span>Listening notes</span>
			<input
				bind:value={ratings[engineId].notes}
				placeholder="Mispronunciations, rhythm, artifacts…"
			/>
		</label>
	</div>
{/snippet}

<style>
	:global(body.tts-lab-route) {
		margin: 0;
		background:
			radial-gradient(circle at 12% 0%, rgba(15, 118, 110, 0.11), transparent 31rem),
			linear-gradient(180deg, #f8faf9 0%, #eef2f0 100%);
		color: #17201d;
	}

	:global(body.tts-lab-route) button,
	:global(body.tts-lab-route) select,
	:global(body.tts-lab-route) textarea,
	:global(body.tts-lab-route) input {
		font: inherit;
	}

	.lab-shell {
		width: min(100% - 2rem, 92rem);
		margin-inline: auto;
		padding-block: clamp(1.25rem, 3vw, 3rem) 4rem;
	}

	.hero,
	.composer,
	.engine-card,
	.decision-panel,
	.scope-note {
		border: 1px solid rgba(24, 63, 51, 0.12);
		box-shadow: 0 1rem 3rem rgba(27, 54, 46, 0.06);
	}

	.hero {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;
		padding: clamp(1.25rem, 3vw, 2.2rem);
		border-radius: 1.5rem;
		background: rgba(255, 255, 255, 0.86);
		backdrop-filter: blur(18px);
	}

	.hero-copy,
	.engine-header {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
	}

	.lab-mark {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 1rem;
		background: #103e34;
		color: #ddf9ed;
		font-family: var(--font-arabic);
		font-size: 1.8rem;
		font-weight: 700;
	}

	.eyebrow {
		margin: 0 0 0.35rem;
		color: #417466;
		font-size: 0.72rem;
		font-weight: 750;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	h1,
	h2,
	p {
		margin-block-start: 0;
	}

	h1 {
		margin-block-end: 0.55rem;
		font-size: clamp(1.8rem, 4vw, 3.2rem);
		line-height: 1.02;
		letter-spacing: -0.045em;
	}

	h2 {
		margin-block-end: 0.35rem;
		font-size: 1.25rem;
		letter-spacing: -0.02em;
	}

	.lede {
		max-width: 51rem;
		margin-block-end: 0;
		color: #52625d;
		line-height: 1.65;
	}

	.isolation-state {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 0 0 auto;
		padding: 0.55rem 0.75rem;
		border: 1px solid #e5c67a;
		border-radius: 999px;
		background: #fff8e6;
		color: #795b18;
		font-size: 0.76rem;
		font-weight: 700;
	}

	.isolation-state span {
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 50%;
		background: #d19a22;
	}

	.isolation-state.good {
		border-color: #a4ddc6;
		background: #edfbf5;
		color: #176047;
	}

	.isolation-state.good span {
		background: #20a26f;
	}

	.composer {
		margin-block: 1rem;
		padding: clamp(1rem, 2vw, 1.5rem);
		border-radius: 1.25rem;
		background: #fff;
	}

	.section-heading,
	.composer-footer,
	.actions,
	.split-actions,
	.title-row,
	.decision-panel,
	.export-area {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.character-count {
		color: #75817d;
		font-size: 0.78rem;
	}

	.preset-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-block: 0.9rem;
	}

	.preset-row button,
	.quiet,
	.text-action {
		border: 1px solid #d9e2df;
		background: #f8faf9;
		color: #44534e;
	}

	.preset-row button {
		padding: 0.42rem 0.68rem;
		border-radius: 999px;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.preset-row button:hover,
	.preset-row button.active {
		border-color: #6ca995;
		background: #eaf7f2;
		color: #194d3d;
	}

	textarea {
		box-sizing: border-box;
		width: 100%;
		min-height: 8rem;
		resize: vertical;
		padding: 1rem 1.1rem;
		border: 1px solid #ccd8d4;
		border-radius: 0.9rem;
		outline: none;
		background: #fbfcfc;
		font-family: var(--font-arabic);
		font-size: 1.12rem;
		line-height: 2;
	}

	textarea:focus,
	select:focus,
	input:focus {
		border-color: #358a70;
		box-shadow: 0 0 0 3px rgba(53, 138, 112, 0.12);
	}

	.composer-footer {
		margin-block-start: 0.8rem;
	}

	.check-field,
	.privacy-note {
		display: flex;
		align-items: center;
		gap: 0.48rem;
		color: #5d6d67;
		font-size: 0.78rem;
	}

	.check-field input {
		accent-color: #197255;
	}

	.privacy-note span {
		color: #25a678;
		font-size: 0.65rem;
	}

	.engine-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 1rem;
		align-items: start;
	}

	.engine-card {
		position: relative;
		display: grid;
		gap: 1rem;
		min-width: 0;
		padding: 1.25rem;
		border-radius: 1.25rem;
		background: rgba(255, 255, 255, 0.95);
		overflow: hidden;
	}

	.engine-card::before {
		position: absolute;
		inset: 0 0 auto;
		height: 0.24rem;
		content: '';
	}

	.mms-card::before {
		background: #6675d8;
	}
	.piper-card::before {
		background: #14805f;
	}
	.native-card::before {
		background: #b67b2a;
	}

	.engine-number {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.7rem;
		background: #eff3f1;
		color: #53645e;
		font:
			700 0.72rem/1 ui-monospace,
			monospace;
	}

	.engine-header p,
	.engine-summary,
	.decision-panel p,
	.scope-note {
		color: #64726d;
		font-size: 0.8rem;
		line-height: 1.6;
	}

	.engine-header p,
	.engine-summary,
	.decision-panel p {
		margin-block-end: 0;
	}

	.title-row {
		justify-content: flex-start;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.title-row h2 {
		margin: 0;
	}

	.tag {
		padding: 0.25rem 0.46rem;
		border-radius: 999px;
		font-size: 0.62rem;
		font-weight: 750;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.tag.research {
		background: #f0efff;
		color: #5651a6;
	}
	.tag.candidate {
		background: #e5f7ef;
		color: #176248;
	}
	.tag.baseline {
		background: #fff2df;
		color: #85591c;
	}

	.controls-row {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(7rem, 1fr);
		gap: 0.7rem;
	}

	.controls-row label,
	.notes-field {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
		color: #53635d;
		font-size: 0.7rem;
		font-weight: 700;
	}

	select,
	.notes-field input {
		box-sizing: border-box;
		min-width: 0;
		width: 100%;
		padding: 0.6rem 0.7rem;
		border: 1px solid #d2ddda;
		border-radius: 0.65rem;
		outline: none;
		background: #fff;
		color: #283631;
		font-size: 0.78rem;
	}

	input[type='range'] {
		width: 100%;
		accent-color: #197255;
	}

	.status-box {
		padding: 0.75rem;
		border: 1px solid #dce5e2;
		border-radius: 0.75rem;
		background: #f8faf9;
	}

	.status-box.error {
		border-color: #efc5bf;
		background: #fff6f4;
	}

	.status-line {
		display: grid;
		grid-template-columns: auto auto 1fr;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		font-size: 0.7rem;
	}

	.status-line strong {
		color: #3c4b46;
		text-transform: capitalize;
	}

	.status-line span:last-child {
		min-width: 0;
		color: #6c7974;
		overflow-wrap: anywhere;
	}

	.status-dot {
		width: 0.48rem;
		height: 0.48rem;
		border-radius: 50%;
		background: #9eaaa6;
	}

	.status-dot.working {
		background: #1a9670;
		box-shadow: 0 0 0 0 rgba(26, 150, 112, 0.35);
		animation: pulse 1.5s infinite;
	}

	progress {
		width: 100%;
		height: 0.35rem;
		margin-block-start: 0.65rem;
		border: 0;
		border-radius: 999px;
		overflow: hidden;
		accent-color: #1b8665;
	}

	.actions {
		justify-content: flex-start;
	}

	.split-actions {
		justify-content: space-between;
	}

	.split-actions > div {
		display: flex;
		gap: 0.5rem;
	}

	.primary,
	.quiet,
	.text-action,
	.export-area button {
		padding: 0.64rem 0.82rem;
		border-radius: 0.68rem;
		font-size: 0.74rem;
		font-weight: 750;
		cursor: pointer;
	}

	.primary,
	.export-area button {
		border: 1px solid #164f3e;
		background: #174f3e;
		color: #f4fffb;
	}

	.primary:hover,
	.export-area button:hover {
		background: #0e3e30;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.52;
	}

	.text-action {
		border: 0;
		background: transparent;
		color: #67756f;
		font-weight: 650;
		text-decoration: underline;
		text-underline-offset: 0.2rem;
	}

	.output-panel {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	audio {
		min-width: 0;
		width: 100%;
		height: 2.4rem;
	}

	.download {
		flex: 0 0 auto;
		color: #276d57;
		font-size: 0.68rem;
		font-weight: 700;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid #e0e7e5;
		border-radius: 0.8rem;
		overflow: hidden;
	}

	.metrics div {
		display: grid;
		gap: 0.2rem;
		padding: 0.6rem 0.65rem;
		border-right: 1px solid #e8edeb;
		border-bottom: 1px solid #e8edeb;
	}

	.metrics div:nth-child(3n) {
		border-right: 0;
	}
	.metrics div:nth-last-child(-n + 3) {
		border-bottom: 0;
	}

	.metrics span {
		color: #7b8783;
		font-size: 0.6rem;
		text-transform: uppercase;
	}

	.metrics strong {
		color: #35433e;
		font:
			700 0.73rem/1.2 ui-monospace,
			monospace;
	}

	.rating-panel {
		display: grid;
		gap: 0.6rem;
		padding-block-start: 0.2rem;
	}

	.score-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		color: #53635d;
		font-size: 0.7rem;
		font-weight: 700;
	}

	.score-row > div {
		display: flex;
		gap: 0.25rem;
	}

	.score-row button {
		display: grid;
		place-items: center;
		width: 1.65rem;
		height: 1.65rem;
		padding: 0;
		border: 1px solid #d6dfdc;
		border-radius: 50%;
		background: #fff;
		color: #65736e;
		font-size: 0.66rem;
		cursor: pointer;
	}

	.score-row button:hover,
	.score-row button.active {
		border-color: #277b60;
		background: #277b60;
		color: #fff;
	}

	.license-note {
		margin: 0 -1.25rem -1.25rem;
		padding: 0.75rem 1.25rem;
		background: #f0effb;
		color: #5c587d;
		font-size: 0.68rem;
		line-height: 1.55;
	}

	.license-note.warning {
		background: #fff5e5;
		color: #785b27;
	}
	.license-note.neutral {
		background: #f3f5f4;
		color: #65716d;
	}

	.decision-panel {
		margin-block-start: 1rem;
		padding: 1.3rem 1.5rem;
		border-radius: 1.25rem;
		background: #123e33;
		color: #ecfff8;
	}

	.decision-panel h2 {
		margin-block-end: 0.25rem;
	}
	.decision-panel .eyebrow {
		color: #8bd4bb;
	}
	.decision-panel p {
		max-width: 46rem;
		color: #b9d3ca;
	}

	.export-area {
		flex: 0 0 auto;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.45rem;
	}

	.export-area button {
		border-color: #c8f2e3;
		background: #d9f8ec;
		color: #164b3a;
	}

	.export-area span {
		color: #aee4d1;
		font-size: 0.7rem;
	}

	.scope-note {
		margin-block-start: 1rem;
		padding: 1rem 1.2rem;
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.72);
	}

	.scope-note strong {
		color: #384842;
	}

	@keyframes pulse {
		70% {
			box-shadow: 0 0 0 0.38rem rgba(26, 150, 112, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(26, 150, 112, 0);
		}
	}

	@media (max-width: 72rem) {
		.engine-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.native-card {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 48rem) {
		.lab-shell {
			width: min(100% - 1rem, 92rem);
			padding-block-start: 0.5rem;
		}
		.hero,
		.decision-panel {
			flex-direction: column;
		}
		.isolation-state {
			align-self: flex-start;
		}
		.engine-grid {
			grid-template-columns: 1fr;
		}
		.native-card {
			grid-column: auto;
		}
		.export-area {
			align-items: flex-start;
		}
	}

	@media (max-width: 32rem) {
		.hero-copy {
			flex-direction: column;
		}
		.controls-row {
			grid-template-columns: 1fr;
		}
		.composer-footer,
		.split-actions {
			align-items: flex-start;
			flex-direction: column;
		}
		.output-panel {
			align-items: flex-start;
			flex-direction: column;
		}
		.metrics {
			grid-template-columns: repeat(2, 1fr);
		}
		.metrics div:nth-child(3n) {
			border-right: 1px solid #e8edeb;
		}
		.metrics div:nth-child(2n) {
			border-right: 0;
		}
		.metrics div:nth-last-child(-n + 3) {
			border-bottom: 1px solid #e8edeb;
		}
		.metrics div:nth-last-child(-n + 2) {
			border-bottom: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.status-dot.working {
			animation: none;
		}
	}
</style>
