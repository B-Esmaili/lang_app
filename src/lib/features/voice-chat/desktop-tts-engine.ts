import type { SpeechChunk, StreamingSpeechEngine, VoiceStatus } from './tts-types';
import { DESKTOP_VOICE_CHAT_VOICES, type DesktopVoiceId } from './voices';

export type DesktopVoice = {
	id: string;
	label: string;
	age: 'child' | 'young' | 'middle' | 'senior';
	gender: 'female' | 'male';
};

/** Version 2 of the host's TTS capability: Pocket TTS with a voice catalog. */
export type DesktopTts = {
	version: 2;
	engine: 'pocket-tts';
	voices: readonly DesktopVoice[];
	defaultVoice: string;
	/** Version 1: chunk events arrive while generation continues and may be played immediately. */
	streaming?: { version: number };
	generate(id: number, text: string, voice: string): Promise<void>;
	cancel(id: number): Promise<void>;
};

declare global {
	interface Window {
		aiChatDesktop?: { version: 2; tts: DesktopTts };
	}
}

type DesktopEvent = {
	type: 'chunk' | 'progress' | 'complete' | 'error';
	id: number;
	pcm?: string;
	sampleRate?: number;
	progress?: number;
	sampleCount?: number;
	message?: string;
};

/** Check the individual capability and version; older or unknown hosts use browser speech. */
export function getDesktopTts(): DesktopTts | null {
	if (typeof window === 'undefined') return null;
	const host = window.aiChatDesktop;
	const tts = host?.tts;
	return host?.version === 2 &&
		tts?.version === 2 &&
		tts.engine === 'pocket-tts' &&
		typeof tts.generate === 'function' &&
		typeof tts.cancel === 'function' &&
		desktopVoices(tts).length > 0
		? tts
		: null;
}

/** Voices both the host offers and accounts can store, in catalog order, with the host's labels. */
export function desktopVoices(native: Pick<DesktopTts, 'voices'>) {
	if (!Array.isArray(native.voices)) return [];
	return DESKTOP_VOICE_CHAT_VOICES.flatMap((voice) => {
		const offered = native.voices.find((candidate) => candidate?.id === voice.id);
		return offered
			? [
					{
						...voice,
						label: typeof offered.label === 'string' && offered.label ? offered.label : voice.label
					}
				]
			: [];
	});
}

/** The saved desktop voice when this host offers it, otherwise the host's default. */
export function resolveDesktopVoice(
	native: DesktopTts,
	preferred: string
): DesktopVoiceId | string {
	const voices = desktopVoices(native);
	return (
		(
			voices.find((voice) => voice.id === preferred) ??
			voices.find((voice) => voice.id === native.defaultVoice) ??
			voices[0]
		)?.id ?? native.defaultVoice
	);
}

// Shared across preview/chat instances; a fresh page also gets different IDs.
let nextId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

export function desktopTtsLabel(): string {
	return 'Pocket TTS';
}

/** Native engines run in Go and share the existing replay/playback Blob contract. */
export class DesktopSpeechEngine implements StreamingSpeechEngine {
	private pending: {
		id: number;
		resolve: (blob: Blob) => void;
		reject: (error: Error) => void;
		timer: ReturnType<typeof setTimeout>;
		chunks: Uint8Array<ArrayBuffer>[];
		samples: number;
		rate: number;
		onChunk?: (chunk: SpeechChunk) => void;
	} | null = null;
	private disposed = false;

	constructor(
		private native: DesktopTts,
		private onStatus?: (status: VoiceStatus) => void
	) {}

	/** Whether this host's audio may be played as it arrives (capability `tts.streaming` v1). */
	get streams(): boolean {
		return this.native.streaming?.version === 1;
	}

	/** voiceId is a desktop catalog ID; the host falls back to its default for unknown IDs. */
	synthesize(text: string, voiceId: string): Promise<Blob> {
		return this.start(text, voiceId);
	}

	/** Like synthesize, but passes each decoded chunk to onChunk as the host sends it. */
	synthesizeStream(
		text: string,
		voiceId: string,
		onChunk: (chunk: SpeechChunk) => void
	): Promise<Blob> {
		return this.start(text, voiceId, onChunk);
	}

	private start(
		text: string,
		voiceId: string,
		onChunk?: (chunk: SpeechChunk) => void
	): Promise<Blob> {
		if (this.disposed) return Promise.reject(new Error('The speaker has been closed.'));
		if (this.pending) return Promise.reject(new Error('Wait for the current spoken reply.'));
		if (!text.trim() || text.length > 3000 || text.includes('\0'))
			return Promise.reject(new Error('Enter between 1 and 3,000 characters.'));
		const voice = resolveDesktopVoice(this.native, voiceId);
		return new Promise((resolve, reject) => {
			const id = ++nextId;
			const timer = setTimeout(this.timeout, 180_000);
			this.pending = { id, resolve, reject, timer, chunks: [], samples: 0, rate: 0, onChunk };
			window.addEventListener('desktop-tts-audio', this.receive);
			try {
				this.onStatus?.({
					message: `Preparing spoken reply with ${desktopTtsLabel()}…`,
					progress: null
				});
				void this.native.generate(id, text, voice).catch((cause: unknown) => {
					if (this.pending?.id === id) this.fail(asError(cause));
				});
			} catch (cause) {
				this.fail(asError(cause));
			}
		});
	}

	cancel(): void {
		this.fail(new DOMException('Voice cancelled.', 'AbortError'));
	}

	dispose(): void {
		this.cancel();
		this.disposed = true;
		this.onStatus = undefined;
	}

	private receive = (event: Event) => {
		const data = (event as CustomEvent<DesktopEvent>).detail;
		const pending = this.pending;
		if (!pending || !data || data.id !== pending.id) return;
		try {
			if (data.type === 'error')
				throw new Error(data.message || `${desktopTtsLabel()} could not speak.`);
			if (data.type === 'progress' || data.type === 'chunk') {
				clearTimeout(pending.timer);
				pending.timer = setTimeout(this.timeout, 180_000);
				this.onStatus?.({
					message: `Generating spoken reply with ${desktopTtsLabel()}…`,
					progress:
						typeof data.progress === 'number' && Number.isFinite(data.progress)
							? Math.max(0, Math.min(100, data.progress * 100))
							: null
				});
			}
			if (data.type !== 'chunk' && data.type !== 'complete') return;
			const rate = data.sampleRate ?? 0;
			if (
				!Number.isInteger(rate) ||
				rate < 8000 ||
				rate > 192000 ||
				(pending.rate && rate !== pending.rate)
			)
				throw new Error('Invalid sample rate from the desktop speaker.');
			pending.rate = rate;
			if (data.type === 'chunk') {
				const bytes = Uint8Array.from(atob(data.pcm ?? ''), (c) => c.charCodeAt(0));
				if (!bytes.length || bytes.length % 4)
					throw new Error('Invalid audio from the desktop speaker.');
				const samples = bytes.length / 4;
				if (pending.samples + samples > rate * 180)
					throw new Error('The spoken reply is too long.');
				const input = new DataView(bytes.buffer);
				const pcm = new Uint8Array(samples * 2);
				const output = new DataView(pcm.buffer);
				const floats = new Float32Array(samples);
				for (let i = 0; i < samples; i++) {
					const value = input.getFloat32(i * 4, true);
					if (!Number.isFinite(value)) throw new Error('Invalid audio from the desktop speaker.');
					floats[i] = Math.max(-1, Math.min(1, value));
					output.setInt16(i * 2, Math.round(floats[i] * 32767), true);
				}
				pending.chunks.push(pcm);
				pending.samples += samples;
				pending.onChunk?.({
					samples: floats,
					sampleRate: rate,
					progress:
						typeof data.progress === 'number' && Number.isFinite(data.progress)
							? Math.max(0, Math.min(1, data.progress))
							: null
				});
				return;
			}
			if (!pending.samples || pending.samples !== data.sampleCount)
				throw new Error('The desktop audio stream was incomplete.');
			const blob = new Blob([waveHeader(pending.samples, pending.rate), ...pending.chunks], {
				type: 'audio/wav'
			});
			this.clear();
			pending.resolve(blob);
		} catch (cause) {
			this.fail(asError(cause));
		}
	};

	private timeout = () => {
		this.fail(new Error(`${desktopTtsLabel()} took too long. Please try Replay.`));
	};

	private clear() {
		if (this.pending) clearTimeout(this.pending.timer);
		this.pending = null;
		window.removeEventListener('desktop-tts-audio', this.receive);
	}

	private fail(error: Error) {
		const pending = this.pending;
		if (!pending) return;
		this.clear();
		try {
			void this.native.cancel(pending.id).catch(() => {});
		} catch {
			/* Host may be closing. */
		}
		pending.reject(error);
	}
}

function asError(cause: unknown): Error {
	return cause instanceof Error
		? cause
		: new Error(String(cause || 'The desktop speaker could not start.'));
}

function waveHeader(samples: number, rate: number): ArrayBuffer {
	const header = new ArrayBuffer(44);
	const view = new DataView(header);
	const ascii = (offset: number, text: string) =>
		[...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
	ascii(0, 'RIFF');
	view.setUint32(4, 36 + samples * 2, true);
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
	return header;
}
