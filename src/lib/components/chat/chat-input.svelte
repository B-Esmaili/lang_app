<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import SquareIcon from '@lucide/svelte/icons/square';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import SuggestedActions from './suggested-actions.svelte';

	let {
		value = $bindable(),
		composer = $bindable(null),
		loading,
		disabled,
		showSuggestions,
		onSend,
		onStop
	}: {
		value: string;
		composer: HTMLTextAreaElement | null;
		loading: boolean;
		disabled: boolean;
		showSuggestions: boolean;
		onSend: (prompt?: string) => void;
		onStop: () => void;
	} = $props();

	const canSend = $derived(Boolean(value.trim() && !disabled && !loading));

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (canSend) onSend();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			if (canSend) onSend();
		}
	}

	function resize(event: Event) {
		const target = event.currentTarget as HTMLTextAreaElement;
		target.style.height = 'auto';
		target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
	}
</script>

<div class="relative flex w-full min-w-0 flex-col gap-4">
	{#if showSuggestions}
		<SuggestedActions {disabled} onSelect={onSend} />
	{/if}

	<form onsubmit={submit} class="relative min-w-0">
		<Textarea
			bind:ref={composer}
			bind:value
			rows={2}
			placeholder={disabled ? 'Chat is unavailable…' : 'Send a message…'}
			aria-label="Chat message"
			class="max-h-[40dvh] min-h-24 resize-none overflow-y-auto rounded-2xl bg-muted px-4 pt-3 pb-11 !text-base shadow-sm dark:border-zinc-700"
			{disabled}
			oninput={resize}
			onkeydown={handleKeydown}
		/>

		<div class="absolute bottom-0 left-0 flex h-11 items-center px-4 text-xs text-muted-foreground">
			<SparklesIcon class="mr-1.5 size-3" />
			Chat model
		</div>

		<div class="absolute right-0 bottom-0 flex h-11 items-center p-2">
			{#if loading}
				<Button
					type="button"
					size="icon"
					class="rounded-full"
					aria-label="Stop response"
					onclick={onStop}
				>
					<SquareIcon class="size-3 fill-current" />
				</Button>
			{:else}
				<Button
					type="submit"
					size="icon"
					class="rounded-full"
					aria-label="Send message"
					disabled={!canSend}
				>
					<ArrowUpIcon />
				</Button>
			{/if}
		</div>
	</form>
</div>
