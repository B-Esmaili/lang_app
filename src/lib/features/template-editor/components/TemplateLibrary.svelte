<script lang="ts">
	import { Check, Languages, LayoutGrid, Plus, Search, X } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import type { LessonTemplateRecord } from '$lib/features/course-builder';
	import TemplateThumbnail from './TemplateThumbnail.svelte';

	let {
		templates,
		selectedId,
		busy = false,
		onselect,
		oncreate
	}: {
		templates: LessonTemplateRecord[];
		selectedId: string;
		busy?: boolean;
		onselect: (template: LessonTemplateRecord) => void;
		oncreate: () => void;
	} = $props();

	let query = $state('');
	const normalizedQuery = $derived(query.trim().normalize('NFKC').toLocaleLowerCase());
	const filtered = $derived(
		templates.filter((template) =>
			`${template.name} ${template.description}`
				.normalize('NFKC')
				.toLocaleLowerCase()
				.includes(normalizedQuery)
		)
	);
	const groups = $derived([
		{ title: 'Your templates', items: filtered.filter((template) => !template.isSystem) },
		{ title: 'Starter layouts', items: filtered.filter((template) => template.isSystem) }
	]);
</script>

<aside class="template-library" aria-label="Template library">
	<header class="library-header">
		<div class="heading">
			<LayoutGrid size={17} aria-hidden="true" />
			<h2>Layout library</h2>
		</div>
		<p>A thoughtful starting point for every lesson.</p>
		<Button class="w-full" onclick={oncreate} disabled={busy}>
			<Plus size={16} aria-hidden="true" />New template
		</Button>
	</header>

	<div class="library-filters">
		<label class="search-field">
			<Search size={16} aria-hidden="true" />
			<input
				aria-label="Search templates"
				type="search"
				placeholder="Search templates…"
				bind:value={query}
				dir="auto"
			/>
			{#if query}
				<button type="button" aria-label="Clear template search" onclick={() => (query = '')}>
					<X size={14} aria-hidden="true" />
				</button>
			{/if}
		</label>
		<Badge variant="secondary" class="category-badge">
			<Languages size={14} aria-hidden="true" />Language Learning
		</Badge>
	</div>

	<div class="template-sections">
		{#each groups as group (group.title)}
			{#if group.items.length}
				<section class="template-group" aria-label={group.title}>
					<h3>{group.title}<span>{group.items.length}</span></h3>
					<div class="template-list">
						{#each group.items as template (template.id)}
							<button
								type="button"
								class="template-card"
								class:active={selectedId === template.id}
								aria-label={`Open ${template.name}`}
								aria-pressed={selectedId === template.id}
								disabled={busy}
								onclick={() => onselect(template)}
							>
								<TemplateThumbnail
									definition={template.definition}
									selected={selectedId === template.id}
								/>
								<span class="card-copy">
									<span class="card-title">
										<strong dir="auto">{template.name}</strong>
										{#if selectedId === template.id}<Check size={15} aria-hidden="true" />{/if}
									</span>
									<span class="card-description" dir="auto"
										>{template.description || 'A flexible layout for your lesson.'}</span
									>
									<span class="card-meta"
										>{template.definition.slots.length}
										{template.definition.slots.length === 1 ? 'region' : 'regions'}<span
											aria-hidden="true">·</span
										>Responsive</span
									>
								</span>
							</button>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
		{#if !filtered.length}
			<div class="empty-state" role="status">
				<LayoutGrid size={24} strokeWidth={1.5} aria-hidden="true" />
				<strong>{normalizedQuery ? 'No matching templates' : 'Your next lesson starts here'}</strong
				>
				<p>
					{normalizedQuery
						? 'Try another name or a shorter search.'
						: 'Create a layout you can use again and again.'}
				</p>
				{#if normalizedQuery}
					<Button variant="ghost" size="sm" onclick={() => (query = '')}>Clear search</Button>
				{/if}
			</div>
		{:else if !normalizedQuery && !templates.some((template) => !template.isSystem)}
			<p class="library-hint">
				Choose a starter layout and make it your own, or begin with a blank template.
			</p>
		{/if}
	</div>
</aside>

<style>
	.template-library {
		display: flex;
		min-inline-size: 0;
		block-size: 100%;
		flex-direction: column;
		background: var(--studio-paper, var(--card));
		color: var(--studio-ink, var(--foreground));
	}

	.library-header {
		display: grid;
		gap: 0.75rem;
		padding: 1.25rem 1rem 1rem;
	}

	.heading {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.heading > :global(svg) {
		color: var(--studio-purple, var(--primary));
	}

	h2 {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 650;
	}

	.library-header p {
		margin: -0.25rem 0 0.125rem;
		color: var(--muted-foreground);
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.library-filters {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.8rem;
		padding: 0 1rem 1.15rem;
		border-block-end: 0.0625rem solid var(--border);
	}

	.search-field {
		display: flex;
		inline-size: 100%;
		min-inline-size: 0;
		align-items: center;
		gap: 0.4rem;
		padding-inline: 0.65rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.5rem;
		background: var(--background);
		color: var(--muted-foreground);
	}

	.search-field:focus-within {
		outline: 0.125rem solid
			color-mix(in oklab, var(--studio-purple, var(--primary)) 55%, transparent);
		outline-offset: 0.125rem;
	}

	.search-field > :global(svg) {
		flex-shrink: 0;
	}

	.search-field input {
		inline-size: 100%;
		min-inline-size: 0;
		block-size: 2.4rem;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: 0.8125rem;
	}

	.search-field input::-webkit-search-cancel-button {
		display: none;
	}

	.search-field button {
		display: grid;
		flex: 0 0 1.5rem;
		block-size: 1.5rem;
		place-items: center;
		border-radius: 0.25rem;
		color: inherit;
		cursor: pointer;
	}

	.search-field button:focus-visible {
		outline: 0.125rem solid var(--primary);
	}

	.library-filters :global(.category-badge) {
		gap: 0.4rem;
		padding: 0.375rem 0.55rem;
		background: var(--studio-lilac, var(--secondary));
		color: var(--studio-purple, var(--secondary-foreground));
		font-size: 0.75rem;
		font-weight: 550;
	}

	.template-sections {
		display: grid;
		align-content: start;
		gap: 1.5rem;
		overflow-y: auto;
		padding: 1.2rem 1rem;
		overscroll-behavior: contain;
	}

	.template-group h3 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0 0 0.75rem;
		font-size: 0.8125rem;
		font-weight: 650;
	}

	.template-group h3 > span {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		font-weight: 450;
	}

	.template-list {
		display: grid;
		gap: 0.8rem;
	}

	.template-card {
		display: grid;
		min-inline-size: 0;
		gap: 0.7rem;
		padding: 0.5rem;
		border: 0.0625rem solid transparent;
		border-radius: 0.8rem;
		background: transparent;
		text-align: start;
		cursor: pointer;
		transition:
			background 140ms ease,
			border-color 140ms ease;
	}

	.template-card:hover {
		background: color-mix(in oklab, var(--studio-workspace, var(--muted)) 70%, transparent);
	}

	.template-card.active {
		border-color: color-mix(in oklab, var(--studio-purple, var(--primary)) 45%, var(--border));
		background: color-mix(in oklab, var(--studio-lilac, var(--secondary)) 35%, transparent);
	}

	.template-card:focus-visible {
		outline: 0.125rem solid var(--studio-purple, var(--primary));
		outline-offset: 0.125rem;
	}

	.template-card:disabled {
		cursor: wait;
		opacity: 0.6;
	}

	.card-copy {
		display: grid;
		min-inline-size: 0;
		gap: 0.3rem;
		padding: 0 0.125rem 0.15rem;
	}

	.card-title {
		display: flex;
		min-inline-size: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.card-title strong {
		min-inline-size: 0;
		overflow: hidden;
		font-size: 0.875rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-title > :global(svg) {
		flex-shrink: 0;
		color: var(--studio-purple, var(--primary));
	}

	.card-description {
		display: -webkit-box;
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.5;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-block-start: 0.2rem;
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}

	.empty-state {
		display: grid;
		justify-items: center;
		gap: 0.75rem;
		padding-block: 1.5rem;
		text-align: center;
	}

	.empty-state > :global(svg) {
		color: var(--studio-purple, var(--primary));
	}

	.empty-state strong {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.empty-state p,
	.library-hint {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 0.8125rem;
		line-height: 1.6;
	}

	@media (prefers-reduced-motion: reduce) {
		.template-card {
			transition: none;
		}
	}
</style>
