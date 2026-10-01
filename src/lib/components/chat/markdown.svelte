<script lang="ts">
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import { cn } from '$lib/utils';
	import CodeBlock from './code-block.svelte';

	let { content }: { content: string } = $props();
</script>

<div class="chat-markdown min-w-0 space-y-3 leading-7">
	<Markdown md={content} plugins={[gfmPlugin()]}>
		{#snippet ol(props)}
			{@const { children, ...rest } = props}
			<ol {...rest} class={cn('ml-5 list-outside list-decimal space-y-1', rest.class)}>
				{@render children?.()}
			</ol>
		{/snippet}
		{#snippet ul(props)}
			{@const { children, ...rest } = props}
			<ul {...rest} class={cn('ml-5 list-outside list-disc space-y-1', rest.class)}>
				{@render children?.()}
			</ul>
		{/snippet}
		{#snippet strong(props)}
			{@const { children, ...rest } = props}
			<strong {...rest} class={cn('font-semibold', rest.class)}>{@render children?.()}</strong>
		{/snippet}
		{#snippet a(props)}
			{@const { children, ...rest } = props}
			<a
				{...rest}
				class={cn(
					'text-blue-600 underline-offset-4 hover:underline dark:text-blue-400',
					rest.class
				)}
				target="_blank"
				rel="noopener noreferrer">{@render children?.()}</a
			>
		{/snippet}
		{#snippet code(props)}
			<CodeBlock {...props} class={props.class ?? undefined} />
		{/snippet}
	</Markdown>
</div>
