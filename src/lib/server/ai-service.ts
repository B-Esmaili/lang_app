import { fetchNineRouterModels, nineRouterUrl, type NineRouterOptions } from './nine-router';

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_CONVERSATION_LENGTH = 100_000;

export type AiMessage = {
	role: 'user' | 'assistant';
	content: string;
};

export type AiChatRequest = {
	messages: AiMessage[];
};

export type AiServiceOptions = NineRouterOptions & {
	/** Trusted feature instructions supplied by server code, never by the chat request body. */
	systemPrompt?: string;
	maxOutputTokens?: number;
	/** Only set for models whose provider supports the thinking switch. */
	thinking?: 'enabled' | 'disabled';
};

export type AiChatStream = {
	stream: ReadableStream<Uint8Array>;
	contentType: string;
};

/** A transport-neutral error that callers can map directly to an HTTP response. */
export class AiServiceError extends Error {
	constructor(
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'AiServiceError';
	}
}

/**
 * Opens an OpenAI-compatible chat-completions stream through the configured gateway.
 * Keeping this here means product features never need to know gateway URLs or headers.
 */
export async function streamAiChat(
	input: unknown,
	options: AiServiceOptions = {}
): Promise<AiChatStream> {
	const messages = validateMessages(input);
	const { apiKey, baseUrl, fetcher = fetch } = options;
	const model = await resolveModel(options);
	const headers = requestHeaders(apiKey, 'text/event-stream');

	let upstream: Response;
	try {
		upstream = await fetcher(nineRouterUrl(baseUrl, 'chat/completions'), {
			method: 'POST',
			headers,
			body: JSON.stringify({ model, messages, stream: true })
		});
	} catch {
		throw new AiServiceError('Could not connect to the AI provider', 502);
	}

	if (!upstream.ok) throw await gatewayError(upstream);
	if (!upstream.body) throw new AiServiceError('The AI provider returned an empty response', 502);

	return {
		stream: upstream.body,
		contentType: upstream.headers.get('content-type') ?? 'text/event-stream'
	};
}

/** Runs a non-streaming OpenAI-compatible chat completion and returns its text. */
export async function completeAiChat(
	input: unknown,
	options: AiServiceOptions = {}
): Promise<string> {
	const messages = validateMessages(input);
	const { apiKey, baseUrl, fetcher = fetch } = options;
	const model = await resolveModel(options);

	let upstream: Response;
	try {
		upstream = await fetcher(nineRouterUrl(baseUrl, 'chat/completions'), {
			method: 'POST',
			headers: requestHeaders(apiKey, 'application/json'),
			body: JSON.stringify({
				model,
				messages: options.systemPrompt
					? [{ role: 'system', content: options.systemPrompt }, ...messages]
					: messages,
				stream: false,
				...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
				...(options.thinking ? { thinking: { type: options.thinking } } : {})
			})
		});
	} catch {
		throw new AiServiceError('Could not connect to the AI provider', 502);
	}

	if (!upstream.ok) throw await gatewayError(upstream);

	let payload: unknown;
	try {
		payload = await upstream.json();
	} catch {
		throw new AiServiceError('The AI provider returned an invalid completion response', 502);
	}

	const content = completionContent(payload);
	if (!content) {
		const choice = completionChoice(payload);
		if (choice?.finish_reason === 'length')
			throw new AiServiceError(
				'The AI model reached its token limit before producing an answer. Try a non-thinking model or increase the output token limit.',
				502
			);
		throw new AiServiceError(
			'The AI provider returned an empty completion. Please try again.',
			502
		);
	}
	return content;
}

function validateMessages(input: unknown): AiMessage[] {
	const parsed = parseChatRequest(input);
	if ('error' in parsed) throw new AiServiceError(parsed.error, 400);
	return parsed.messages;
}

async function resolveModel({
	apiKey,
	baseUrl,
	model,
	fetcher = fetch
}: AiServiceOptions): Promise<string> {
	const configuredModel = model?.trim();
	if (!configuredModel) throw new AiServiceError('AI model is not configured.', 503);

	let models: Awaited<ReturnType<typeof fetchNineRouterModels>>['data'];
	try {
		({ data: models } = await fetchNineRouterModels({
			baseUrl,
			apiKey,
			model: configuredModel,
			fetcher
		}));
	} catch (cause) {
		throw new AiServiceError(
			cause instanceof Error ? cause.message : 'Could not validate the selected model',
			502
		);
	}

	if (!models.some((candidate) => candidate.id === configuredModel)) {
		throw new AiServiceError('The configured model is unavailable from the AI provider', 503);
	}

	return configuredModel;
}

function requestHeaders(apiKey: string | undefined, accept: string): Headers {
	const headers = new Headers({ accept, 'content-type': 'application/json' });
	if (apiKey) headers.set('authorization', `Bearer ${apiKey}`);
	return headers;
}

function parseChatRequest(value: unknown): AiChatRequest | { error: string } {
	if (typeof value !== 'object' || value === null) {
		return { error: 'Request body must be an object' };
	}

	if (!('messages' in value) || !Array.isArray(value.messages) || value.messages.length === 0) {
		return { error: 'At least one message is required' };
	}

	if (value.messages.length > MAX_MESSAGES) {
		return { error: `A conversation can contain at most ${MAX_MESSAGES} messages` };
	}

	const messages: AiMessage[] = [];
	let conversationLength = 0;

	for (const message of value.messages) {
		if (typeof message !== 'object' || message === null) {
			return { error: 'Every message must be an object' };
		}

		if (
			!('role' in message) ||
			(message.role !== 'user' && message.role !== 'assistant') ||
			!('content' in message) ||
			typeof message.content !== 'string'
		) {
			return { error: 'Every message must have a valid role and text content' };
		}

		const content = message.content.trim();
		if (!content) return { error: 'Messages cannot be empty' };
		if (content.length > MAX_MESSAGE_LENGTH) {
			return { error: `Each message can contain at most ${MAX_MESSAGE_LENGTH} characters` };
		}

		conversationLength += content.length;
		messages.push({ role: message.role, content });
	}

	if (conversationLength > MAX_CONVERSATION_LENGTH) {
		return { error: `The conversation can contain at most ${MAX_CONVERSATION_LENGTH} characters` };
	}
	if (messages.at(-1)?.role !== 'user') return { error: 'The final message must be from the user' };
	return { messages };
}

async function gatewayError(response: Response): Promise<AiServiceError> {
	const fallback = `AI provider request failed with status ${response.status}`;
	let message = fallback;

	try {
		const payload: unknown = await response.json();
		if (
			typeof payload === 'object' &&
			payload !== null &&
			'error' in payload &&
			typeof payload.error === 'object' &&
			payload.error !== null &&
			'message' in payload.error &&
			typeof payload.error.message === 'string'
		) {
			message = payload.error.message.slice(0, 500);
		}
	} catch {
		// Use the status-based fallback when the provider does not return JSON.
	}

	return new AiServiceError(
		message,
		response.status >= 400 && response.status < 600 ? response.status : 502
	);
}

function completionChoice(payload: unknown): Record<string, unknown> | null {
	if (
		typeof payload !== 'object' ||
		payload === null ||
		!('choices' in payload) ||
		!Array.isArray(payload.choices)
	) {
		return null;
	}

	const choice = payload.choices[0];
	return typeof choice === 'object' && choice !== null && !Array.isArray(choice) ? choice : null;
}

function completionContent(payload: unknown): string | null {
	const message = completionChoice(payload)?.message;
	if (
		typeof message !== 'object' ||
		message === null ||
		!('content' in message) ||
		typeof message.content !== 'string'
	) {
		return null;
	}

	return message.content.trim() || null;
}
