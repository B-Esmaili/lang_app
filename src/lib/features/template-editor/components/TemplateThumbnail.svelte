<script lang="ts">
	import ResponsiveLayout from '$lib/features/lesson-editor/components/ResponsiveLayout.svelte';
	import type { LayoutPreviewMode, TemplateDefinition } from '$lib/features/lesson-editor/model';

	let {
		definition,
		mode = 'desktop',
		selected = false
	}: { definition: TemplateDefinition; mode?: LayoutPreviewMode; selected?: boolean } = $props();
</script>

<div class="thumbnail" class:selected data-mode={mode} aria-hidden="true">
	<ResponsiveLayout template={definition} previewMode={mode} class="miniature">
		{#snippet children(slot)}
			{@const index = definition.slots.findIndex((item) => item.id === slot.id)}
			<div class="mini-region" data-tone={(index < 0 ? 0 : index) % 3}>
				<i></i><i></i><i></i>
			</div>
		{/snippet}
	</ResponsiveLayout>
</div>

<style>
	.thumbnail {
		display: flex;
		align-items: center;
		inline-size: 100%;
		min-inline-size: 0;
		aspect-ratio: 1.9;
		padding: 0.7rem;
		border-radius: 0.65rem;
		background: color-mix(in oklab, var(--studio-workspace, var(--muted)) 82%, var(--card));
	}
	.thumbnail :global(.miniature) {
		inline-size: 100%;
		block-size: 100%;
		max-block-size: 5rem;
		--layout-space-scale: 0.18;
	}
	.mini-region {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.18rem;
		block-size: 100%;
		min-block-size: 1.4rem;
		padding: 0.28rem;
		border-radius: 0.22rem;
		background: #eee7f6;
	}
	.mini-region i {
		display: block;
		block-size: 0.12rem;
		border-radius: 999px;
		background: #ad94c8;
		opacity: 0.58;
	}
	.mini-region i:nth-child(1) {
		inline-size: 40%;
	}
	.mini-region i:nth-child(2) {
		inline-size: 75%;
	}
	.mini-region i:nth-child(3) {
		inline-size: 58%;
	}
	.mini-region[data-tone='1'] {
		background: #e7f1eb;
	}
	.mini-region[data-tone='1'] i {
		background: #8cbaa5;
	}
	.mini-region[data-tone='2'] {
		background: #f6f0da;
	}
	.mini-region[data-tone='2'] i {
		background: #c7b777;
	}
	.selected {
		background: color-mix(in oklab, var(--studio-lilac, #ede7f5) 40%, var(--card));
	}
</style>
