<script lang="ts">
	import { LayoutTemplate, Plus } from '@lucide/svelte';
	import type { TemplateDefinition } from '../model/types';

	let {
		templates,
		label = 'Add frame',
		onchoose
	}: {
		templates: readonly TemplateDefinition[];
		label?: string;
		onchoose: (template: TemplateDefinition) => void;
	} = $props();

	let menu: HTMLDetailsElement | undefined;

	function choose(template: TemplateDefinition) {
		onchoose(template);
		menu?.removeAttribute('open');
	}
</script>

<details class="template-insert" bind:this={menu}>
	<summary><Plus size={15} />{label}</summary>
	<div class="template-menu" dir="ltr" lang="en">
		<header><span>Choose a frame layout</span><small>Responsive templates</small></header>
		<div class="template-options">
			{#each templates as template (template.id)}
				<button type="button" onclick={() => choose(template)}>
					<span class="template-icon"><LayoutTemplate size={16} /></span>
					<span
						><strong>{template.name}</strong><small
							>{template.description || `${template.slots.length} content regions`}</small
						></span
					>
				</button>
			{/each}
		</div>
	</div>
</details>

<style>
	.template-insert {
		position: relative;
	}
	summary {
		display: inline-flex;
		min-block-size: 2.45rem;
		align-items: center;
		gap: 0.45rem;
		border-radius: 0.72rem;
		padding-inline: 0.9rem;
		background: var(--primary);
		color: var(--primary-foreground);
		font-size: 0.75rem;
		font-weight: 650;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:focus-visible {
		outline: 0.14rem solid var(--ring);
		outline-offset: 0.16rem;
	}
	.template-menu {
		position: absolute;
		z-index: 45;
		inset-block-end: calc(100% + 0.55rem);
		inset-inline-start: 50%;
		inline-size: min(23rem, calc(100vw - 2rem));
		border: 0.0625rem solid var(--border);
		border-radius: 0.9rem;
		padding: 0.55rem;
		background: var(--popover);
		box-shadow: 0 1.4rem 4rem -1.2rem color-mix(in oklab, var(--foreground) 26%, transparent);
		transform: translateX(-50%);
	}
	.template-menu header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem 0.5rem 0.65rem;
	}
	.template-menu header span {
		font-size: 0.75rem;
		font-weight: 700;
	}
	.template-menu header small {
		color: var(--muted-foreground);
		font-size: 0.62rem;
	}
	.template-options {
		display: grid;
		gap: 0.25rem;
		max-block-size: 18rem;
		overflow: auto;
	}
	.template-options button {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.65rem;
		inline-size: 100%;
		border: 0;
		border-radius: 0.68rem;
		padding: 0.62rem;
		background: transparent;
		color: var(--foreground);
		text-align: start;
		cursor: pointer;
	}
	.template-options button:hover,
	.template-options button:focus-visible {
		background: var(--muted);
		outline: none;
	}
	.template-icon {
		display: grid;
		inline-size: 2rem;
		block-size: 2rem;
		place-items: center;
		border-radius: 0.58rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}
	.template-options button > span:last-child {
		display: grid;
		min-inline-size: 0;
		gap: 0.12rem;
	}
	.template-options strong {
		overflow: hidden;
		font-size: 0.73rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.template-options small {
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.64rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
