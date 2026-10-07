import { isVoiceChatVoiceId, type VoiceChatPreferences } from './voices';
import type {
	SpeechChunk,
	SpeechEngine,
	StreamingSpeechEngine,
	VoiceResponse,
	VoiceStatus
} from './tts-types';
import { getDesktopTts, DesktopSpeechEngine, resolveDesktopVoice } from './desktop-tts-engine';
import { streamStartSeconds } from './stream-buffer';

export type { SpeechEngine } from './tts-types';

const DESKTOP_PLAYBACK_RATE = 1;
/** Scheduling lead for streamed audio, absorbing main-thread delay before the first sample. */
const STREAM_LEAD_SECONDS = 0.05;

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

/** The engine when its host allows playing audio as it arrives, otherwise null. */
export function streamingEngine(engine: SpeechEngine): StreamingSpeechEngine | null {
	return engine instanceof DesktopSpeechEngine && engine.streams ? engine : null;
}

/**
 * Generates and plays text. On streaming hosts (desktop Pocket TTS) playback starts while the
 * rest of the reply is still being generated; other engines generate the whole reply first.
 * onAudio receives the complete WAV, for replay, as soon as generation ends. Resolves once
 * playback ends or is stopped, with false if `current` reports the request was superseded.
 */
export async function speakWith(
	engine: SpeechEngine,
	playback: VoicePlayback | null,
	text: string,
	voiceId: string,
	options: {
		onProgress?: (fraction: number) => void;
		onAudio?: (blob: Blob) => void;
		current?: () => boolean;
	} = {}
): Promise<boolean> {
	const current = options.current ?? (() => true);
	const streaming = playback?.canStream() ? streamingEngine(engine) : null;
	if (playback && streaming) {
		const stream = playback.stream(options.onProgress);
		let blob: Blob;
		try {
			blob = await streaming.synthesizeStream(text, voiceId, (chunk) => stream.push(chunk));
		} catch (error) {
			stream.cancel();
			throw error;
		}
		if (!current()) {
			stream.cancel();
			return false;
		}
		options.onAudio?.(blob);
		await stream.finish();
		return true;
	}
	const blob = await engine.synthesize(text, voiceId);
	if (!current()) return false;
	options.onAudio?.(blob);
	if (!playback) throw new Error('Tap Replay to enable audio.');
	await playback.play(blob, options.onProgress);
	return true;
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

	/** Streamed replies need audio that is already unlocked; otherwise use play() after generation. */
	canStream(): boolean {
		return this.context?.state === 'running';
	}

	/** Plays a reply while it is still being generated. stop() and dispose() end it. */
	stream(onProgress?: (fraction: number) => void): StreamingPlayback {
		this.stop();
		const context = this.context;
		if (!context || context.state !== 'running')
			throw new Error('Tap Replay to enable audio playback.');
		const stop = () => player.cancel();
		const player = new StreamPlayer(context, onProgress, () => {
			if (this.finish === stop) this.finish = null;
		});
		this.finish = stop;
		return player;
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

export interface StreamingPlayback {
	/** Adds audio in order; playback starts once enough is buffered (see streamStartSeconds). */
	push(chunk: SpeechChunk): void;
	/** Marks the end of the reply; resolves when all of it has played or playback was stopped. */
	finish(): Promise<void>;
	/** Stops scheduled audio immediately and resolves a pending finish(). */
	cancel(): void;
}

/**
 * Schedules chunks back to back on the unlocked context at their native rate, so pitch and
 * timing match buffered playback. If generation falls behind, a late chunk starts after a short
 * gap rather than overlapping. Progress is played audio over the reply's estimated length until
 * generation ends, then over its exact length; it never decreases.
 */
class StreamPlayer implements StreamingPlayback {
	private waiting: AudioBuffer[] = [];
	private sources = new Set<AudioBufferSourceNode>();
	/** Scheduled audio: context start/end times and the reply position where each begins. */
	private segments: { start: number; end: number; offset: number }[] = [];
	private received = 0;
	private lastChunk = 0;
	private progress: number | null = null;
	private readonly requested = performance.now();
	private playing = false;
	private finished = false;
	private closed = false;
	private reported = 0;
	private frame: number | null = null;
	private resolveDone!: () => void;
	private readonly done = new Promise<void>((resolve) => (this.resolveDone = resolve));

	constructor(
		private context: AudioContext,
		private onProgress: ((fraction: number) => void) | undefined,
		private onClose: () => void
	) {}

	push(chunk: SpeechChunk): void {
		if (this.closed || this.finished || !chunk.samples.length) return;
		const buffer = this.context.createBuffer(1, chunk.samples.length, chunk.sampleRate);
		buffer.copyToChannel(chunk.samples as Float32Array<ArrayBuffer>, 0);
		this.received += buffer.duration;
		this.lastChunk = buffer.duration;
		if (chunk.progress !== null) this.progress = chunk.progress;
		if (this.playing) {
			this.schedule(buffer);
			return;
		}
		this.waiting.push(buffer);
		const needed = streamStartSeconds({
			received: this.received,
			elapsed: (performance.now() - this.requested) / 1000,
			progress: this.progress,
			lastChunk: this.lastChunk
		});
		if (this.received >= needed) this.start();
	}

	finish(): Promise<void> {
		if (!this.closed && !this.finished) {
			this.finished = true;
			if (this.playing) this.settle();
			else this.start();
		}
		return this.done;
	}

	cancel(): void {
		if (this.closed) return;
		for (const source of this.sources) {
			source.onended = null;
			source.stop();
			source.disconnect();
		}
		this.close();
	}

	private start() {
		this.playing = true;
		const waiting = this.waiting;
		this.waiting = [];
		for (const buffer of waiting) this.schedule(buffer);
		if (!this.segments.length) {
			this.settle();
			return;
		}
		this.onProgress?.(0);
		const update = () => {
			if (this.closed) return;
			this.report();
			this.frame = requestAnimationFrame(update);
		};
		this.frame = requestAnimationFrame(update);
	}

	private schedule(buffer: AudioBuffer) {
		const last = this.segments.at(-1);
		const start = Math.max(last?.end ?? 0, this.context.currentTime + STREAM_LEAD_SECONDS);
		const source = this.context.createBufferSource();
		source.buffer = buffer;
		source.connect(this.context.destination);
		source.onended = () => {
			source.disconnect();
			this.sources.delete(source);
			this.settle();
		};
		source.start(start);
		this.sources.add(source);
		this.segments.push({
			start,
			end: start + buffer.duration,
			offset: last ? last.offset + (last.end - last.start) : 0
		});
	}

	/** Completes once the reply is finished and every scheduled chunk has ended. */
	private settle() {
		if (this.closed || !this.finished || this.sources.size) return;
		this.onProgress?.(1);
		this.close();
	}

	private report() {
		const now = this.context.currentTime;
		let played = 0;
		for (const segment of this.segments) {
			if (now <= segment.start) break;
			played = segment.offset + Math.min(now, segment.end) - segment.start;
		}
		const total = this.finished
			? this.received
			: Math.max(this.received, this.progress ? this.received / this.progress : this.received);
		const fraction = Math.min(this.finished ? 1 : 0.99, played / total);
		if (fraction > this.reported) {
			this.reported = fraction;
			this.onProgress?.(fraction);
		}
	}

	private close() {
		this.closed = true;
		if (this.frame !== null) cancelAnimationFrame(this.frame);
		this.frame = null;
		this.sources.clear();
		this.waiting = [];
		this.onClose();
		this.resolveDone();
	}
}
