<script lang="ts">
	import { fly } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';

	let {
		disabled,
		onSelect
	}: {
		disabled: boolean;
		onSelect: (prompt: string) => void;
	} = $props();

	const suggestedActions = [
		{
			title: 'What are the advantages',
			label: 'of using SvelteKit?',
			prompt: 'What are the advantages of using SvelteKit?'
		},
		{
			title: 'Write code to',
			label: "demonstrate Dijkstra's algorithm",
			prompt: "Write code to demonstrate Dijkstra's algorithm."
		},
		{
			title: 'Help me write',
			label: 'a concise project update',
			prompt: 'Help me write a friendly, concise project update.'
		},
		{
			title: 'Explain simply',
			label: 'how large language models work',
			prompt: 'Explain how large language models work in simple terms.'
		}
	];
</script>

<div class="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
	{#each suggestedActions as action, index (action.title)}
		<div
			in:fly|global={{ opacity: 0, y: 20, delay: 50 * index, duration: 400 }}
			class={index > 1 ? 'hidden sm:block' : 'block'}
		>
			<Button
				variant="outline"
				{disabled}
				onclick={() => onSelect(action.prompt)}
				class="h-auto w-full min-w-0 flex-col items-start justify-start gap-1 overflow-hidden rounded-xl px-4 py-3.5 text-left text-sm whitespace-normal shadow-none"
			>
				<span class="max-w-full font-medium">{action.title}</span>
				<span class="max-w-full text-muted-foreground">{action.label}</span>
			</Button>
		</div>
	{/each}
</div>
