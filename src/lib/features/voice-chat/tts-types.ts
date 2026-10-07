import type { VoiceChatVoiceId } from './voices';

export type VoiceStatus = { message: string; progress: number | null };
export interface SpeechEngine {
	/** voiceId is a browser (Piper) ID for the worker, or a desktop catalog ID natively. */
	synthesize(text: string, voiceId: string): Promise<Blob>;
	cancel(): void;
	dispose(): void;
}
/** Audio in playback order. progress is the engine's estimate (0–1) of how much of the reply
 * has been generated so far, or null when it gives none. */
export type SpeechChunk = { samples: Float32Array; sampleRate: number; progress: number | null };
/** An engine whose audio can be played while the rest of the reply is still being generated. */
export interface StreamingSpeechEngine extends SpeechEngine {
	/** Like synthesize, but onChunk receives each piece of audio as it arrives. */
	synthesizeStream(
		text: string,
		voiceId: string,
		onChunk: (chunk: SpeechChunk) => void
	): Promise<Blob>;
}
export type VoiceRequest = { id: number; text: string; voiceId: VoiceChatVoiceId };
export type VoiceResponse =
	| { type: 'status'; id: number; status: VoiceStatus }
	| { type: 'result'; id: number; blob: Blob }
	| { type: 'error'; id: number; message: string };
