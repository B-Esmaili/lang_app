<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="sticky-panel">
	{@render children()}
</div>

<style>
	/* The containing column supplies its toolbar offset and responsive overrides. */
	.sticky-panel {
		position: var(--sidebar-position, sticky);
		inset-block-start: var(--sidebar-offset, 0rem);
		min-inline-size: 0;
		min-block-size: 0;
		max-block-size: var(
			--sidebar-max-size,
			calc(100dvh - var(--sidebar-offset, 0rem) - var(--sidebar-bottom-gap, 1rem))
		);
		overflow: auto;
		scrollbar-width: thin;
		scrollbar-gutter: stable;
		scroll-padding-block: 0.75rem;
	}
</style>
