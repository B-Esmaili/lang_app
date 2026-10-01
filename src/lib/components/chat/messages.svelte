<script lang="ts">
	import Overview from './messages/overview.svelte';
	import PreviewMessage from './messages/preview-message.svelte';
	import ThinkingMessage from './messages/thinking-message.svelte';
	import type { ChatMessage, ChatModel } from './types';

	let {
		messages,
		models,
		loading,
		copiedMessageId,
		onCopy,
		viewport = $bindable(null)
	}: {
		messages: ChatMessage[];
		models: ChatModel[];
		loading: boolean;
		copiedMessageId: string;
		onCopy: (message: ChatMessage) => void;
		viewport: HTMLDivElement | null;
	} = $props();

	$effect(() => {
		if (!viewport) return;

		const observer = new MutationObserver(() => {
			viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
		});

		observer.observe(viewport, {
			childList: true,
			subtree: true,
			characterData: true
		});

		return () => observer.disconnect();
	});

	function getModelName(modelId?: string) {
		return models.find((model) => model.id === modelId)?.name ?? modelId ?? 'Assistant';
	}
</script>

<div
	bind:this={viewport}
	class="flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto pt-4"
	aria-live="polite"
>
	{#if messages.length === 0}
		<Overview />
	{:else}
		{#each messages as message (message.id)}
			{#if loading && message.role === 'assistant' && !message.content}
				<ThinkingMessage />
			{:else}
				<PreviewMessage
					{message}
					modelName={getModelName(message.model)}
					copied={copiedMessageId === message.id}
					{onCopy}
				/>
			{/if}
		{/each}
	{/if}

	<div class="min-h-4 shrink-0"></div>
</div>
