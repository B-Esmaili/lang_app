<script lang="ts">
	import { ChevronDown, Languages, LockKeyhole, StickyNote } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { CourseNote } from './course-notes';

	let {
		notes,
		position,
		onHighlight,
		onActivate
	}: {
		notes: readonly CourseNote[];
		position: { top: number; left: number; width: number };
		onHighlight?: (note: CourseNote | null) => void;
		onActivate?: (note: CourseNote) => void;
	} = $props();
	const stackId = $props.id();
	let expanded = $state(true);

	onMount(() => {
		const compact = window.matchMedia('(max-width: 38rem) and (max-height: 30rem)');
		const collapseInLandscape = () => {
			if (compact.matches) expanded = false;
		};
		collapseInLandscape();
		compact.addEventListener('change', collapseInLandscape);
		return () => compact.removeEventListener('change', collapseInLandscape);
	});

	function noteMeta(note: CourseNote): string {
		if (note.kind === 'translation') return note.language?.toUpperCase() ?? 'Translation';
		if (note.visibility === 'private') return 'Private';
		return note.authorName;
	}
</script>

{#if notes.length}
	<aside
		class="sentence-note-stack"
		class:collapsed={!expanded}
		data-reading-overlay="mobile-bottom"
		style:--stack-top={`${position.top}px`}
		style:--stack-left={`${position.left}px`}
		style:--anchor-width={`${position.width}px`}
		aria-label="Notes for the active sentence"
	>
		<header>
			<button
				type="button"
				class="stack-toggle"
				aria-expanded={expanded}
				aria-controls={stackId}
				onclick={() => (expanded = !expanded)}
			>
				<StickyNote size={16} aria-hidden="true" />
				<span>Translations & notes <span class="note-count">{notes.length}</span></span>
				<ChevronDown size={18} class={expanded ? '' : 'is-collapsed'} aria-hidden="true" />
			</button>
		</header>
		<div class="note-cards" id={stackId} hidden={!expanded}>
			{#each notes as note, index (note.id)}
				<button
					type="button"
					class="note-card"
					onclick={() => onActivate?.(note)}
					style:--stack-index={index}
					onmouseenter={() => onHighlight?.(note)}
					onmouseleave={() => onHighlight?.(null)}
					onfocus={() => onHighlight?.(note)}
					onblur={() => onHighlight?.(null)}
				>
					<div class="note-heading">
						<span class:translation={note.kind === 'translation'} class="note-kind">
							{#if note.kind === 'translation'}
								<Languages size={13} aria-hidden="true" /> Translation
							{:else}
								<StickyNote size={13} aria-hidden="true" /> Note
							{/if}
						</span>
						<span class="note-meta">
							{#if note.visibility === 'private'}
								<LockKeyhole size={11} aria-hidden="true" />
							{/if}
							{noteMeta(note)}
						</span>
					</div>
					<span class="note-body" dir="auto">{note.body}</span>
				</button>
			{/each}
		</div>
	</aside>
{/if}

<style>
	.sentence-note-stack {
		position: fixed;
		z-index: 55;
		inset-block-start: var(--stack-top);
		left: min(var(--stack-left), calc(100vw - min(25rem, calc(100vw - 1rem)) - 0.5rem));
		inline-size: min(25rem, calc(100vw - 1rem));
		max-block-size: min(24rem, calc(100dvh - var(--stack-top) - 0.75rem));
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		border: 1px solid color-mix(in oklch, var(--reader-accent) 34%, var(--border));
		border-radius: 0.8rem;
		background: color-mix(in oklch, var(--card) 96%, transparent);
		box-shadow: 0 18px 55px -20px #0008;
		backdrop-filter: blur(14px);
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		border-block-end: 1px solid var(--border);
		color: var(--muted-foreground);
	}
	.stack-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		inline-size: 100%;
		min-block-size: 2.75rem;
		padding: 0.5rem 0.75rem;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 650;
		text-align: start;
		cursor: pointer;
	}
	.stack-toggle > span {
		flex: 1;
	}
	.note-count {
		margin-inline-start: 0.3rem;
		color: var(--reader-accent);
	}
	.stack-toggle:focus-visible {
		outline: 2px solid var(--reader-accent);
		outline-offset: -3px;
	}
	.stack-toggle :global(.is-collapsed) {
		transform: rotate(180deg);
	}
	.collapsed header {
		border-block-end: 0;
	}
	.note-cards[hidden] {
		display: none;
	}
	.collapsed {
		grid-template-rows: auto;
	}
	.note-cards {
		display: grid;
		gap: 0.45rem;
		padding: 0.55rem;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.note-card {
		display: grid;
		gap: 0.45rem;
		inline-size: 100%;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.7rem;
		background: var(--card);
		color: var(--foreground);
		font: inherit;
		text-align: start;
		box-shadow: 0 calc(var(--stack-index) * 1px) calc(4px + var(--stack-index) * 2px) #00000012;
		outline: none;
		transition:
			border-color 120ms ease,
			transform 120ms ease;
	}
	.note-card:hover,
	.note-card:focus-visible {
		border-color: var(--reader-accent);
		transform: translateY(-1px);
	}
	.note-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.note-kind,
	.note-meta {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 650;
	}
	.note-kind {
		color: var(--reader-accent);
	}
	.note-kind.translation {
		color: color-mix(in oklch, var(--reader-accent) 70%, #166534);
	}
	.note-meta {
		min-inline-size: 0;
		color: var(--muted-foreground);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.note-body {
		display: block;
		font-size: 0.9rem;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	@media (max-width: 38rem) {
		.sentence-note-stack {
			inset-block-start: auto;
			inset-block-end: calc(
				var(--reader-visual-bottom, 0px) +
					max(
						var(--reader-player-clearance, 0px),
						calc(var(--app-bottom-inset, 0px) + 0.5rem),
						env(safe-area-inset-bottom)
					)
			);
			left: 0.5rem;
			right: 0.5rem;
			inline-size: auto;
			max-block-size: max(
				2.75rem,
				min(
					28dvh,
					15rem,
					calc(
						var(--reader-visual-height, 100dvh) - var(--reader-player-clearance, 0px) -
							var(--app-header-height, 4rem) - var(--study-toolbar-height, 4rem) - 8rem
					)
				)
			);
			border-radius: 0.9rem;
			box-shadow: 0 -0.25rem 1.5rem -0.75rem #0004;
		}
		.note-cards {
			gap: 0.4rem;
			padding: 0.45rem;
		}
		.note-card {
			padding: 0.6rem;
		}
		.note-body {
			font-size: 0.88rem;
			line-height: 1.55;
		}
	}

	@media (max-width: 38rem) and (max-height: 30rem) {
		.sentence-note-stack:not(.collapsed) {
			max-block-size: min(
				42dvh,
				15rem,
				calc(
					var(--reader-visual-height, 100dvh) - var(--reader-player-clearance, 0px) -
						var(--app-header-height, 4rem) - var(--study-toolbar-height, 4rem) - 2rem
				)
			);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.note-card {
			transition: none;
		}
	}
</style>
