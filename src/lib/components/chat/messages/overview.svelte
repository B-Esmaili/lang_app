<script lang="ts">
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { scale } from 'svelte/transition';
</script>

<div
	class="mx-auto mt-auto w-full max-w-3xl px-4 pb-10 text-center sm:pb-14 md:px-6"
	transition:scale={{ opacity: 0, start: 0.98 }}
>
	<div class="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl p-6 leading-relaxed">
		<div class="flex items-center gap-3 text-muted-foreground">
			<SparklesIcon class="size-7" />
			<span class="text-sm">+</span>
			<MessageSquareIcon class="size-7" />
		</div>
		<div>
			<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">How can I help you today?</h1>
			<p class="mt-3 text-sm leading-6 text-muted-foreground">
				Start a conversation. Responses stream as they are generated.
			</p>
		</div>
	</div>
</div>
