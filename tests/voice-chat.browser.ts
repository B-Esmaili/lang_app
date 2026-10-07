import { test, expect, type Page } from '@playwright/test';
import { DEFAULT_VOICE_CHAT } from '../src/lib/features/voice-chat/model';
import { DEFAULT_VOICE_CHAT_VOICE } from '../src/lib/features/voice-chat/voices';

async function stubDesktopTts(page: Page, delay = 30) {
	await page.addInitScript((delay) => {
		const host = window as unknown as {
			nativeSpeech: { text: string; voice: string; cancelled: boolean }[];
		};
		host.nativeSpeech = [];
		const jobs = new Map<number, { text: string; voice: string; cancelled: boolean }>();
		window.aiChatDesktop = {
			version: 2,
			tts: {
				version: 2,
				engine: 'pocket-tts',
				voices: [
					{ id: 'child-female', label: 'Girl (child)', age: 'child', gender: 'female' },
					{ id: 'child-male', label: 'Boy (child)', age: 'child', gender: 'male' },
					{ id: 'young-female', label: 'Young woman', age: 'young', gender: 'female' },
					{ id: 'senior-male', label: 'Older man', age: 'senior', gender: 'male' }
				],
				defaultVoice: 'young-female',
				async generate(id, text, voice) {
					const job = { text, voice, cancelled: false };
					jobs.set(id, job);
					host.nativeSpeech.push(job);
					setTimeout(() => {
						if (job.cancelled) return;
						const pcm = btoa(String.fromCharCode(...new Uint8Array(2400 * 4)));
						window.dispatchEvent(
							new CustomEvent('desktop-tts-audio', {
								detail: { type: 'chunk', id, pcm, sampleRate: 24000, progress: 1 }
							})
						);
						window.dispatchEvent(
							new CustomEvent('desktop-tts-audio', {
								detail: { type: 'complete', id, sampleRate: 24000, sampleCount: 2400 }
							})
						);
					}, delay);
				},
				async cancel(id) {
					const job = jobs.get(id);
					if (job) job.cancelled = true;
				}
			}
		};
	}, delay);
}

test('direct website has browser voices and no desktop profile controls', async ({ page }) => {
	const settings = await mount(page, 'VoiceChatSettings', {
		preferences: { connectionId: null, voiceId: 'en_GB-alba-medium' },
		connections: []
	});
	await expect(settings.getByRole('combobox', { name: 'Speaker', exact: true })).toHaveValue(
		'en_GB-alba-medium'
	);
	await expect(settings.getByRole('combobox', { name: 'Speech model', exact: true })).toHaveCount(
		0
	);
	await expect(settings.getByRole('textbox', { name: 'Comparison text' })).toHaveCount(0);
});

test('desktop playback keeps normal speed and pitch and stops cleanly', async ({ page }) => {
	await stubDesktopTts(page);
	await page.goto('/en/tts-lab');
	const result = await page.evaluate(async () => {
		const modulePath = '/src/lib/features/voice-chat/tts-engine.ts';
		const { VoicePlayback } = await import(modulePath);
		// Two seconds of 440 Hz lets us measure both duration and audible pitch.
		const rate = 24000;
		const samples = rate * 2;
		const wav = new ArrayBuffer(44 + samples * 2);
		const view = new DataView(wav);
		const ascii = (offset: number, text: string) =>
			[...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
		ascii(0, 'RIFF');
		view.setUint32(4, wav.byteLength - 8, true);
		ascii(8, 'WAVEfmt ');
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, 1, true);
		view.setUint32(24, rate, true);
		view.setUint32(28, rate * 2, true);
		view.setUint16(32, 2, true);
		view.setUint16(34, 16, true);
		ascii(36, 'data');
		view.setUint32(40, samples * 2, true);
		for (let i = 0; i < samples; i++)
			view.setInt16(44 + i * 2, Math.round(Math.sin((i * 440 * 2 * Math.PI) / rate) * 3277), true);
		const blob = new Blob([wav], { type: 'audio/wav' });
		const playback = new VoicePlayback();
		await playback.unlock();
		const context = playback.recordingContext() as AudioContext;
		const analyser = context.createAnalyser();
		analyser.fftSize = 4096;
		analyser.smoothingTimeConstant = 0;
		const elements: HTMLMediaElement[] = [];
		const createSource = context.createMediaElementSource.bind(context);
		context.createMediaElementSource = (element) => {
			elements.push(element);
			const source = createSource(element);
			source.connect(analyser);
			return source;
		};
		try {
			const started = performance.now();
			const progress: number[] = [];
			const first = playback.play(blob, (fraction: number) => progress.push(fraction));
			const playbackRate = elements[0].playbackRate;
			const preservesPitch = elements[0].preservesPitch;
			await new Promise((resolve) => setTimeout(resolve, 500));
			const spectrum = new Float32Array(analyser.frequencyBinCount);
			analyser.getFloatFrequencyData(spectrum);
			let peak = 0;
			for (let i = 1; i < spectrum.length; i++) if (spectrum[i] > spectrum[peak]) peak = i;
			const frequency = (peak * context.sampleRate) / analyser.fftSize;
			await first;
			const elapsed = (performance.now() - started) / 1000;
			const replay = playback.play(blob);
			await new Promise((resolve) => setTimeout(resolve, 100));
			playback.stop();
			await replay;
			const cancelledCleanly = elements.every(
				(element) => element.paused && !element.hasAttribute('src')
			);
			const badAudioRejected = await playback.play(new Blob(['invalid audio'])).then(
				() => false,
				() => true
			);
			const afterError = playback.play(blob);
			playback.dispose();
			await afterError;
			return {
				progress,
				playbackRate,
				preservesPitch,
				frequency,
				elapsed,
				cancelledCleanly,
				badAudioRejected
			};
		} finally {
			playback.dispose();
		}
	});
	expect(result.playbackRate).toBe(1);
	expect(result.progress[0]).toBe(0);
	expect(result.progress.some((fraction: number) => fraction > 0.2 && fraction < 0.8)).toBe(true);
	expect(result.progress.at(-1)).toBe(1);
	expect(result.preservesPitch).toBe(true);
	expect(Math.abs(result.frequency - 440)).toBeLessThan(20);
	expect(result.elapsed).toBeGreaterThan(2 - 0.08);
	expect(result.elapsed).toBeLessThan(2 + 1.5);
	expect(result.cancelledCleanly).toBe(true);
	expect(result.badAudioRejected).toBe(true);
});

for (const provider of ['website', 'desktop'] as const) {
	test(`${provider} hides AI text until spoken playback begins`, async ({ page }) => {
		if (provider === 'desktop') await stubDesktopTts(page, 1200);
		else await stubSpeechWorkers(page, 30, undefined, { delay: 1200, seconds: 2 });
		await page.route('**/api/account/voice-chat', (route) =>
			route.fulfill({ json: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE } })
		);
		const reply = 'Hello there. Let us practice English together.';
		await page.route('**/api/voice-chat', (route) =>
			route.fulfill({
				json: {
					text: reply,
					compacted: false,
					context: { summary: '', messages: [{ role: 'assistant', content: reply }] }
				}
			})
		);
		const widget = await mount(page, 'VoiceChat', { configuration: DEFAULT_VOICE_CHAT });
		await widget.getByRole('button', { name: 'Start conversation' }).click();
		await expect(widget.getByText('Preparing the voice')).toBeVisible();
		await expect(widget.getByRole('log')).not.toContainText(reply);
		if (provider === 'website') {
			await expect(widget.getByRole('log')).toContainText('Hello ');
			await expect(widget.getByRole('log')).not.toContainText(reply);
		}
		await expect(widget.getByRole('log')).toContainText(reply);
	});
}

test('stopping before playback keeps the reply hidden until Read reply is chosen', async ({
	page
}) => {
	await stubSpeechWorkers(page, 30, undefined, { delay: 1200, seconds: 1 });
	await page.route('**/api/account/voice-chat', (route) =>
		route.fulfill({ json: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE } })
	);
	const reply = 'Read this answer after stopping speech.';
	await page.route('**/api/voice-chat', (route) =>
		route.fulfill({
			json: {
				text: reply,
				compacted: false,
				context: { summary: '', messages: [{ role: 'assistant', content: reply }] }
			}
		})
	);
	const widget = await mount(page, 'VoiceChat', { configuration: DEFAULT_VOICE_CHAT });
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByText('Preparing the voice')).toBeVisible();
	await expect(widget.getByRole('log')).not.toContainText(reply);
	await widget.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(widget.getByRole('log')).not.toContainText(reply);
	await widget.getByRole('button', { name: 'Read reply' }).click();
	await expect(widget.getByRole('log')).toContainText(reply);
});

test('stopping during playback keeps unspoken words hidden until replay', async ({ page }) => {
	await stubSpeechWorkers(page, 30, undefined, { delay: 30, seconds: 2 });
	await page.route('**/api/account/voice-chat', (route) =>
		route.fulfill({ json: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE } })
	);
	const reply = 'Hello there. Let us practice English together.';
	await page.route('**/api/voice-chat', (route) =>
		route.fulfill({
			json: {
				text: reply,
				compacted: false,
				context: { summary: '', messages: [{ role: 'assistant', content: reply }] }
			}
		})
	);
	const widget = await mount(page, 'VoiceChat', { configuration: DEFAULT_VOICE_CHAT });
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByRole('log')).toContainText('Hello ');
	await widget.getByRole('button', { name: 'Stop speaking' }).click();
	await expect(widget.getByRole('log')).not.toContainText(reply);
	await widget.getByRole('button', { name: 'Replay', exact: true }).click();
	await expect(widget.getByRole('log')).toContainText(reply);
});

test('failed audio keeps generated text hidden with an explicit text recovery', async ({
	page
}) => {
	await stubSpeechWorkers(page);
	await page.addInitScript(() => {
		Object.defineProperty(AudioContext.prototype, 'decodeAudioData', {
			value: () => Promise.reject(new Error('Audio decode failed'))
		});
	});
	await page.route('**/api/account/voice-chat', (route) =>
		route.fulfill({ json: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE } })
	);
	const reply = 'Read this answer if audio is unavailable.';
	await page.route('**/api/voice-chat', (route) =>
		route.fulfill({
			json: {
				text: reply,
				compacted: false,
				context: { summary: '', messages: [{ role: 'assistant', content: reply }] }
			}
		})
	);
	const widget = await mount(page, 'VoiceChat', { configuration: DEFAULT_VOICE_CHAT });
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByText('Audio decode failed', { exact: false })).toBeVisible();
	await expect(widget.getByRole('log')).not.toContainText(reply);
	await widget.getByRole('button', { name: 'Read reply' }).click();
	await expect(widget.getByRole('log')).toContainText(reply);
});

test('desktop voice chat speaks with Pocket TTS and keeps language-aware hands-free turns', async ({
	page
}) => {
	await stubDesktopTts(page);
	const { widget, answers } = await handsFreeHarness(page, 1);
	await widget.getByLabel(/Hands-free —/).check();
	await widget.getByRole('button', { name: 'Start conversation', exact: true }).click();
	await expect.poll(() => answers, { timeout: 10000 }).toEqual(['I go to the park yesterday.']);
	// Bundled voices do not change while running, so an identical reply reuses its audio.
	const speech = await page.evaluate(
		() => (window as unknown as { nativeSpeech: { voice: string }[] }).nativeSpeech
	);
	expect(speech.length).toBe(1);
	expect(speech[0].voice).toBe('young-female'); // No saved desktop voice: the host default.
	await widget.getByRole('button', { name: 'New conversation' }).click();
});

test('desktop replay reuses the spoken reply without another native generation', async ({
	page
}) => {
	await stubDesktopTts(page);
	const { widget, actions } = await handsFreeHarness(page, 0);
	await widget.getByRole('button', { name: 'Start conversation', exact: true }).click();
	const replay = widget.getByRole('button', { name: 'Replay', exact: true });
	await expect(replay).toBeEnabled();
	await replay.click();
	await expect(replay).toBeEnabled();
	expect(
		await page.evaluate(
			() => (window as unknown as { nativeSpeech: unknown[] }).nativeSpeech.length
		)
	).toBe(1);
	expect(actions).toEqual(['start']); // Replay does not ask the AI for another reply.
	await expect(widget.getByRole('alert')).toHaveCount(0);
});

test('desktop speaker picker groups voices by age and preserves the browser preference', async ({
	page
}) => {
	await stubDesktopTts(page);
	let saved: unknown;
	await page.route('**/api/account/voice-chat', (route) => {
		saved = route.request().postDataJSON();
		return route.fulfill({ json: saved });
	});
	const settings = await mount(page, 'VoiceChatSettings', {
		preferences: {
			connectionId: null,
			voiceId: 'en_GB-alba-medium',
			desktopVoiceId: 'child-male'
		},
		connections: []
	});
	const speaker = settings.getByRole('combobox', { name: 'Speaker', exact: true });
	await expect(speaker).toHaveValue('child-male');
	// Only voices the host offers appear, grouped by age; Piper voices are not listed.
	expect(
		await speaker
			.locator('optgroup')
			.evaluateAll((groups) => groups.map((group) => (group as HTMLOptGroupElement).label))
	).toEqual(['Kids', 'Young adults', 'Older adults']);
	await expect(speaker.locator('option')).toHaveCount(4);
	await expect(
		settings.getByText('Speaks locally with Pocket TTS', { exact: false })
	).toBeVisible();
	await speaker.selectOption('senior-male');
	await settings.getByRole('button', { name: 'Preview speaker' }).click();
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { nativeSpeech: { voice: string }[] }).nativeSpeech)
		)
		.toEqual([expect.objectContaining({ voice: 'senior-male' })]);
	await expect(settings.getByRole('button', { name: 'Preview speaker' })).toBeVisible();
	await expect(settings.getByRole('alert')).toHaveCount(0);
	await settings.getByRole('button', { name: 'Save voice chat settings' }).click();
	await expect
		.poll(() => saved)
		.toEqual({
			connectionId: null,
			voiceId: 'en_GB-alba-medium',
			desktopVoiceId: 'senior-male'
		});
});

async function mount(page: Page, name: string, props: Record<string, unknown>) {
	await page.goto('/en/tts-lab');
	const mountComponent = () =>
		page.evaluate(
			async ({ name, props }) => {
				const harnessPath = '/tests/voice-chat-harness.ts';
				const { mountComponent } = await import(harnessPath);
				mountComponent(name, props);
			},
			{ name, props }
		);
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			await mountComponent();
			break;
		} catch (error) {
			// A cold Vite server can optimize more than one newly discovered dependency.
			if (
				attempt === 2 ||
				!(error instanceof Error) ||
				!error.message.includes('Execution context was destroyed')
			)
				throw error;
			await page.waitForLoadState('networkidle');
		}
	}
	return page.locator('#voice-harness');
}

async function stubSpeechWorkers(
	page: Page,
	loadDelay = 30,
	speech: {
		text: string;
		persianText?: string;
		language?: 'en' | 'fa' | null;
		confidence?: number;
		languageProbabilities?: { en: number; fa: number };
	} = {
		text: 'I go to the park yesterday.',
		language: 'en',
		confidence: 0.99,
		languageProbabilities: { en: 0.99, fa: 0.001 }
	},
	tts = { delay: 30, seconds: 0.05 }
) {
	await page.addInitScript(
		({ loadDelay, speech, tts }) => {
			const host = window as unknown as {
				stubBrowserSpeech?: boolean;
				sttRequests: { type?: string; mode?: string; language?: string }[];
				sttWorkers: { active: number; maxActive: number; startedWhileBrowserActive: number };
				browserSpeechActive?: number;
			};
			host.sttRequests = [];
			host.sttWorkers = { active: 0, maxActive: 0, startedWhileBrowserActive: 0 };
			if (!host.stubBrowserSpeech) {
				for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
					Object.defineProperty(window, name, { value: undefined, configurable: true });
				}
			}
			class SpeechWorker {
				onmessage: ((event: { data: unknown }) => void) | null = null;
				onerror = null;
				onmessageerror = null;
				closed = false;
				private isStt: boolean;
				constructor(private url: string | URL) {
					this.isStt = String(url).includes('speech.worker');
					if (this.isStt) {
						host.sttWorkers.active++;
						host.sttWorkers.maxActive = Math.max(host.sttWorkers.maxActive, host.sttWorkers.active);
						if (host.browserSpeechActive) host.sttWorkers.startedWhileBrowserActive++;
					}
				}
				postMessage(request: { id: number; type?: string; mode?: string; language?: string }) {
					if (String(this.url).includes('speech.worker'))
						host.sttRequests.push({
							type: request.type,
							mode: request.mode,
							language: request.language
						});
					setTimeout(
						() => {
							if (this.closed) return;
							if (String(this.url).includes('speech.worker')) {
								this.onmessage?.({
									data: {
										type: 'result',
										id: request.id,
										text:
											request.type === 'transcribe'
												? request.language === 'fa'
													? (speech.persianText ?? 'سلام، این متن فارسی است.')
													: speech.text
												: undefined,
										language: speech.language,
										confidence: speech.confidence,
										languageProbabilities: speech.languageProbabilities
									}
								});
							} else {
								const audioBytes = Math.round(tts.seconds * 16000) * 2;
								const bytes = new ArrayBuffer(44 + audioBytes);
								const view = new DataView(bytes);
								const ascii = (offset: number, text: string) =>
									[...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
								ascii(0, 'RIFF');
								view.setUint32(4, bytes.byteLength - 8, true);
								ascii(8, 'WAVE');
								ascii(12, 'fmt ');
								view.setUint32(16, 16, true);
								view.setUint16(20, 1, true);
								view.setUint16(22, 1, true);
								view.setUint32(24, 16000, true);
								view.setUint32(28, 32000, true);
								view.setUint16(32, 2, true);
								view.setUint16(34, 16, true);
								ascii(36, 'data');
								view.setUint32(40, audioBytes, true);
								this.onmessage?.({
									data: {
										type: 'result',
										id: request.id,
										blob: new Blob([bytes], { type: 'audio/wav' })
									}
								});
							}
						},
						request.type === 'load' ? loadDelay : this.isStt ? 30 : tts.delay
					);
				}
				terminate() {
					if (this.isStt && !this.closed) host.sttWorkers.active--;
					this.closed = true;
				}
			}
			Object.defineProperty(window, 'Worker', { value: SpeechWorker, configurable: true });
		},
		{ loadDelay, speech, tts }
	);
}

async function stubBrowserRecognition(
	page: Page,
	transcript: string,
	confidence = 0.96,
	error: string | null = null,
	session: { interim?: boolean; endBeforeStop?: boolean } = {}
) {
	await page.addInitScript(
		({ transcript, confidence, error, session }) => {
			const host = window as unknown as {
				stubBrowserSpeech: boolean;
				browserSpeechLocales: string[];
				browserSpeechActive: number;
			};
			host.stubBrowserSpeech = true;
			host.browserSpeechLocales = [];
			host.browserSpeechActive = 0;
			class Recognition {
				lang = '';
				continuous = false;
				interimResults = false;
				maxAlternatives = 1;
				onresult: ((event: unknown) => void) | null = null;
				onerror: ((event: unknown) => void) | null = null;
				onend: (() => void) | null = null;
				private active = false;
				private finish() {
					if (!this.active) return;
					this.active = false;
					host.browserSpeechActive--;
					this.onend?.();
				}
				start() {
					this.active = true;
					host.browserSpeechActive++;
					host.browserSpeechLocales.push(this.lang);
					if (error) {
						setTimeout(() => this.onerror?.({ error }), 20);
						return;
					}
					setTimeout(() => {
						if (!session.interim || this.interimResults) {
							this.onresult?.({
								resultIndex: 0,
								results: [{ isFinal: !session.interim, 0: { transcript, confidence } }]
							});
						}
						if (session.endBeforeStop) this.finish();
					}, 40);
				}
				stop() {
					setTimeout(() => this.finish(), 0);
				}
				abort() {
					this.finish();
				}
			}
			Object.defineProperty(window, 'webkitSpeechRecognition', {
				value: Recognition,
				configurable: true
			});
			Object.defineProperty(window, 'SpeechRecognition', {
				value: Recognition,
				configurable: true
			});
		},
		{ transcript, confidence, error, session }
	);
}

async function scriptedMicrophone(page: Page, voicedTurns = 2, denied = false) {
	await page.addInitScript(
		({ voicedTurns, denied }) => {
			const metrics = { opened: 0, stopped: 0, active: 0 };
			(window as unknown as { voiceMic: typeof metrics }).voiceMic = metrics;
			navigator.mediaDevices.getUserMedia = async () => {
				if (denied) throw new DOMException('Permission denied', 'NotAllowedError');
				const context = new AudioContext();
				await context.resume();
				const oscillator = context.createOscillator();
				const gain = context.createGain();
				const destination = context.createMediaStreamDestination();
				oscillator.frequency.value = 300;
				gain.gain.value = 0;
				oscillator.connect(gain);
				gain.connect(destination);
				oscillator.start();
				metrics.opened++;
				metrics.active++;
				if (metrics.opened <= voicedTurns) {
					gain.gain.setValueAtTime(0.12, context.currentTime + 0.2);
					gain.gain.setValueAtTime(0, context.currentTime + 0.9);
				}
				const track = destination.stream.getAudioTracks()[0];
				const stop = track.stop.bind(track);
				let stopped = false;
				track.stop = () => {
					if (!stopped) {
						stopped = true;
						metrics.stopped++;
						metrics.active--;
						oscillator.stop();
						void context.close();
					}
					stop();
				};
				return destination.stream;
			};
		},
		{ voicedTurns, denied }
	);
}

async function handsFreeHarness(
	page: Page,
	voicedTurns = 2,
	denied = false,
	speech?: Parameters<typeof stubSpeechWorkers>[2]
) {
	await stubSpeechWorkers(page, 30, speech);
	await scriptedMicrophone(page, voicedTurns, denied);
	const actions: string[] = [];
	const answers: string[] = [];
	await page.route('**/api/account/voice-chat', (route) =>
		route.fulfill({ json: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE } })
	);
	await page.route('**/api/voice-chat', async (route) => {
		const input = route.request().postDataJSON();
		actions.push(input.action);
		if (input.action === 'reply' || input.action === 'help') answers.push(input.text);
		// Capture must already be off before any text is sent to the model.
		expect(
			await page.evaluate(
				() => (window as unknown as { voiceMic: { active: number } }).voiceMic.active
			)
		).toBe(0);
		const text =
			input.action === 'correct' ? 'Use the past tense: I went.' : 'Hello! How was your day?';
		const messages = [...input.context.messages];
		if (input.action === 'reply' || input.action === 'help')
			messages.push({ role: 'user', content: input.text });
		if (input.action !== 'correct') messages.push({ role: 'assistant', content: text });
		await route.fulfill({ json: { text, compacted: false, context: { summary: '', messages } } });
	});
	const widget = await mount(page, 'VoiceChat', { configuration: DEFAULT_VOICE_CHAT });
	return { widget, actions, answers };
}

for (const desktop of [false, true]) {
	for (const available of [true, false]) {
		test(`${desktop ? 'desktop' : 'website'} English uses ${available ? 'Web Speech' : 'the selected local fallback'} without language detection`, async ({
			page
		}) => {
			if (desktop) await stubDesktopTts(page);
			const primary = 'This is the browser transcript.';
			const fallback = 'This is the local transcript.';
			if (available) await stubBrowserRecognition(page, primary);
			const { widget, answers } = await handsFreeHarness(page, 1, false, { text: fallback });
			await expect(widget.getByRole('combobox', { name: 'Speech recognition' })).toHaveCount(0);
			await widget.getByLabel(/Hands-free/).check();
			await widget.getByRole('button', { name: 'Start conversation' }).click();
			await expect
				.poll(() => answers, { timeout: 10000 })
				.toEqual([available ? primary : fallback]);
			const requests = await page.evaluate(
				() => (window as unknown as { sttRequests: { type: string; mode: string }[] }).sttRequests
			);
			expect(requests.filter((request) => request.type === 'detect')).toEqual([]);
			expect(requests.map((request) => request.mode)).toEqual(
				available ? [] : ['english', 'english']
			);
			if (available)
				expect(
					await page.evaluate(
						() => (window as unknown as { browserSpeechLocales: string[] }).browserSpeechLocales
					)
				).toEqual(['en-US']);
		});
	}

	for (const available of [true, false]) {
		test(`${desktop ? 'desktop' : 'website'} Ask in Persian ${available ? 'uses Web Speech' : 'recovers when Web Speech is unavailable'}`, async ({
			page
		}) => {
			if (desktop) await stubDesktopTts(page);
			const persian = 'چطور بگم امروز خسته‌ام؟';
			if (available) await stubBrowserRecognition(page, persian);
			const { widget, actions, answers } = await handsFreeHarness(page, 1, false, {
				text: 'English fallback should not be used.',
				persianText: persian
			});
			const webStt = await page.evaluate(async () => {
				const path = '/src/lib/features/speaking-practice/stt-config.ts';
				return (await import(path)).WEB_STT;
			});
			await widget.getByRole('button', { name: 'Start conversation' }).click();
			await expect(widget.getByRole('button', { name: 'Ask for help in Persian' })).toBeEnabled();
			await widget.getByRole('button', { name: 'Ask for help in Persian' }).click();
			await expect(widget.getByRole('button', { name: /Stop & send/ })).toBeVisible();
			await expect
				.poll(async () => widget.getByRole('button', { name: /Stop & send/ }).textContent())
				.toContain('1s');
			await widget.getByRole('button', { name: /Stop & send/ }).click();
			const moonshineWithoutBrowser = !available && webStt === 'moonshine';
			if (moonshineWithoutBrowser) {
				await expect(widget.getByRole('alert')).toContainText('Persian speech needs Web Speech');
				await expect(widget.getByRole('textbox', { name: 'Your Persian question' })).toBeEnabled();
				expect(answers).toEqual([]);
				await widget.getByRole('textbox', { name: 'Your Persian question' }).fill(persian);
				await widget.getByRole('textbox', { name: 'Your Persian question' }).press('Enter');
			}
			await expect.poll(() => answers, { timeout: 10000 }).toEqual([persian]);
			expect(actions).toEqual(['start', 'help']);
			const requests = await page.evaluate(
				() => (window as unknown as { sttRequests: { type: string; mode: string }[] }).sttRequests
			);
			expect(requests.filter((request) => request.type === 'detect')).toEqual([]);
			expect(requests.map((request) => request.mode)).toEqual(
				available || moonshineWithoutBrowser ? [] : ['persian', 'persian']
			);
			if (available)
				expect(
					await page.evaluate(
						() => (window as unknown as { browserSpeechLocales: string[] }).browserSpeechLocales
					)
				).toEqual(['fa-IR']);
			await expect(widget.getByRole('button', { name: 'Ask for help in Persian' })).toBeEnabled();
			await expect(widget.getByRole('textbox', { name: 'Your answer' })).toBeEnabled();
			if (available) {
				await widget.getByRole('button', { name: 'Speak', exact: true }).click();
				await expect
					.poll(() =>
						page.evaluate(
							() => (window as unknown as { browserSpeechLocales: string[] }).browserSpeechLocales
						)
					)
					.toEqual(['fa-IR', 'en-US']);
				await widget.getByRole('button', { name: 'Cancel', exact: true }).click();
			}
		});
	}
}
test('typed answers use Enter to send but preserve newlines and IME composition', async ({
	page
}) => {
	const { widget, actions, answers } = await handsFreeHarness(page, 0);
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	const answer = widget.getByRole('textbox', { name: 'Your answer' });
	await expect(answer).toBeEnabled();
	await expect(widget.getByRole('button', { name: 'Send answer', exact: true })).toHaveCount(0);
	await expect(answer).toHaveAttribute('enterkeyhint', 'send');
	await answer.press('Enter');
	await answer.fill('   ');
	await answer.press('Enter');
	await answer.fill('سلام');
	await answer.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
	await answer.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 });
	await answer.dispatchEvent('keydown', { key: 'Enter', repeat: true });
	await answer.press('End');
	await answer.press('Shift+Enter');
	await answer.press('H');
	await expect(answer).toHaveValue('سلام\nH');
	expect(actions).toEqual(['start']);
	await answer.press('Enter');
	await expect.poll(() => answers).toEqual(['سلام\nH']);
	await expect(answer).toHaveValue('');
});

test('hands-free sends on silence, repeats turns with one audio context, and pauses cleanly', async ({
	page
}) => {
	const { widget, actions } = await handsFreeHarness(page);
	await widget.getByLabel(/Hands-free —/).check();
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect.poll(() => actions, { timeout: 15_000 }).toEqual(['start', 'reply', 'reply']);
	await expect(widget.getByRole('button', { name: /Stop & send/ })).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { voiceMic: { opened: number } }).voiceMic.opened)
		)
		.toBe(3);
	await widget.getByRole('button', { name: 'Pause hands-free', exact: true }).click();
	await expect(widget.getByLabel(/Hands-free —/)).not.toBeChecked();
	await expect(widget.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
	expect(await page.evaluate(() => (window as unknown as { voiceMic: unknown }).voiceMic)).toEqual({
		opened: 3,
		stopped: 3,
		active: 0
	});
	await page.waitForTimeout(650);
	expect(actions).toEqual(['start', 'reply', 'reply']);
});

test('hands-free respects transcript review and corrections can interrupt listening', async ({
	page
}) => {
	const { widget, actions } = await handsFreeHarness(page, 1);
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
	await widget.getByLabel('Review transcript before sending').check();
	await widget.getByLabel(/Hands-free —/).check();
	await expect(widget.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
		'I go to the park yesterday.',
		{ timeout: 8_000 }
	);
	expect(actions).toEqual(['start']);
	await widget.getByRole('button', { name: 'Replay', exact: true }).click();
	await expect(widget.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
	await page.waitForTimeout(650);
	await expect(widget.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
		'I go to the park yesterday.'
	);
	expect(
		await page.evaluate(
			() => (window as unknown as { voiceMic: { opened: number } }).voiceMic.opened
		)
	).toBe(1);
	await widget.getByRole('textbox', { name: 'Your answer' }).press('Enter');
	await expect(widget.getByRole('button', { name: /Stop & review/ })).toBeVisible();
	await widget.getByRole('button', { name: 'Correct my last answer' }).click();
	await expect(widget.getByText('Use the past tense: I went.')).toBeVisible();
	await expect(widget.getByRole('button', { name: /Stop & review/ })).toBeVisible();
	expect(actions).toEqual(['start', 'reply', 'correct']);
	await widget.getByRole('button', { name: 'New conversation' }).click();
	expect(
		await page.evaluate(
			() => (window as unknown as { voiceMic: { active: number } }).voiceMic.active
		)
	).toBe(0);
	await expect(widget.getByLabel(/Hands-free —/)).not.toBeChecked();
});

test('hands-free pauses on silence without transcribing or sending an empty answer', async ({
	page
}) => {
	const { widget, actions } = await handsFreeHarness(page, 0);
	await widget.getByLabel(/Hands-free —/).check();
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByText(/No speech detected/)).toBeVisible({ timeout: 18_000 });
	await expect(widget.getByLabel(/Hands-free —/)).not.toBeChecked();
	expect(actions).toEqual(['start']);
	expect(
		await page.evaluate(
			() => (window as unknown as { voiceMic: { active: number } }).voiceMic.active
		)
	).toBe(0);
});

test('hands-free stops on microphone denial', async ({ page }) => {
	const { widget, actions } = await handsFreeHarness(page, 0, true);
	await widget.getByLabel(/Hands-free —/).check();
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByRole('alert')).toContainText('Microphone access was denied');
	await expect(widget.getByLabel(/Hands-free —/)).not.toBeChecked();
	expect(actions).toEqual(['start']);
});

test('hiding the page releases the microphone and never resumes automatically', async ({
	page
}) => {
	const { widget, actions } = await handsFreeHarness(page, 0);
	await widget.getByLabel(/Hands-free —/).check();
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByRole('button', { name: /Stop & send/ })).toBeVisible();
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(widget.getByLabel(/Hands-free —/)).not.toBeChecked();
	expect(
		await page.evaluate(
			() => (window as unknown as { voiceMic: { active: number } }).voiceMic.active
		)
	).toBe(0);
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: false });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.waitForTimeout(650);
	expect(actions).toEqual(['start']);
	await expect(widget.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
});

test('microphone starts from the tap even while local speech is still loading', async ({
	page
}) => {
	await stubSpeechWorkers(page, 60_000);
	await page.route('**/api/account/voice-chat', (route) =>
		route.fulfill({ json: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE } })
	);
	await page.route('**/api/voice-chat', (route) =>
		route.fulfill({
			json: {
				text: 'Hello, how are you?',
				compacted: false,
				context: { summary: '', messages: [{ role: 'assistant', content: 'Hello, how are you?' }] }
			}
		})
	);
	const widget = await mount(page, 'VoiceChat', { configuration: DEFAULT_VOICE_CHAT });
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
	await widget.getByRole('button', { name: 'Speak', exact: true }).click();
	await expect(widget.getByRole('button', { name: /Stop & send/ })).toBeVisible();
	await widget.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(widget.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
});

test('student microphone, review, dialogue, correction, replay and reset work together', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await stubSpeechWorkers(page);
	const actions: string[] = [];
	await page.route('**/api/account/voice-chat', (route) =>
		route.fulfill({ json: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE } })
	);
	await page.route('**/api/voice-chat', (route) => {
		const input = route.request().postDataJSON();
		actions.push(input.action);
		const text =
			input.action === 'start'
				? 'Hello! What did you do yesterday?'
				: input.action === 'correct'
					? 'Say, I went to the park yesterday. Use the past tense.'
					: 'That sounds nice. What did you enjoy there?';
		const messages = [...input.context.messages];
		if (input.action === 'reply') messages.push({ role: 'user', content: input.text });
		if (input.action !== 'correct') messages.push({ role: 'assistant', content: text });
		return route.fulfill({ json: { text, compacted: false, context: { summary: '', messages } } });
	});
	const widget = await mount(page, 'VoiceChat', { configuration: DEFAULT_VOICE_CHAT });
	expect(await widget.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
	await widget.getByLabel('Review transcript before sending').check();
	await widget.getByRole('button', { name: 'Speak', exact: true }).click();
	await expect(widget.getByRole('button', { name: /Stop & review/ })).toBeVisible();
	await expect
		.poll(async () => widget.getByRole('button', { name: /Stop & review/ }).textContent())
		.toContain('2s');
	await widget.getByRole('button', { name: /Stop & review/ }).click();
	await expect(widget.getByRole('textbox', { name: 'Your answer' })).toHaveValue(
		'I go to the park yesterday.'
	);
	expect(actions).toEqual(['start']);
	await widget.getByRole('textbox', { name: 'Your answer' }).press('Enter');
	await expect(widget.getByRole('button', { name: 'Correct my last answer' })).toBeEnabled();
	await widget.getByRole('button', { name: 'Correct my last answer' }).click();
	await expect(
		widget.getByText('Say, I went to the park yesterday. Use the past tense.')
	).toBeVisible();
	await expect(widget.getByRole('button', { name: 'Replay', exact: true })).toBeEnabled();
	await widget.getByRole('button', { name: 'Replay', exact: true }).click();
	await expect(widget.getByRole('button', { name: 'Speak', exact: true })).toBeEnabled();
	expect(actions).toEqual(['start', 'reply', 'correct']);
	await widget.getByRole('button', { name: 'New conversation' }).click();
	await expect(widget.getByRole('button', { name: 'Start conversation' })).toBeVisible();
	await expect(widget.getByRole('log')).toHaveCount(0);
});

test('a failed AI reply preserves the draft and cancellation ignores stale responses', async ({
	page
}) => {
	await stubSpeechWorkers(page);
	await page.route('**/api/account/voice-chat', (route) =>
		route.fulfill({ json: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE } })
	);
	await page.route('**/api/voice-chat', (route) => {
		const input = route.request().postDataJSON();
		if (input.action === 'reply')
			return route.fulfill({ status: 502, json: { error: 'Provider temporarily unavailable.' } });
		return route.fulfill({
			json: {
				text: 'Hello, how are you?',
				compacted: false,
				context: { summary: '', messages: [{ role: 'assistant', content: 'Hello, how are you?' }] }
			}
		});
	});
	const widget = await mount(page, 'VoiceChat', { configuration: DEFAULT_VOICE_CHAT });
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByRole('textbox')).toBeEnabled();
	await widget.getByRole('textbox').fill('I am doing well.');
	await widget.getByRole('textbox', { name: 'Your answer' }).press('Enter');
	await expect(widget.getByRole('alert')).toContainText('Provider temporarily unavailable.');
	await expect(widget.getByRole('textbox')).toHaveValue('I am doing well.');
	await expect(widget.getByRole('log').getByText('You', { exact: true })).toHaveCount(0);
	await page.unroute('**/api/voice-chat');
	let resolveRequest!: () => void;
	const pending = new Promise<void>((resolve) => {
		resolveRequest = resolve;
	});
	await page.route('**/api/voice-chat', async (route) => {
		await pending;
		await route
			.fulfill({
				json: { text: 'Stale reply', compacted: false, context: { summary: '', messages: [] } }
			})
			.catch(() => {});
	});
	await widget.getByRole('textbox', { name: 'Your answer' }).press('Enter');
	await widget.getByRole('button', { name: 'Cancel', exact: true }).click();
	resolveRequest();
	await expect(widget.getByRole('textbox')).toBeEnabled();
	await expect(widget.getByText('Stale reply')).toHaveCount(0);
});

test('settings save a separate AI model connection and speaker', async ({ page }) => {
	await stubSpeechWorkers(page);
	let saved: unknown;
	await page.route('**/api/account/voice-chat', (route) => {
		saved = route.request().postDataJSON();
		return route.fulfill({ json: saved });
	});
	const settings = await mount(page, 'VoiceChatSettings', {
		preferences: { connectionId: null, voiceId: DEFAULT_VOICE_CHAT_VOICE },
		connections: [
			{ id: 'voice-model', label: 'My voice model', model: 'test-model', isAssistant: false }
		]
	});
	await settings.getByRole('combobox', { name: 'Voice chat AI model' }).selectOption('voice-model');
	await settings
		.getByRole('combobox', { name: 'Speaker', exact: true })
		.selectOption('en_GB-alba-medium');
	await settings.getByRole('button', { name: 'Save voice chat settings' }).click();
	await expect(settings.getByRole('status')).toContainText('Voice chat settings saved');
	expect(saved).toEqual({ connectionId: 'voice-model', voiceId: 'en_GB-alba-medium' });
	await settings.getByRole('button', { name: 'Preview speaker' }).click();
	await expect(settings.getByRole('button', { name: 'Preview speaker' })).toBeVisible();
	for (const voiceId of ['en_US-libritts-high', 'en_US-libritts_r-medium']) {
		await settings.getByRole('combobox', { name: 'Speaker', exact: true }).selectOption(voiceId);
		await settings.getByRole('button', { name: 'Save voice chat settings' }).click();
		await expect.poll(() => saved).toEqual({ connectionId: 'voice-model', voiceId });
		await expect(settings.getByRole('button', { name: 'Save voice chat settings' })).toBeEnabled();
	}
});

test('polished voice widget fits desktop and narrow layouts with keyboard-accessible preferences', async ({
	page
}, testInfo) => {
	await page.setViewportSize({ width: 1100, height: 1000 });
	const { widget } = await handsFreeHarness(page);
	await widget.evaluate((element) => {
		element.style.maxWidth = '720px';
		element.style.margin = '24px auto';
	});
	await expect(widget.getByText('Your space to speak.')).toBeVisible();
	await expect(widget.getByRole('button', { name: 'Start conversation' })).toBeEnabled();
	await expect(widget.getByRole('combobox', { name: 'Speech recognition' })).toHaveCount(0);
	const handsFree = widget.getByLabel(/Hands-free —/);
	await handsFree.focus();
	await handsFree.press('Space');
	await expect(handsFree).toBeChecked();
	await handsFree.press('Space');
	await expect(handsFree).not.toBeChecked();
	await widget.screenshot({
		path: testInfo.outputPath('welcome-desktop.png'),
		animations: 'disabled'
	});
	for (const width of [390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		expect(
			await widget
				.locator('.voice-chat')
				.evaluate((element) => element.scrollWidth <= element.clientWidth)
		).toBe(true);
		const startBounds = await widget
			.getByRole('button', { name: 'Start conversation' })
			.boundingBox();
		expect(startBounds!.height).toBeGreaterThanOrEqual(44);
	}
	await widget.screenshot({
		path: testInfo.outputPath('welcome-mobile.png'),
		animations: 'disabled'
	});
	await widget.locator('summary').click();
	await expect(
		widget.getByText(/Browser recognition may use an online speech service/)
	).toBeVisible();
	await widget.getByRole('button', { name: 'Start conversation' }).click();
	await expect(widget.getByRole('button', { name: 'Ask for help in Persian' })).toBeEnabled();
	expect(
		await widget
			.locator('.voice-chat')
			.evaluate((element) => element.scrollWidth <= element.clientWidth)
	).toBe(true);
});

test('real VITS worker produces two WAV replies with a warm model', async ({ page }) => {
	test.skip(
		process.env.VOICE_CHAT_TEST_REAL_SPEECH !== '1',
		'Opt in to downloading speech models.'
	);
	test.setTimeout(240_000);
	await page.goto('/en/tts-lab');
	const synthesizePair = () =>
		page.evaluate(async (voiceId) => {
			const path = '/src/lib/features/voice-chat/tts-engine.ts';
			const { VitsSpeechEngine } = await import(path);
			const messages: string[] = [];
			const engine = new VitsSpeechEngine((status: { message: string }) =>
				messages.push(status.message)
			);
			try {
				const first = await engine.synthesize(
					'Hello! What would you like to talk about today?',
					voiceId
				);
				const before = messages.length;
				const second = await engine.synthesize(
					'That sounds interesting. Tell me more about your day.',
					voiceId
				);
				const header = new TextDecoder().decode((await first.arrayBuffer()).slice(0, 4));
				return {
					first: first.size,
					second: second.size,
					header,
					warmMessages: messages.slice(before)
				};
			} finally {
				engine.dispose();
			}
		}, process.env.VOICE_CHAT_TEST_VOICE ?? DEFAULT_VOICE_CHAT_VOICE);
	let result;
	try {
		result = await synthesizePair();
	} catch (error) {
		// The real worker can discover ONNX dependencies that the stubbed UI tests never load.
		if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed'))
			throw error;
		await page.waitForLoadState('domcontentloaded');
		result = await synthesizePair();
	}
	expect(result.header).toBe('RIFF');
	expect(result.first).toBeGreaterThan(1000);
	expect(result.second).toBeGreaterThan(1000);
	expect(
		result.warmMessages.some((message: string) => /Downloading|Loading the voice/.test(message))
	).toBe(false);
});
