<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ChatHeader from './chat-header.svelte';
	import ChatInput from './chat-input.svelte';
	import Messages from './messages.svelte';
	import type { ChatMessage, ChatModel } from './types';

	let models = $state<ChatModel[]>([]);
	let selectedModel = $state('');
	let messages = $state<ChatMessage[]>([]);
	let input = $state('');
	let loadingModels = $state(true);
	let sending = $state(false);
	let modelError = $state('');
	let chatError = $state('');
	let copiedMessageId = $state('');
	let controller: AbortController | undefined;
	let composer = $state<HTMLTextAreaElement | null>(null);
	let messageViewport = $state<HTMLDivElement | null>(null);
	const needsPersonalAiConnection = $derived(modelError.includes('AI connection'));

	onMount(() => {
		void loadModels();

		return () => controller?.abort();
	});

	async function loadModels() {
		loadingModels = true;
		modelError = '';

		try {
			const response = await fetch('/api/models');
			if (!response.ok) throw new Error(await readResponseError(response));

			const payload: unknown = await response.json();
			if (!Array.isArray(payload)) throw new Error('The model list is unavailable');

			models = payload.filter(isModel).sort((left, right) => left.name.localeCompare(right.name));
			if (models.length === 0)
				throw new Error('The configured chat model is unavailable. Contact the app administrator.');

			selectedModel = models[0].id;
		} catch (cause) {
			models = [];
			selectedModel = '';
			modelError = cause instanceof Error ? cause.message : 'Could not load models';
		} finally {
			loadingModels = false;
		}
	}

	function isModel(value: unknown): value is ChatModel {
		return (
			typeof value === 'object' &&
			value !== null &&
			'id' in value &&
			typeof value.id === 'string' &&
			'name' in value &&
			typeof value.name === 'string'
		);
	}

	async function sendMessage(suggestedPrompt?: string) {
		const content = (suggestedPrompt ?? input).trim();
		if (!content || !selectedModel || sending) return;

		chatError = '';
		input = '';
		if (composer) composer.style.height = 'auto';

		const userMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content
		};
		const assistantMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'assistant',
			content: '',
			model: selectedModel
		};

		messages = [...messages, userMessage, assistantMessage];
		sending = true;
		controller = new AbortController();

		try {
			const history = messages
				.filter((message) => message.id !== assistantMessage.id)
				.map(({ role, content: messageContent }) => ({ role, content: messageContent }));

			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ messages: history }),
				signal: controller.signal
			});

			if (!response.ok) throw new Error(await readResponseError(response));
			if (!response.body) throw new Error('The model returned an empty response');

			await readChatStream(response.body, assistantMessage.id);

			const completedMessage = messages.find((message) => message.id === assistantMessage.id);
			if (!completedMessage?.content.trim()) throw new Error('The model did not return any text');
		} catch (cause) {
			const wasAborted = cause instanceof DOMException && cause.name === 'AbortError';
			const partialMessage = messages.find((message) => message.id === assistantMessage.id);

			if (!partialMessage?.content) {
				messages = messages.filter((message) => message.id !== assistantMessage.id);
			}

			if (!wasAborted) {
				chatError = cause instanceof Error ? cause.message : 'The message could not be sent';
			}
		} finally {
			sending = false;
			controller = undefined;
			await tick();
			composer?.focus();
		}
	}

	async function readChatStream(stream: ReadableStream<Uint8Array>, messageId: string) {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? '';

			for (const line of lines) processStreamLine(line, messageId);
		}

		buffer += decoder.decode();
		if (buffer) processStreamLine(buffer, messageId);
	}

	function processStreamLine(line: string, messageId: string) {
		if (!line.startsWith('data:')) return;

		const data = line.slice(5).trim();
		if (!data || data === '[DONE]') return;

		let chunk: unknown;
		try {
			chunk = JSON.parse(data);
		} catch {
			return;
		}

		const streamChunk = chunk as {
			choices?: Array<{ delta?: { content?: unknown } }>;
			error?: { message?: unknown };
		};

		if (typeof streamChunk.error?.message === 'string') {
			throw new Error(streamChunk.error.message);
		}

		const content = streamChunk.choices?.[0]?.delta?.content;
		if (typeof content !== 'string' || !content) return;

		messages = messages.map((message) =>
			message.id === messageId ? { ...message, content: message.content + content } : message
		);
	}

	function newChat() {
		controller?.abort();
		messages = [];
		chatError = '';
		input = '';
		if (composer) composer.style.height = 'auto';
		void tick().then(() => composer?.focus());
	}

	async function copyMessage(message: ChatMessage) {
		try {
			await navigator.clipboard.writeText(message.content);
			copiedMessageId = message.id;
			window.setTimeout(() => {
				if (copiedMessageId === message.id) copiedMessageId = '';
			}, 1500);
		} catch {
			chatError = 'The response could not be copied';
		}
	}

	async function readResponseError(response: Response): Promise<string> {
		try {
			const payload: unknown = await response.json();
			if (
				typeof payload === 'object' &&
				payload !== null &&
				'error' in payload &&
				typeof payload.error === 'string'
			) {
				return payload.error;
			}
		} catch {
			// Fall back to the HTTP status below.
		}

		return `Request failed with status ${response.status}`;
	}
</script>

<div class="flex h-dvh min-h-[560px] w-full min-w-0 flex-col overflow-hidden bg-background">
	<ChatHeader
		{models}
		{loadingModels}
		{modelError}
		onRetryModels={() => void loadModels()}
		onNewChat={newChat}
	/>

	<Messages
		{messages}
		{models}
		loading={sending}
		{copiedMessageId}
		onCopy={(message) => void copyMessage(message)}
		bind:viewport={messageViewport}
	/>

	<div
		class="min-w-0 shrink-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 md:px-6 md:pb-6"
	>
		<div class="mx-auto w-full max-w-3xl min-w-0">
			{#if modelError || chatError}
				<div
					class="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
					role="alert"
				>
					{chatError || modelError}
					{#if !chatError && needsPersonalAiConnection}
						<a class="ml-1 underline underline-offset-2" href="/account">Open Account settings</a>
					{/if}
				</div>
			{/if}

			<ChatInput
				bind:value={input}
				bind:composer
				loading={sending}
				disabled={!selectedModel || loadingModels}
				showSuggestions={messages.length === 0}
				onSend={(prompt) => void sendMessage(prompt)}
				onStop={() => controller?.abort()}
			/>

			<p class="mt-2 px-2 text-center text-[10px] text-muted-foreground sm:text-xs">
				AI responses may be inaccurate. Enter to send · Shift + Enter for a new line
			</p>
		</div>
	</div>
</div>
