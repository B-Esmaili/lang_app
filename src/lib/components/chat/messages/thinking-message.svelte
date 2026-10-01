<script lang="ts">
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { fly } from 'svelte/transition';
</script>

<div class="group/message mx-auto w-full max-w-3xl px-4 md:px-6" in:fly={{ opacity: 0, y: 5 }}>
	<div class="flex w-full gap-4">
		<div
			class="flex size-8 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm"
		>
			<SparklesIcon class="size-3.5" />
		</div>
		<div class="flex h-8 items-center gap-1.5" aria-label="Assistant is responding">
			<span class="size-1.5 animate-pulse rounded-full bg-muted-foreground/70"></span>
			<span
				class="size-1.5 animate-pulse rounded-full bg-muted-foreground/70 [animation-delay:150ms]"
			></span>
			<span
				class="size-1.5 animate-pulse rounded-full bg-muted-foreground/70 [animation-delay:300ms]"
			></span>
		</div>
	</div>
</div>
