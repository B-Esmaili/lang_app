<script lang="ts">
	import { untrack } from 'svelte';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MonitorSmartphoneIcon from '@lucide/svelte/icons/monitor-smartphone';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import SmartphoneIcon from '@lucide/svelte/icons/smartphone';
	import TabletIcon from '@lucide/svelte/icons/tablet';
	import { Button } from '$lib/components/ui/button';
	import type { PreviewMode, TextDirection } from '../model/types';

	type EditorMode = 'edit' | 'preview';

	let {
		title,
		titleLanguage,
		titleDirection,
		mode,
		previewMode,
		onTitleChange,
		onModeChange,
		onPreviewModeChange,
		editable = true,
		blockSize = $bindable(0)
	}: {
		title: string;
		titleLanguage: string;
		titleDirection: TextDirection;
		mode: EditorMode;
		previewMode: PreviewMode;
		onTitleChange: (title: string) => boolean;
		onModeChange: (mode: EditorMode) => void;
		onPreviewModeChange: (mode: PreviewMode) => void;
		editable?: boolean;
		blockSize?: number;
	} = $props();

	const previewModes: ReadonlyArray<{ value: PreviewMode; label: string }> = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'desktop', label: 'Desktop' },
		{ value: 'tablet', label: 'Tablet' },
		{ value: 'phone', label: 'Phone' }
	];

	let titleInput = $state<HTMLInputElement>();
	let titleDraft = $state(untrack(() => title));

	$effect(() => {
		const currentTitle = title;
		if (globalThis.document?.activeElement !== titleInput) titleDraft = currentTitle;
	});

	function commitTitle() {
		const normalizedTitle = titleDraft.trim();
		if (!normalizedTitle) {
			titleDraft = title;
			return;
		}
		titleDraft = normalizedTitle;
		onTitleChange(normalizedTitle);
	}

	function titleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitTitle();
			titleInput?.blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			titleDraft = title;
			titleInput?.blur();
		}
	}
</script>

<header class="editor-toolbar" bind:offsetHeight={blockSize}>
	<div class="title-group">
		<p class="eyebrow">Lesson editor</p>
		{#if editable && mode === 'edit'}
			<label class="title-field">
				<span class="sr-only">Lesson title</span>
				<input
					bind:this={titleInput}
					bind:value={titleDraft}
					maxlength="180"
					lang={titleLanguage}
					dir={titleDirection}
					aria-label="Lesson title"
					onblur={commitTitle}
					onkeydown={titleKeydown}
				/>
				<PencilIcon size={13} aria-hidden="true" />
			</label>
		{:else}
			<h1 lang={titleLanguage} dir={titleDirection}>{title}</h1>
		{/if}
	</div>

	<div class="toolbar-controls">
		<div class="segmented-control" aria-label="Preview size">
			{#each previewModes as option (option.value)}
				<Button
					type="button"
					variant={previewMode === option.value ? 'secondary' : 'ghost'}
					size="sm"
					class={previewMode === option.value ? 'active' : undefined}
					aria-label={`${option.label} preview`}
					aria-pressed={previewMode === option.value}
					onclick={() => onPreviewModeChange(option.value)}
				>
					{#if option.value === 'auto'}
						<MonitorSmartphoneIcon aria-hidden="true" />
					{:else if option.value === 'desktop'}
						<MonitorIcon aria-hidden="true" />
					{:else if option.value === 'tablet'}
						<TabletIcon aria-hidden="true" />
					{:else}
						<SmartphoneIcon aria-hidden="true" />
					{/if}
					<span>{option.label}</span>
				</Button>
			{/each}
		</div>

		<div class="segmented-control" aria-label="Editor mode">
			{#if editable}
				<Button
					type="button"
					variant={mode === 'edit' ? 'secondary' : 'ghost'}
					size="sm"
					class={mode === 'edit' ? 'active' : undefined}
					aria-label="Edit"
					aria-pressed={mode === 'edit'}
					onclick={() => onModeChange('edit')}
				>
					<PencilIcon aria-hidden="true" />
					<span>Edit</span>
				</Button>
			{/if}
			<Button
				type="button"
				variant={mode === 'preview' ? 'secondary' : 'ghost'}
				size="sm"
				class={mode === 'preview' ? 'active' : undefined}
				aria-label="Preview"
				aria-pressed={mode === 'preview'}
				onclick={() => onModeChange('preview')}
			>
				<EyeIcon aria-hidden="true" />
				<span>Preview</span>
			</Button>
		</div>
	</div>
</header>

<style>
	.editor-toolbar {
		display: flex;
		position: sticky;
		inset-block-start: var(--editor-toolbar-offset, var(--app-header-height, 0rem));
		z-index: 15;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-block-size: 3.9rem;
		padding: 0.55rem clamp(0.85rem, 2vw, 1.5rem);
		background: var(--background);
		backdrop-filter: blur(0.75rem);
	}

	.editor-toolbar::before {
		position: absolute;
		inset-block-end: 100%;
		inset-inline: 0;
		block-size: var(--editor-toolbar-gap, 0rem);
		background: var(--editor-workspace);
		content: '';
	}

	.title-group {
		min-inline-size: 0;
	}

	.title-field {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-inline-size: 0;
	}

	.title-field input {
		min-inline-size: 8rem;
		inline-size: min(32rem, 42vw);
		border: 0;
		border-block-end: 0.0625rem solid transparent;
		outline: 0;
		padding: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: clamp(1rem, 1.8vw, 1.25rem);
		font-weight: 650;
		line-height: 1.4;
		text-align: start;
		text-overflow: ellipsis;
		unicode-bidi: plaintext;
	}

	.title-field input:hover {
		border-block-end-color: var(--border);
	}

	.title-field input:focus {
		border-block-end-color: var(--ring);
	}

	.title-field > :global(svg) {
		flex: 0 0 auto;
		color: var(--muted-foreground);
		opacity: 0.55;
	}

	.title-field:focus-within > :global(svg) {
		color: var(--foreground);
		opacity: 1;
	}

	.eyebrow,
	h1 {
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

	h1 {
		overflow: hidden;
		font-size: clamp(1rem, 1.8vw, 1.25rem);
		font-weight: 650;
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: start;
		unicode-bidi: plaintext;
	}

	h1:lang(fa),
	h1:lang(ar),
	.title-field input:lang(fa),
	.title-field input:lang(ar) {
		font-family: var(--font-arabic);
	}

	.toolbar-controls,
	.segmented-control,
	.segmented-control :global([data-slot='button']) {
		display: flex;
		align-items: center;
	}

	.toolbar-controls {
		gap: 0.45rem;
		flex: 0 0 auto;
	}

	.segmented-control {
		gap: 0.125rem;
		padding: 0.125rem;
		border: 0;
		border-radius: 0.6rem;
		background: color-mix(in oklch, var(--muted) 70%, transparent);
	}

	.segmented-control :global([data-slot='button']) {
		justify-content: center;
		gap: 0.4rem;
		min-block-size: 1.9rem;
		padding-inline: 0.55rem;
		border: 0;
		border-radius: 0.48rem;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 550;
		cursor: pointer;
		transition:
			background-color 140ms ease,
			color 140ms ease,
			box-shadow 140ms ease;
	}

	.segmented-control :global([data-slot='button']:hover) {
		color: var(--foreground);
	}

	.segmented-control :global([data-slot='button']:focus-visible) {
		outline: 0.125rem solid var(--ring);
		outline-offset: 0.125rem;
	}

	.segmented-control :global([data-slot='button'].active) {
		background: var(--background);
		box-shadow: 0 0.0625rem 0.25rem color-mix(in oklch, var(--foreground), transparent 90%);
		color: var(--foreground);
	}

	.segmented-control :global(svg) {
		inline-size: 0.95rem;
		block-size: 0.95rem;
	}

	@container (max-width: 50rem) {
		.editor-toolbar {
			align-items: flex-start;
			flex-direction: column;
		}

		.title-group {
			inline-size: 100%;
			max-inline-size: 100%;
		}

		.title-field input {
			inline-size: 100%;
		}

		.toolbar-controls {
			inline-size: 100%;
			flex-wrap: wrap;
			gap: 0.5rem;
		}
	}

	@container (max-width: 32rem) {
		.segmented-control :global([data-slot='button'] span) {
			display: none;
		}

		.segmented-control :global([data-slot='button']) {
			min-inline-size: 2rem;
			padding-inline: 0.45rem;
		}
	}
</style>
