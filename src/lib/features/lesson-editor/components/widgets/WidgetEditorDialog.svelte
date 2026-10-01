<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import type { WidgetRenderContext, WidgetRenderer } from './widget-renderer';
	import WidgetHost from './WidgetHost.svelte';

	let {
		context,
		renderWidget,
		onclose
	}: {
		context: WidgetRenderContext | null;
		renderWidget?: WidgetRenderer;
		onclose: () => void;
	} = $props();
</script>

<Dialog.Root
	open={context !== null}
	onOpenChange={(open) => {
		if (!open) onclose();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-[100] bg-black/20" />
		<Dialog.Content
			class="fixed inset-y-4 end-4 z-[101] flex flex-col gap-4 overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl focus:outline-none"
			style="inline-size: min(42rem, calc(100% - 2rem)); max-block-size: calc(100dvh - 2rem)"
		>
			<Dialog.Title class="text-lg font-semibold"
				>{context?.editing ? 'Edit widget' : 'Learning activity'}</Dialog.Title
			>
			<Dialog.Description class="text-sm text-muted-foreground">
				{context?.editing
					? 'Select text to format or highlight it. Changes appear on your lesson as you type.'
					: 'Read, listen, or practise at your own pace.'}
			</Dialog.Description>
			{#if context}
				{#key context.widget.id}
					<div class="min-w-0 flex-1" data-widget-editor>
						{#if renderWidget}
							{@render renderWidget(context)}
						{:else}
							<WidgetHost
								widget={context.widget}
								selected={false}
								editing={context.editing}
								languageRuntime={context.languageRuntime}
								onSelect={context.select}
								onContentChange={context.updateContent}
							/>
						{/if}
					</div>
				{/key}
			{/if}
			<div class="flex justify-end"><Button onclick={onclose}>Done</Button></div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
