<script lang="ts">
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
	import MicIcon from '@lucide/svelte/icons/mic';
	import ShapesIcon from '@lucide/svelte/icons/shapes';
	import TextCursorInputIcon from '@lucide/svelte/icons/text-cursor-input';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { libraryDragSource, type LessonDragController } from '../interactions/lesson-drag';
	import { Button } from '$lib/components/ui/button';
	import {
		WIDGET_DEFINITIONS,
		getWidgetCategories,
		type AnyWidgetDefinition,
		type WidgetCategoryDefinition
	} from '../registry';

	let {
		widgets = WIDGET_DEFINITIONS,
		categories = getWidgetCategories(),
		disabled = false,
		dragController,
		onAddWidget
	}: {
		widgets?: readonly AnyWidgetDefinition[];
		categories?: readonly WidgetCategoryDefinition[];
		disabled?: boolean;
		dragController?: LessonDragController;
		onAddWidget: (definition: AnyWidgetDefinition) => void;
	} = $props();

	const visibleCategories = $derived(
		categories
			.map((category) => ({
				...category,
				widgets: widgets.filter((widget) => widget.categoryId === category.id)
			}))
			.filter((category) => category.widgets.length > 0)
	);
</script>

<aside class="widget-library" aria-labelledby="widget-library-title">
	<div class="library-heading">
		<p class="eyebrow">Insert</p>
		<h2 id="widget-library-title">Widget library</h2>
		<p>Drag an activity's grip into the lesson, or click to add it to the selected region.</p>
	</div>

	{#if visibleCategories.length > 0}
		{#each visibleCategories as category (category.id)}
			<section class="category" aria-labelledby={`widget-category-${category.id}`}>
				<div class="category-heading">
					{#if category.icon === 'languages'}
						<LanguagesIcon aria-hidden="true" />
					{:else}
						<ShapesIcon aria-hidden="true" />
					{/if}
					<div>
						<h3 id={`widget-category-${category.id}`}>{category.label}</h3>
						{#if category.description}
							<p>{category.description}</p>
						{/if}
					</div>
				</div>

				<ul class="widget-list">
					{#each category.widgets as widget (widget.type)}
						<li
							use:libraryDragSource={{
								controller: dragController,
								widgetType: widget.type,
								disabled
							}}
						>
							<Button
								type="button"
								variant="ghost"
								size="lg"
								class="widget-card"
								{disabled}
								aria-label={`Add ${widget.label}`}
								onclick={() => onAddWidget(widget)}
							>
								<span class="widget-icon" aria-hidden="true">
									{#if widget.icon === 'book-open'}
										<BookOpenIcon />
									{:else if widget.icon === 'audio-lines'}
										<AudioLinesIcon />
									{:else if widget.icon === 'message-square-text'}
										<MessageSquareTextIcon />
									{:else if widget.icon === 'mic'}
										<MicIcon />
									{:else if widget.icon === 'languages'}
										<LanguagesIcon />
									{:else if widget.icon === 'text-cursor-input'}
										<TextCursorInputIcon />
									{:else}
										<ShapesIcon />
									{/if}
								</span>
								<span class="widget-copy">
									<strong>{widget.label}</strong>
									<span>{widget.description}</span>
								</span>
							</Button>
							{#if dragController}
								<button
									type="button"
									class="library-grip"
									data-library-grip
									aria-label={`Drag ${widget.label} into lesson`}
									title="Drag into lesson"
									onclick={() => onAddWidget(widget)}
									{disabled}><GripVertical size={16} /></button
								>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{:else}
		<p class="empty-message">No widgets are available yet.</p>
	{/if}
</aside>

<style>
	.widget-library {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-inline-size: 0;
		padding: clamp(0.75rem, 1.5vw, 1rem);
	}

	.library-heading,
	.category-heading > div,
	.widget-copy {
		min-inline-size: 0;
	}

	.eyebrow,
	h2,
	h3,
	p {
		margin: 0;
	}

	.eyebrow {
		color: var(--muted-foreground);
		font-size: 0.6875rem;
		font-weight: 650;
		letter-spacing: 0.08em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	h2 {
		margin-block-start: 0.15rem;
		font-size: 1rem;
		font-weight: 650;
	}

	.library-heading > p:last-child,
	.category-heading p,
	.widget-copy > span,
	.empty-message {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}

	.library-heading > p:last-child {
		margin-block-start: 0.25rem;
		font-size: 0.68rem;
	}

	.category {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.category-heading {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
	}

	.category-heading > :global(svg) {
		inline-size: 1rem;
		block-size: 1rem;
		margin-block-start: 0.1rem;
		color: var(--muted-foreground);
	}

	h3 {
		font-size: 0.8125rem;
		font-weight: 650;
	}

	.category-heading p {
		display: none;
	}

	.widget-list {
		display: grid;
		gap: 0.18rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.widget-list li {
		min-inline-size: 0;
		position: relative;
		padding-inline-end: 1.75rem;
	}
	.library-grip {
		position: absolute;
		inset-inline-end: -0.25rem;
		inset-block-start: 0.4rem;
		display: grid;
		place-items: center;
		inline-size: 2.25rem;
		block-size: 2.25rem;
		color: var(--muted-foreground);
		border-radius: 0.5rem;
		cursor: grab;
		touch-action: none;
	}
	.library-grip:hover {
		background: var(--muted);
	}
	.library-grip:focus-visible {
		outline: 0.125rem solid var(--ring);
	}

	.widget-list :global(.widget-card) {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		inline-size: 100%;
		block-size: auto;
		min-block-size: 2.75rem;
		padding: 0.45rem;
		border: 0;
		border-radius: 0.75rem;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		text-align: start;
		white-space: normal;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease;
	}

	.widget-list :global(.widget-card:hover:not(:disabled)) {
		background: color-mix(in oklch, var(--muted), transparent 24%);
	}

	.widget-list :global(.widget-card:focus-visible) {
		outline: 0.125rem solid var(--ring);
		outline-offset: 0.125rem;
	}

	.widget-list :global(.widget-card:disabled) {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.widget-icon {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		inline-size: 1.85rem;
		block-size: 1.85rem;
		border-radius: 0.55rem;
		background: color-mix(in oklch, var(--accent), transparent 10%);
		color: var(--accent-foreground);
	}

	.widget-icon :global(svg) {
		inline-size: 1rem;
		block-size: 1rem;
	}

	.widget-copy {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		gap: 0.15rem;
	}

	.widget-copy strong {
		font-size: 0.76rem;
		font-weight: 625;
		line-height: 1.4;
	}

	@container (max-width: 72rem) {
		.widget-library {
			gap: 1rem;
			padding: 1rem;
		}

		.widget-copy > span {
			display: none;
		}

		.widget-list li {
			padding-inline-end: 1.7rem;
		}

		.widget-list :global(.widget-card) {
			min-block-size: 3.15rem;
			gap: 0.55rem;
			padding: 0.5rem;
		}

		.widget-icon {
			inline-size: 2rem;
			block-size: 2rem;
		}

		.library-grip {
			inline-size: 2.2rem;
			block-size: 2.2rem;
			inset-block-start: 0.45rem;
		}
	}

	@container (max-width: 48rem) {
		.widget-library {
			gap: 0.8rem;
			padding: 0.85rem 1rem;
		}

		.library-heading > p:last-child {
			max-inline-size: 34rem;
			font-size: 0.7rem;
		}

		.category {
			gap: 0.45rem;
		}

		.category-heading p {
			display: none;
		}

		.widget-list {
			display: flex;
			gap: 0.4rem;
			overflow-x: auto;
			padding: 0.1rem 0.1rem 0.35rem;
			scroll-snap-type: inline proximity;
		}

		.widget-list li {
			inline-size: 8.25rem;
			flex: 0 0 auto;
			padding: 0;
			scroll-snap-align: start;
		}

		.widget-list :global(.widget-card) {
			align-items: center;
			min-block-size: 3rem;
			border: 0.0625rem solid var(--border);
			background: color-mix(in oklch, var(--background), transparent 4%);
		}

		.library-grip {
			display: none;
		}
	}
</style>
