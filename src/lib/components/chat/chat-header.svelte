<script lang="ts">
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import ModelSelector from './model-selector.svelte';
	import type { ChatModel } from './types';

	let {
		models,
		loadingModels,
		modelError,
		onRetryModels,
		onNewChat
	}: {
		models: ChatModel[];
		loadingModels: boolean;
		modelError: string;
		onRetryModels: () => void;
		onNewChat: () => void;
	} = $props();
</script>

<header
	class="sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-2 border-b bg-background/90 p-2 backdrop-blur-md"
>
	<div class="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
		<SparklesIcon class="size-4" />
	</div>

	<ModelSelector {models} loading={loadingModels} error={modelError} onRetry={onRetryModels} />

	<Badge
		variant="secondary"
		class="hidden bg-emerald-500/10 text-emerald-700 sm:inline-flex dark:text-emerald-400"
	>
		<span class="size-1.5 rounded-full bg-emerald-500"></span>
		OpenAI Compatible
	</Badge>

	<Button variant="outline" class="ml-auto h-9 px-2.5" onclick={onNewChat}>
		<PlusIcon data-icon="inline-start" />
		<span class="hidden sm:inline">New chat</span>
		<span class="sr-only sm:hidden">New chat</span>
	</Button>
</header>
