<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { fly } from 'svelte/transition';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import Markdown from '../markdown.svelte';
	import type { ChatMessage } from '../types';

	let {
		message,
		modelName,
		copied,
		onCopy
	}: {
		message: ChatMessage;
		modelName: string;
		copied: boolean;
		onCopy: (message: ChatMessage) => void;
	} = $props();
</script>

<article
	class="group/message mx-auto w-full max-w-3xl px-4 md:px-6"
	data-role={message.role}
	in:fly|global={{ opacity: 0, y: 5 }}
>
	<div
		class="flex w-full gap-4 group-data-[role=user]/message:ml-auto group-data-[role=user]/message:w-fit group-data-[role=user]/message:max-w-2xl"
	>
		{#if message.role === 'assistant'}
			<div
				class="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm"
			>
				<SparklesIcon class="size-3.5" />
			</div>
		{/if}

		<div class="flex min-w-0 flex-1 flex-col gap-2">
			{#if message.role === 'user'}
				<div class="rounded-xl bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground">
					<p class="whitespace-pre-wrap">{message.content}</p>
				</div>
			{:else}
				<div class="min-w-0 text-[15px]">
					<Markdown content={message.content} />
				</div>
				<div
					class="flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100"
				>
					<Button
						variant="ghost"
						size="icon-xs"
						title="Copy response"
						aria-label="Copy response"
						onclick={() => onCopy(message)}
					>
						{#if copied}
							<CheckIcon class="text-emerald-600" />
						{:else}
							<CopyIcon />
						{/if}
					</Button>
					<Badge variant="outline" class="h-5 max-w-52 truncate px-1.5 text-[10px] font-normal">
						{modelName}
					</Badge>
				</div>
			{/if}
		</div>
	</div>
</article>
