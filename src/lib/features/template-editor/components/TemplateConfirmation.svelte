<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	let {
		open,
		title,
		description,
		confirmLabel = 'Continue',
		destructive = false,
		onconfirm,
		oncancel
	}: {
		open: boolean;
		title: string;
		description: string;
		confirmLabel?: string;
		destructive?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();
</script>

<Dialog.Root
	{open}
	onOpenChange={(value) => {
		if (!value) oncancel();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed inset-x-0 top-1/2 z-[101] mx-auto grid -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border bg-background p-6 shadow-xl focus:outline-none"
			style="inline-size: min(28rem, calc(100% - 2rem)); max-block-size: calc(100dvh - 2rem)"
		>
			<Dialog.Title class="text-lg font-semibold" dir="auto">{title}</Dialog.Title>
			<Dialog.Description class="text-sm leading-relaxed text-muted-foreground" dir="auto"
				>{description}</Dialog.Description
			>
			<div class="mt-2 flex flex-wrap justify-end gap-2">
				<Button variant="outline" class="min-h-10" onclick={oncancel}>Cancel</Button><Button
					variant={destructive ? 'destructive' : 'default'}
					class="min-h-10"
					onclick={onconfirm}>{confirmLabel}</Button
				>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
