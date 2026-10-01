<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		inline,
		class: className,
		children,
		...rest
	}: {
		inline?: boolean;
		class?: ClassValue;
		children?: Snippet;
	} = $props();
</script>

{#if inline}
	<code class={cn('rounded-md bg-muted px-1 py-0.5 text-sm', className)} {...rest}>
		{@render children?.()}
	</code>
{:else}
	<div class="not-prose my-3 flex max-w-full flex-col">
		<pre
			{...rest}
			class="w-full overflow-x-auto rounded-xl border bg-muted/40 p-4 text-sm text-foreground"><code
				class="break-words whitespace-pre-wrap">{@render children?.()}</code
			></pre>
	</div>
{/if}
