/** English voices from the diffusionstudio/vits-web catalog, used by the browser engine.
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

export const VOICE_AGE_GROUPS = [
	{ id: 'child', label: 'Kids' },
	{ id: 'young', label: 'Young adults' },
	{ id: 'middle', label: 'Middle-aged' },
	{ id: 'senior', label: 'Older adults' }
] as const;
export type VoiceAgeGroup = (typeof VOICE_AGE_GROUPS)[number]['id'];

/** Pocket TTS voices bundled with the desktop app. Keep in sync with
 * desktop-app/voices/voices.json; the desktop host advertises which it offers.
 */
export const DESKTOP_VOICE_CHAT_VOICES = [
	{
		id: 'child-female',
		label: 'Girl (child, Mandarin-accented English)',
		age: 'child',
		gender: 'female'
	},
	{
		id: 'child-male',
		label: 'Boy (child, Mandarin-accented English)',
		age: 'child',
		gender: 'male'
	},
	{ id: 'young-female', label: 'Young woman', age: 'young', gender: 'female' },
	{ id: 'young-male', label: 'Young man', age: 'young', gender: 'male' },
	{ id: 'middle-female', label: 'Middle-aged woman', age: 'middle', gender: 'female' },
	{ id: 'middle-male', label: 'Middle-aged man', age: 'middle', gender: 'male' },
	{ id: 'senior-female', label: 'Older woman', age: 'senior', gender: 'female' },
	{ id: 'senior-male', label: 'Older man', age: 'senior', gender: 'male' }
] as const satisfies readonly {
	id: string;
	label: string;
	age: VoiceAgeGroup;
	gender: 'female' | 'male';
}[];

export type DesktopVoiceId = (typeof DESKTOP_VOICE_CHAT_VOICES)[number]['id'];
export const DEFAULT_DESKTOP_VOICE: DesktopVoiceId = 'young-female';

/** The browser speaker and the desktop speaker are separate preferences, so
 * choosing a desktop voice never changes what direct website visits use. */
export type VoiceChatPreferences = {
	connectionId: string | null;
	voiceId: VoiceChatVoiceId;
	desktopVoiceId: DesktopVoiceId;
};

export function isVoiceChatVoiceId(value: unknown): value is VoiceChatVoiceId {
	return VOICE_CHAT_VOICES.some((voice) => voice.id === value);
}

export function isDesktopVoiceId(value: unknown): value is DesktopVoiceId {
	return DESKTOP_VOICE_CHAT_VOICES.some((voice) => voice.id === value);
}

export function voiceModelUrl(voiceId: VoiceChatVoiceId): string {
	const [locale, name, quality] = voiceId.split('-');
	return `https://huggingface.co/diffusionstudio/piper-voices/resolve/main/en/${locale}/${name}/${quality}/${voiceId}.onnx`;
}
