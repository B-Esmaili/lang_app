import { isVoiceChatVoiceId, type VoiceChatPreferences } from './voices';
import type { SpeechEngine, VoiceResponse, VoiceStatus } from './tts-types';
import { getDesktopTts, DesktopSpeechEngine, resolveDesktopVoice } from './desktop-tts-engine';

export type { SpeechEngine } from './tts-types';

const DESKTOP_PLAYBACK_RATE = 1;

/** Choose at use time: SSR and regular browsers never need a native bridge. */
export function createSpeechEngine(onStatus?: (status: VoiceStatus) => void): SpeechEngine {
	const native = getDesktopTts();
	return native ? new DesktopSpeechEngine(native, onStatus) : new VitsSpeechEngine(onStatus);
}

/** The voice for whichever engine createSpeechEngine selects: the saved desktop
 * voice on a Pocket TTS host, otherwise the saved browser (Piper) speaker. */
export function speechVoiceFor(
	preferences: Pick<VoiceChatPreferences, 'voiceId' | 'desktopVoiceId'>
): string {
	const native = getDesktopTts();
	return native ? resolveDesktopVoice(native, preferences.desktopVoiceId) : preferences.voiceId;
}

/** One lazy worker, one loaded voice. Closing/cancelling releases all WASM memory. */
export class VitsSpeechEngine {
	private worker: Worker | null = null;
	private nextId = 0;
	private pending: {
		id: number;
		resolve: (blob: Blob) => void;
		reject: (error: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	} | null = null;

	constructor(private onStatus?: (status: VoiceStatus) => void) {}

	synthesize(text: string, voiceId: string): Promise<Blob> {
		if (this.pending) return Promise.reject(new Error('Wait for the current spoken reply.'));
		if (!isVoiceChatVoiceId(voiceId))
			return Promise.reject(new Error('Choose an available English speaker.'));
		return new Promise((resolve, reject) => {
			try {
				const worker = this.getWorker();
				const id = ++this.nextId;
				const timer = setTimeout(
					() =>
						this.reset(
							new Error(
								'The speaker took too long to load or speak. Check your connection and try Replay.'
							)
						),
					180_000
				);
				this.pending = { id, resolve, reject, timer };
				worker.postMessage({ id, text, voiceId });
			} catch (error) {
				const failure = error instanceof Error ? error : new Error('The voice could not start.');
				this.reset(failure);
				reject(failure);
			}
		});
	}

	cancel(): void {
		this.reset(new DOMException('Voice cancelled.', 'AbortError'));
	}
	dispose(): void {
		this.cancel();
		this.onStatus = undefined;
	}

	private getWorker(): Worker {
		if (this.worker) return this.worker;
		const worker = new Worker(new URL('./vits.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = ({ data }: MessageEvent<VoiceResponse>) => {
			if (this.worker !== worker || data.id !== this.pending?.id) return;
			if (data.type === 'status') {
				this.onStatus?.(data.status);
				return;
			}
			if (data.type === 'error') {
				this.reset(new Error(data.message));
				return;
			}
			const pending = this.pending;
			this.pending = null;
			clearTimeout(pending.timer);
			pending.resolve(data.blob);
		};
		worker.onerror = (event) => {
			event.preventDefault();
			if (this.worker === worker)
				this.reset(new Error('The local speaker could not start. Please try Replay.'));
		};
		worker.onmessageerror = () => {
			if (this.worker === worker) this.reset(new Error('The spoken reply could not be read.'));
		};
		this.worker = worker;
		return worker;
	}

	private reset(error: Error) {
		this.worker?.terminate();
		this.worker = null;
		if (this.pending) {
			clearTimeout(this.pending.timer);
			this.pending.reject(error);
			this.pending = null;
		}
	}
}

/** Unlock on a user gesture so delayed AI replies can play on Android Chrome. */
export class VoicePlayback {
	private context: AudioContext | null = null;
	private source: AudioBufferSourceNode | null = null;
	private finish: (() => void) | null = null;
	private generation = 0;

	async unlock(): Promise<void> {
		this.context ??= new AudioContext();
		if (this.context.state === 'suspended') await this.context.resume();
	}

	/** Borrow the already-unlocked context; recorders must not close it between automatic turns. */
	recordingContext(): AudioContext {
		if (!this.context || this.context.state !== 'running')
			throw new Error('Tap Speak or enable Hands-free again to resume microphone audio.');
		return this.context;
	}

	async play(blob: Blob, onProgress?: (fraction: number) => void): Promise<void> {
		this.stop();
		const generation = this.generation;
		const context = this.context;
		if (!context || context.state !== 'running')
			throw new Error('Tap Replay to enable audio playback.');
		if (getDesktopTts()) return this.playDesktop(blob, context, onProgress);
		const buffer = await context.decodeAudioData(await blob.arrayBuffer());
		if (generation !== this.generation) return;
		await new Promise<void>((resolve) => {
			const source = context.createBufferSource();
			let frame: number | null = null;
			const finish = () => {
				if (frame !== null) cancelAnimationFrame(frame);
				resolve();
			};
			source.buffer = buffer;
			source.connect(context.destination);
			this.source = source;
			this.finish = finish;
			source.onended = () => {
				onProgress?.(1);
				source.disconnect();
				if (this.source === source) {
					this.source = null;
					this.finish = null;
				}
				finish();
			};
			source.start();
			const startedAt = context.currentTime;
			onProgress?.(0);
			const update = () => {
				if (this.source !== source) return;
				onProgress?.(Math.min(1, (context.currentTime - startedAt) / buffer.duration));
				frame = requestAnimationFrame(update);
			};
			frame = requestAnimationFrame(update);
		});
	}

	private playDesktop(
		blob: Blob,
		context: AudioContext,
		onProgress?: (fraction: number) => void
	): Promise<void> {
		// Keep the reference voice's native timing. If the rate is adjusted, the media element
		// preserves pitch rather than changing the speaker's register.
		return new Promise<void>((resolve, reject) => {
			const element = new Audio();
			const url = URL.createObjectURL(blob);
			let source: MediaElementAudioSourceNode | null = null;
			let settled = false;
			let frame: number | null = null;
			const finish = (error?: unknown) => {
				if (settled) return;
				settled = true;
				if (frame !== null) cancelAnimationFrame(frame);
				element.onended = null;
				element.onerror = null;
				element.onplaying = null;
				element.pause();
				element.removeAttribute('src');
				element.load();
				source?.disconnect();
				URL.revokeObjectURL(url);
				if (this.finish === cancel) this.finish = null;
				if (error) reject(error);
				else resolve();
			};
			const cancel = () => finish();
			this.finish = cancel;
			element.onended = () => {
				onProgress?.(1);
				finish();
			};
			element.onerror = () =>
				finish(new Error('The spoken reply could not be played. Please try Replay.'));
			element.onplaying = () => {
				onProgress?.(0);
				const update = () => {
					if (settled) return;
					if (Number.isFinite(element.duration) && element.duration > 0)
						onProgress?.(Math.min(1, element.currentTime / element.duration));
					frame = requestAnimationFrame(update);
				};
				frame = requestAnimationFrame(update);
			};
			try {
				element.src = url;
				element.playbackRate = DESKTOP_PLAYBACK_RATE;
				element.preservesPitch = true;
				// Keep playback on the context unlocked by the initial user gesture.
				source = context.createMediaElementSource(element);
				source.connect(context.destination);
				void element.play().catch(finish);
			} catch (error) {
				finish(error);
			}
		});
	}

	stop(): void {
		this.generation++;
		if (this.source) {
			this.source.onended = null;
			this.source.stop();
			this.source.disconnect();
			this.source = null;
		}
		this.finish?.();
		this.finish = null;
	}

	dispose(): void {
		this.stop();
		if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
		this.context = null;
	}
}
