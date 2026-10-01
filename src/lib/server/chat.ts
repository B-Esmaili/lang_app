/** @deprecated Use the reusable ai-service module for new product features. */
export {
	AiServiceError as ChatError,
	streamAiChat as streamChat,
	type AiChatRequest as ChatRequest,
	type AiChatStream as ChatStream,
	type AiMessage as ChatMessage,
	type AiServiceOptions as ChatOptions
} from './ai-service';
