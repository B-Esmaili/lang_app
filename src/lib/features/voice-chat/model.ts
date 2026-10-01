export const VOICE_CHAT_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type VoiceChatLevel = (typeof VOICE_CHAT_LEVELS)[number];

export type VoiceChatConfiguration = {
	title: string;
	topic: string;
	level: VoiceChatLevel;
	instructions: string;
	useLessonContext: boolean;
};

export const DEFAULT_VOICE_CHAT: VoiceChatConfiguration = {
	title: 'Voice chat',
	topic: 'Getting to know each other',
	level: 'B1',
	instructions: 'Have a friendly conversation. Ask one question at a time.',
	useLessonContext: true
};

export const VOICE_CHAT_LIMITS = {
	studentText: 2_000,
	replyText: 1_500,
	summary: 3_000,
	lessonContext: 3_000,
	topic: 300,
	instructions: 2_000,
	recentMessages: 10,
	retainedMessages: 6,
	displayMessages: 80
} as const;

export type VoiceChatMessage = { role: 'user' | 'assistant'; content: string };
export type VoiceChatContext = {
	summary: string;
	messages: VoiceChatMessage[];
	lastCorrection?: string;
};
export type VoiceChatAction = 'start' | 'reply' | 'correct';
export type VoiceChatResult = {
	text: string;
	context: VoiceChatContext;
	compacted: boolean;
};

export function emptyVoiceChatContext(): VoiceChatContext {
	return { summary: '', messages: [] };
}

/** Keep spoken replies short even when a provider ignores its output limit. */
export function spokenReply(value: string): string {
	const text = value
		.replace(/```[\s\S]*?```/gu, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
		.replace(/[*#_`]/gu, '')
		.replace(/\s+/gu, ' ')
		.trim();
	if (text.length <= VOICE_CHAT_LIMITS.replyText) return text;
	const truncated = text.slice(0, VOICE_CHAT_LIMITS.replyText);
	const sentenceEnd = Math.max(
		truncated.lastIndexOf('. '),
		truncated.lastIndexOf('? '),
		truncated.lastIndexOf('! ')
	);
	return sentenceEnd > truncated.length / 2
		? truncated.slice(0, sentenceEnd + 1)
		: `${truncated.slice(0, truncated.lastIndexOf(' '))}…`;
}
