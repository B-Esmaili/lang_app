export type ChatModel = {
	id: string;
	name: string;
	description?: string;
	context_length?: number;
};

export type ChatMessage = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	model?: string;
};
