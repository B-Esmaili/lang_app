<script lang="ts">
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import { Button } from '$lib/components/ui/button';
	import type { VocabularyEntry, WidgetInstance } from '../../model/types';
	import EditableText from './EditableText.svelte';
	import WidgetSurface from './WidgetSurface.svelte';

	type VocabularyInstance = WidgetInstance<'language.vocabulary'>;

	let {
		widget,
		selected = false,
		editing = false,
		onSelect,
		onContentChange
	}: {
		widget: VocabularyInstance;
		selected?: boolean;
		editing?: boolean;
		onSelect: () => void;
		onContentChange: (content: VocabularyInstance['content']) => void;
	} = $props();

	let activeEntryId = $state('');
	const activeEntry = $derived(
		widget.content.entries.find((entry) => entry.id === activeEntryId) ??
			widget.content.entries[0] ??
			null
	);

	function updateEntry(entryId: string, patch: Partial<VocabularyEntry>) {
		onContentChange({
			...widget.content,
			entries: widget.content.entries.map((entry) =>
				entry.id === entryId ? { ...entry, ...patch } : entry
			)
		});
	}

	function addEntry() {
		const entry: VocabularyEntry = {
			id: createEntryId(),
			term: '',
			definition: ''
		};
		activeEntryId = entry.id;
		onSelect();
		onContentChange({ ...widget.content, entries: [...widget.content.entries, entry] });
	}

	function removeEntry(entryId: string) {
		const remainingEntries = widget.content.entries.filter((entry) => entry.id !== entryId);
		activeEntryId = remainingEntries[0]?.id ?? '';
		onContentChange({ ...widget.content, entries: remainingEntries });
	}

	function createEntryId() {
		return typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `vocabulary-${Date.now().toString(36)}`;
	}
</script>

<WidgetSurface widgetType={widget.type} label="Vocabulary" {selected} {editing} {onSelect}>
	<div class="widget-label" aria-hidden="true">
		<LanguagesIcon />
		<span>Vocabulary</span>
	</div>

	<div
		class="content-language vocabulary-content"
		lang={widget.content.language}
		dir={widget.content.direction}
	>
		<EditableText
			value={widget.content.title}
			editable={editing}
			multiline={false}
			tag="h3"
			placeholder="Vocabulary set title"
			ariaLabel="Vocabulary title"
			language={widget.content.language}
			direction={widget.content.direction}
			class="vocabulary-title"
			onFocus={onSelect}
			onChange={(title) => onContentChange({ ...widget.content, title })}
		/>

		{#if widget.content.entries.length > 0}
			<div class="term-list" aria-label="Vocabulary terms">
				{#each widget.content.entries as entry (entry.id)}
					<Button
						type="button"
						variant="secondary"
						size="sm"
						class={`term-button ${entry.id === activeEntry?.id ? 'is-active' : ''}`}
						lang={widget.content.language}
						dir={widget.content.direction}
						onclick={(event) => {
							event.stopPropagation();
							onSelect();
							activeEntryId = entry.id;
						}}
					>
						{entry.term || '…'}
					</Button>
				{/each}
				{#if editing}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="add-term-button"
						onclick={(event) => {
							event.stopPropagation();
							addEntry();
						}}
						dir="ltr"
						lang="en"
					>
						<PlusIcon />
						<span>Add term</span>
					</Button>
				{/if}
			</div>

			{#if activeEntry}
				<div class="entry-detail" aria-live="polite">
					<EditableText
						value={activeEntry.term}
						editable={editing}
						multiline={false}
						tag="h3"
						placeholder="Term"
						ariaLabel="Vocabulary term"
						language={widget.content.language}
						direction={widget.content.direction}
						class="entry-term"
						onFocus={onSelect}
						onChange={(term) => updateEntry(activeEntry.id, { term })}
					/>
					<EditableText
						value={activeEntry.definition}
						editable={editing}
						placeholder="Definition"
						ariaLabel="Vocabulary definition"
						language={widget.content.language}
						direction={widget.content.direction}
						class="entry-definition"
						onFocus={onSelect}
						onChange={(definition) => updateEntry(activeEntry.id, { definition })}
					/>

					{#if activeEntry.example || editing}
						<EditableText
							value={activeEntry.example ?? ''}
							editable={editing}
							placeholder="Add an example…"
							ariaLabel="Vocabulary example"
							language={widget.content.language}
							direction={widget.content.direction}
							class="entry-example"
							onFocus={onSelect}
							onChange={(example) => updateEntry(activeEntry.id, { example })}
						/>
					{/if}

					{#if editing}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="remove-term-button"
							onclick={(event) => {
								event.stopPropagation();
								removeEntry(activeEntry.id);
							}}
							dir="ltr"
							lang="en"
						>
							<TrashIcon />
							<span>Remove term</span>
						</Button>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="empty-state" dir="ltr" lang="en">
				<p class="empty-message">Build this set one term at a time.</p>
				{#if editing}
					<Button type="button" variant="secondary" size="sm" onclick={addEntry}>
						<PlusIcon />
						<span>Add first term</span>
					</Button>
				{/if}
			</div>
		{/if}
	</div>
</WidgetSurface>

<style>
	.widget-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-block-end: 0.65rem;
		color: var(--muted-foreground);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.widget-label :global(svg) {
		inline-size: 0.95rem;
		block-size: 0.95rem;
	}

	.content-language {
		text-align: start;
		unicode-bidi: plaintext;
		font-family: var(--font-content, 'Segoe UI', Tahoma, Arial, sans-serif);
	}

	.content-language:lang(fa),
	.content-language:lang(ar) {
		font-family: var(--font-content-arabic, Tahoma, 'Segoe UI', Arial, sans-serif);
	}

	:global(.vocabulary-title) {
		font-size: clamp(1rem, 1.5cqi, 1.18rem);
		font-weight: 680;
		line-height: 1.4;
	}

	.term-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-block: clamp(0.7rem, 1.7cqi, 1.1rem);
	}

	.term-list :global(.term-button) {
		border-radius: 999rem;
		background: color-mix(in oklch, var(--muted) 72%, transparent);
		padding-block: 0.38rem;
		padding-inline: 0.75rem;
		color: var(--muted-foreground);
		font-size: clamp(0.76rem, 1.05cqi, 0.88rem);
		text-align: start;
		unicode-bidi: plaintext;
		transition:
			background 140ms ease,
			color 140ms ease;
	}

	.term-list :global(.add-term-button) {
		border-radius: 999rem;
		color: var(--muted-foreground);
	}

	.term-list :global(.term-button:hover),
	.term-list :global(.term-button:focus-visible),
	.term-list :global(.term-button.is-active) {
		background: color-mix(in oklch, var(--primary) 11%, transparent);
		color: var(--foreground);
		outline: none;
	}

	.entry-detail {
		padding-block: clamp(0.75rem, 1.6cqi, 1rem);
		padding-inline: clamp(0.8rem, 1.8cqi, 1.15rem);
		border-inline-start: 0.18rem solid color-mix(in oklch, #8b5cf6 42%, transparent);
		background: linear-gradient(
			90deg,
			color-mix(in oklch, #8b5cf6 7%, transparent),
			transparent 72%
		);
	}

	[dir='rtl'] .entry-detail {
		background: linear-gradient(
			-90deg,
			color-mix(in oklch, #8b5cf6 7%, transparent),
			transparent 72%
		);
	}

	:global(.entry-term) {
		font-size: clamp(1.05rem, 1.8cqi, 1.35rem);
		font-weight: 720;
	}

	:global(.entry-definition) {
		margin-block-start: 0.25rem;
		font-size: clamp(0.88rem, 1.25cqi, 1rem);
		line-height: 1.55;
	}

	:global(.entry-example) {
		margin-block-start: 0.55rem;
		color: var(--muted-foreground);
		font-size: clamp(0.8rem, 1.1cqi, 0.92rem);
		font-style: italic;
		line-height: 1.55;
	}

	.entry-detail :global(.remove-term-button) {
		margin-block-start: 0.65rem;
		color: var(--destructive);
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-block-start: 0.7rem;
		padding: 0.75rem;
		border-radius: 0.75rem;
		background: color-mix(in oklch, var(--muted) 62%, transparent);
	}

	.empty-message {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 0.85rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.term-list :global(.term-button) {
			transition: none;
		}
	}
</style>
