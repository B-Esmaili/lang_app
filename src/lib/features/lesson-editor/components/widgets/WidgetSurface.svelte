<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { WidgetType } from '../../model/types';

	let {
		widgetType,
		label,
		selected = false,
		editing = false,
		onSelect,
		children
	}: {
		widgetType: WidgetType;
		label: string;
		selected?: boolean;
		editing?: boolean;
		onSelect: () => void;
		children: Snippet;
	} = $props();
</script>

<section
	class="widget-surface"
	class:is-selected={selected && editing}
	data-widget-type={widgetType}
	aria-label={`${label} widget`}
	dir="ltr"
	onfocusin={() => {
		if (editing) onSelect();
	}}
>
	{@render children()}
</section>

<style>
	.widget-surface {
		position: relative;
		min-inline-size: 0;
		padding: clamp(0.6rem, 1.5cqi, 1rem);
		border-radius: 0.55rem;
		outline: 0.0625rem solid transparent;
		outline-offset: 0.125rem;
	}
	:global(.lesson-editor.reader) .widget-surface {
		padding: clamp(0.2rem, 0.5cqi, 0.3rem);
	}

	.widget-surface.is-selected {
		outline-color: color-mix(in oklch, var(--ring) 58%, transparent);
	}
</style>
