<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { ChatModel } from './types';

	let {
		models,
		loading,
		error,
		onRetry
	}: {
		models: ChatModel[];
		loading: boolean;
		error: string;
		onRetry: () => void;
	} = $props();
</script>

{#if loading}
	<Skeleton class="h-9 w-44 sm:w-56" />
{:else if models.length > 0}
	<div
		class="flex h-9 max-w-44 min-w-0 items-center rounded-md border bg-muted/40 px-3 sm:max-w-64"
	>
		<span class="truncate text-sm font-medium" title={models[0].id}>{models[0].name}</span>
	</div>
{:else}
	<Button variant="outline" class="h-9" onclick={onRetry}>Retry models</Button>
{/if}

{#if error}
	<span class="sr-only" role="alert">{error}</span>
{/if}
