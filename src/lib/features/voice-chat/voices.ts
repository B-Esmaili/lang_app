/** English voices from the diffusionstudio/vits-web catalog.
 * Multi-speaker models currently use their default speaker (ID 0).
 * https://github.com/diffusionstudio/vits-web/blob/main/src/fixtures.ts
 */
export const VOICE_CHAT_VOICES = [
	{ id: 'en_US-hfc_female-medium', label: 'HFC female · American English' },
	{ id: 'en_US-hfc_male-medium', label: 'HFC male · American English' },
	{ id: 'en_US-lessac-medium', label: 'Lessac · American English' },
	{ id: 'en_US-libritts-high', label: 'LibriTTS · American English · High quality (speaker 0)' },
	{ id: 'en_US-libritts_r-medium', label: 'LibriTTS-R · American English · Medium (speaker 0)' },
	{ id: 'en_US-amy-medium', label: 'Amy · American English' },
	{ id: 'en_US-ryan-medium', label: 'Ryan · American English' },
	{ id: 'en_GB-alba-medium', label: 'Alba · British English' },
	{ id: 'en_GB-alan-medium', label: 'Alan · British English' }
] as const;

export type VoiceChatVoiceId = (typeof VOICE_CHAT_VOICES)[number]['id'];
export const DEFAULT_VOICE_CHAT_VOICE: VoiceChatVoiceId = 'en_US-hfc_female-medium';

export type VoiceChatPreferences = {
	connectionId: string | null;
	voiceId: VoiceChatVoiceId;
};

export function isVoiceChatVoiceId(value: unknown): value is VoiceChatVoiceId {
	return VOICE_CHAT_VOICES.some((voice) => voice.id === value);
}

export function voiceModelUrl(voiceId: VoiceChatVoiceId): string {
	const [locale, name, quality] = voiceId.split('-');
	return `https://huggingface.co/diffusionstudio/piper-voices/resolve/main/en/${locale}/${name}/${quality}/${voiceId}.onnx`;
}
