import type { VoiceChatVoiceId } from './voices';

export type VoiceStatus = { message: string; progress: number | null };
export interface SpeechEngine {
	synthesize(text: string, voiceId: VoiceChatVoiceId): Promise<Blob>;
	cancel(): void;
	dispose(): void;
}
export type VoiceRequest = { id: number; text: string; voiceId: VoiceChatVoiceId };
export type VoiceResponse =
	| { type: 'status'; id: number; status: VoiceStatus }
	| { type: 'result'; id: number; blob: Blob }
	| { type: 'error'; id: number; message: string };
