<script lang="ts" module>
	export { buildMediaPickerFolderTree, flattenMediaPickerFolderTree } from './model';
	export type {
		MediaPickerFolder,
		MediaPickerFolderTreeNode,
		MediaPickerFolderTreeRow,
		MediaPickerItem,
		MediaPickerKind
	} from './model';
</script>

<script lang="ts">
	import { AudioLines, Folder, FolderOpen, Image, Search, Video } from '@lucide/svelte';
	import {
		buildMediaPickerFolderTree,
		flattenMediaPickerFolderTree,
		type MediaPickerFolder,
		type MediaPickerItem
	} from './model';

	type MediaPickerProps = {
		items: readonly MediaPickerItem[];
		folders?: readonly MediaPickerFolder[];
		selectedId?: string | null;
		onSelect: (id: string) => void;
		label?: string;
		description?: string;
		searchPlaceholder?: string;
		emptyMessage?: string;
		disabled?: boolean;
	};

	let {
		items,
		folders = [],
		selectedId = null,
		onSelect,
		label = 'Media',
		description = '',
		searchPlaceholder = 'Search media',
		emptyMessage = 'No media matches your search.',
		disabled = false
	}: MediaPickerProps = $props();
	let query = $state('');
	let selectedFolderId = $state<string | null>(null);

	const folderRows = $derived(flattenMediaPickerFolderTree(buildMediaPickerFolderTree(folders)));
	const selectedFolder = $derived(
		selectedFolderId ? (folders.find((folder) => folder.id === selectedFolderId) ?? null) : null
	);
	const matchingItems = $derived(
		items.filter((item) => {
			const term = query.trim().toLocaleLowerCase();
			return !term || `${item.name} ${item.kind} ${item.description ?? ''}`.toLocaleLowerCase().includes(term);
		})
	);
	const displayedItems = $derived(
		query.trim()
			? matchingItems
			: folders.length
				? matchingItems.filter((item) => (item.folderId ?? null) === selectedFolderId)
				: matchingItems
	);

	function choose(item: MediaPickerItem) {
		if (disabled || item.disabled) return;
		onSelect(item.id);
	}

	function chooseFolder(id: string | null) {
		selectedFolderId = id;
		if (query) query = '';
	}
</script>

<section class="media-picker" class:has-folders={folders.length > 0} aria-label={label}>
	<header>
		<div><strong>{label}</strong>{#if description}<small>{description}</small>{/if}</div>
		<span>{items.length}</span>
	</header>
	<label class="search-control">
		<Search size={14} /><span class="sr-only">{searchPlaceholder}</span>
		<input bind:value={query} placeholder={searchPlaceholder} disabled={disabled} />
	</label>
	<div class="picker-content">
		{#if folders.length}
			<nav class="folder-browser" aria-label="Media folders">
				<button type="button" class:active={selectedFolderId === null} disabled={disabled} onclick={() => chooseFolder(null)}>
					<FolderOpen size={14} /><span>Library root</span>
				</button>
				{#each folderRows as row (row.folder.id)}
					<button
						type="button"
						class:active={selectedFolderId === row.folder.id}
						style:--folder-depth={row.depth}
						disabled={disabled}
						onclick={() => chooseFolder(row.folder.id)}
					>
						{#if row.folder.children.length}<FolderOpen size={14} />{:else}<Folder size={14} />{/if}
						<span>{row.folder.name}</span>
					</button>
				{/each}
			</nav>
		{/if}
		<div class="media-results">
			<div class="results-heading">
				<strong>{query.trim() ? 'Search results' : selectedFolder?.name ?? (folders.length ? 'Library root' : 'Available media')}</strong>
				<span>{displayedItems.length}</span>
			</div>
			{#if displayedItems.length}
				<div class="item-list" role="listbox" aria-label={label}>
					{#each displayedItems as item (item.id)}
						<button
							type="button"
							role="option"
							aria-selected={item.id === selectedId}
							class:selected={item.id === selectedId}
							disabled={disabled || item.disabled}
							onclick={() => choose(item)}
						>
							<span class="item-icon" data-kind={item.kind}>
								{#if item.kind === 'audio'}<AudioLines />{:else if item.kind === 'video'}<Video />{:else}<Image />{/if}
							</span>
							<span class="item-copy"><strong>{item.name}</strong><small>{item.description ?? item.kind}</small></span>
							<span class="selection-dot" aria-hidden="true"></span>
						</button>
					{/each}
				</div>
			{:else}
				<div class="empty-state"><Search size={17} /><span>{query.trim() ? emptyMessage : 'This folder has no media yet.'}</span></div>
			{/if}
		</div>
	</div>
</section>

<style>
	.media-picker { display: grid; gap: 0.45rem; min-inline-size: 0; }
	.media-picker header, .search-control, .item-list button, .folder-browser button { display: flex; align-items: center; }
	.media-picker header { justify-content: space-between; gap: 0.5rem; }
	.media-picker header > div { display: grid; min-inline-size: 0; gap: 0.08rem; }
	.media-picker header strong { font-size: 0.65rem; font-weight: 700; }
	.media-picker header small { color: var(--muted-foreground); font-size: 0.56rem; line-height: 1.3; }
	.media-picker header > span, .results-heading > span { display: grid; inline-size: 1.25rem; block-size: 1.25rem; flex: 0 0 auto; place-items: center; border-radius: 50%; background: var(--muted); color: var(--muted-foreground); font-size: 0.55rem; font-variant-numeric: tabular-nums; }
	.search-control { gap: 0.35rem; border: 0.0625rem solid var(--border); border-radius: 0.45rem; padding-inline: 0.45rem; background: var(--background); color: var(--muted-foreground); }
	.search-control:focus-within { border-color: color-mix(in oklab, var(--editor-selection) 58%, var(--border)); box-shadow: 0 0 0 0.125rem color-mix(in oklab, var(--editor-selection) 12%, transparent); }
	.search-control input { inline-size: 100%; min-inline-size: 0; min-block-size: 1.9rem; border: 0; background: transparent; color: var(--foreground); font: inherit; font-size: 0.64rem; outline: none; }
	.picker-content { display: grid; min-block-size: 15rem; }
	.has-folders .picker-content { grid-template-columns: minmax(8.5rem, 0.58fr) minmax(0, 1fr); border: 0.0625rem solid var(--border); border-radius: 0.55rem; overflow: hidden; }
	.folder-browser { display: grid; align-content: start; gap: 0.12rem; max-block-size: 19rem; overflow: auto; border-inline-end: 0.0625rem solid var(--border); padding: 0.35rem; background: color-mix(in oklab, var(--muted) 42%, transparent); }
	.folder-browser button { gap: 0.35rem; min-inline-size: 0; min-block-size: 1.8rem; border: 0; border-radius: 0.36rem; padding-inline: calc(0.38rem + var(--folder-depth, 0) * 0.65rem) 0.35rem; background: transparent; color: var(--muted-foreground); font: inherit; font-size: 0.59rem; text-align: start; cursor: pointer; }
	.folder-browser button:hover:not(:disabled), .folder-browser button.active { background: color-mix(in oklab, var(--editor-selection) 12%, transparent); color: var(--foreground); }
	.folder-browser button:disabled { cursor: not-allowed; opacity: 0.55; }
	.folder-browser button > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.folder-browser :global(svg) { flex: 0 0 auto; }
	.media-results { display: grid; align-content: start; min-inline-size: 0; }
	.results-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; padding: 0.45rem 0.5rem; border-block-end: 0.0625rem solid var(--border); }
	.results-heading strong { overflow: hidden; font-size: 0.6rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
	.results-heading > span { inline-size: 1rem; block-size: 1rem; font-size: 0.5rem; }
	.item-list { display: grid; gap: 0.25rem; max-block-size: 16rem; overflow: auto; padding: 0.35rem; }
	.item-list button { inline-size: 100%; gap: 0.45rem; min-inline-size: 0; border: 0.0625rem solid transparent; border-radius: 0.45rem; padding: 0.38rem; background: transparent; color: var(--foreground); text-align: start; cursor: pointer; }
	.item-list button:hover:not(:disabled) { background: color-mix(in oklab, var(--muted) 58%, transparent); }
	.item-list button.selected { border-color: color-mix(in oklab, var(--editor-selection) 32%, transparent); background: color-mix(in oklab, var(--editor-selection-soft) 68%, var(--background)); }
	.item-list button:disabled { cursor: not-allowed; opacity: 0.55; }
	.item-icon { display: grid; inline-size: 1.65rem; block-size: 1.65rem; flex: 0 0 auto; place-items: center; border-radius: 0.4rem; background: color-mix(in oklab, var(--muted) 72%, transparent); color: var(--muted-foreground); }
	.item-icon[data-kind='audio'] { background: color-mix(in oklab, #38bdf8 22%, transparent); color: #0369a1; }
	.item-icon[data-kind='video'] { background: color-mix(in oklab, #a78bfa 24%, transparent); color: #6d28d9; }
	.item-icon[data-kind='image'] { background: color-mix(in oklab, #34d399 23%, transparent); color: #047857; }
	.item-icon :global(svg) { inline-size: 0.88rem; }
	.item-copy { display: grid; min-inline-size: 0; flex: 1; gap: 0.06rem; }
	.item-copy strong, .item-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.item-copy strong { font-size: 0.64rem; font-weight: 650; }
	.item-copy small { color: var(--muted-foreground); font-size: 0.54rem; }
	.selection-dot { inline-size: 0.45rem; block-size: 0.45rem; flex: 0 0 auto; border: 0.0625rem solid var(--border); border-radius: 50%; }
	.selected .selection-dot { border-color: var(--editor-selection); background: var(--editor-selection); box-shadow: 0 0 0 0.12rem color-mix(in oklab, var(--editor-selection) 17%, transparent); }
	.empty-state { display: grid; min-block-size: 8rem; place-items: center; align-content: center; gap: 0.3rem; padding: 1rem; color: var(--muted-foreground); font-size: 0.6rem; text-align: center; }
	@media (max-width: 28rem) { .has-folders .picker-content { grid-template-columns: 1fr; } .folder-browser { display: flex; max-block-size: none; overflow-x: auto; border-inline-end: 0; border-block-end: 0.0625rem solid var(--border); } .folder-browser button { flex: 0 0 auto; } }
</style>
