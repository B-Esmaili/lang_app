<script lang="ts">
	import AudioLinesIcon from '@lucide/svelte/icons/audio-lines';
	import CloudUploadIcon from '@lucide/svelte/icons/cloud-upload';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import ImageIcon from '@lucide/svelte/icons/image';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import VideoIcon from '@lucide/svelte/icons/video';
	import XIcon from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		MEDIA_ASSET_KINDS,
		buildMediaFolderTree,
		flattenMediaFolderTree,
		type MediaAsset,
		type MediaAssetKind,
		type MediaFolder,
		type MediaLibrary
	} from './model';

	type FolderForm = {
		id: string | null;
		name: string;
		parentId: string;
	};
	type AssetForm = {
		id: string | null;
		mode: 'url' | 'upload';
		name: string;
		folderId: string;
		sourceUrl: string;
		kind: MediaAssetKind;
		mimeType: string;
	};

	let { initialLibrary }: { initialLibrary: MediaLibrary } = $props();
	let library = $state<MediaLibrary>(untrack(() => structuredClone(initialLibrary)));
	let selectedFolderId = $state<string | null>(null);
	let folderForm = $state<FolderForm | null>(null);
	let assetForm = $state<AssetForm | null>(null);
	let selectedUploadFile = $state<File | null>(null);
	let uploadInput = $state<HTMLInputElement | null>(null);
	let busy = $state(false);
	let message = $state('');

	const folderRows = $derived(flattenMediaFolderTree(buildMediaFolderTree(library.folders)));
	const foldersById = $derived(new Map(library.folders.map((folder) => [folder.id, folder])));
	const selectedFolder = $derived(
		selectedFolderId
			? (library.folders.find((folder) => folder.id === selectedFolderId) ?? null)
			: null
	);
	const displayedFolders = $derived(
		library.folders
			.filter((folder) => folder.parentId === selectedFolderId)
			.toSorted((left, right) => left.name.localeCompare(right.name))
	);
	const displayedAssets = $derived(
		library.assets
			.filter((asset) => asset.folderId === selectedFolderId)
			.toSorted((left, right) => left.name.localeCompare(right.name))
	);

	function selectFolder(id: string | null) {
		selectedFolderId = id;
		message = '';
	}

	function startFolderCreate() {
		folderForm = { id: null, name: '', parentId: selectedFolderId ?? '' };
		assetForm = null;
	}

	function startFolderEdit(folder: MediaFolder) {
		folderForm = { id: folder.id, name: folder.name, parentId: folder.parentId ?? '' };
		assetForm = null;
	}

	function startAssetCreate() {
		assetForm = {
			id: null,
			mode: 'url',
			name: '',
			folderId: selectedFolderId ?? '',
			sourceUrl: '',
			kind: 'audio',
			mimeType: ''
		};
		selectedUploadFile = null;
		folderForm = null;
	}

	function startAssetUpload() {
		assetForm = {
			id: null,
			mode: 'upload',
			name: '',
			folderId: selectedFolderId ?? '',
			sourceUrl: '',
			kind: 'audio',
			mimeType: ''
		};
		selectedUploadFile = null;
		folderForm = null;
	}

	function startAssetEdit(asset: MediaAsset) {
		assetForm = {
			id: asset.id,
			mode: 'url',
			name: asset.name,
			folderId: asset.folderId ?? '',
			sourceUrl: asset.sourceUrl,
			kind: asset.kind,
			mimeType: asset.mimeType ?? ''
		};
		selectedUploadFile = null;
		folderForm = null;
	}

	async function saveFolder() {
		if (!folderForm) return;
		const form = { ...folderForm };
		await perform(async () => {
			await requestJson(form.id ? `/api/media/folders/${form.id}` : '/api/media/folders', {
				method: form.id ? 'PATCH' : 'POST',
				body: JSON.stringify({ name: form.name, parentId: form.parentId || null })
			});
			folderForm = null;
			await refresh();
			message = form.id ? 'Folder updated.' : 'Folder created.';
		});
	}

	async function saveAsset() {
		if (!assetForm) return;
		const form = { ...assetForm };
		if (form.mode === 'upload') {
			const file = selectedUploadFile;
			if (!file) {
				message = 'Choose an audio, video, or image file to upload.';
				return;
			}
			await perform(async () => {
				const body = new FormData();
				body.set('file', file);
				if (form.name.trim()) body.set('name', form.name);
				if (form.folderId) body.set('folderId', form.folderId);
				await requestUpload('/api/media/uploads', body);
				closeAssetForm();
				await refresh();
				message = 'Media uploaded.';
			});
			return;
		}
		await perform(async () => {
			await requestJson(form.id ? `/api/media/${form.id}` : '/api/media', {
				method: form.id ? 'PATCH' : 'POST',
				body: JSON.stringify({
					name: form.name,
					folderId: form.folderId || null,
					sourceUrl: form.sourceUrl,
					kind: form.kind,
					mimeType: form.mimeType || null
				})
			});
			closeAssetForm();
			await refresh();
			message = form.id ? 'Media item updated.' : 'Media item added.';
		});
	}

	async function removeFolder(folder: MediaFolder) {
		if (
			!globalThis.confirm(
				`Delete “${folder.name}” and every nested folder and media item inside it? This cannot be undone.`
			)
		)
			return;
		await perform(async () => {
			await requestJson(`/api/media/folders/${folder.id}`, { method: 'DELETE' });
			if (selectedFolderId === folder.id) selectedFolderId = null;
			await refresh();
			message = 'Folder and its contents deleted.';
		});
	}

	async function removeAsset(asset: MediaAsset) {
		if (
			!globalThis.confirm(
				`Delete “${asset.name}”? This removes the media record, not the remote file.`
			)
		)
			return;
		await perform(async () => {
			await requestJson(`/api/media/${asset.id}`, { method: 'DELETE' });
			await refresh();
			message = 'Media item deleted.';
		});
	}

	async function copyMediaId(id: string) {
		try {
			await navigator.clipboard.writeText(id);
			message = 'Media ID copied.';
		} catch {
			message = 'Could not copy the media ID.';
		}
	}

	function chooseUploadFile(event: Event) {
		selectedUploadFile = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		message = '';
	}

	function closeAssetForm() {
		assetForm = null;
		selectedUploadFile = null;
		if (uploadInput) uploadInput.value = '';
	}

	async function refresh() {
		library = await requestJson<MediaLibrary>('/api/media');
		if (selectedFolderId && !library.folders.some((folder) => folder.id === selectedFolderId)) {
			selectedFolderId = null;
		}
	}

	async function perform(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		message = '';
		try {
			await action();
		} catch (error) {
			message = error instanceof Error ? error.message : 'The media library could not be updated.';
		} finally {
			busy = false;
		}
	}

	async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
		const response = await fetch(path, {
			...init,
			headers: {
				accept: 'application/json',
				...(init.body ? { 'content-type': 'application/json' } : {})
			}
		});
		if (response.status === 204) return undefined as T;
		const body: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			const error =
				typeof body === 'object' &&
				body !== null &&
				'error' in body &&
				typeof body.error === 'string'
					? body.error
					: 'The media library could not be updated.';
			throw new Error(error);
		}
		return body as T;
	}

	async function requestUpload<T>(path: string, body: FormData): Promise<T> {
		const response = await fetch(path, {
			method: 'POST',
			headers: { accept: 'application/json' },
			body
		});
		const responseBody: unknown = await response.json().catch(() => null);
		if (!response.ok) {
			const error =
				typeof responseBody === 'object' &&
				responseBody !== null &&
				'error' in responseBody &&
				typeof responseBody.error === 'string'
					? responseBody.error
					: 'The media file could not be uploaded.';
			throw new Error(error);
		}
		return responseBody as T;
	}

	function formatBytes(bytes: number): string {
		return bytes < 1024 * 1024
			? `${Math.max(1, Math.round(bytes / 1024))} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<main class="media-manager">
	<header class="manager-header">
		<div>
			<p class="eyebrow">Asset library</p>
			<h1>Media manager</h1>
			<p>
				Organize reusable media by folder. Each media item has a permanent ID for course references.
			</p>
		</div>
		<div class="header-actions">
			<Button type="button" variant="outline" disabled={busy} onclick={startFolderCreate}
				><FolderIcon data-icon="inline-start" />New folder</Button
			>
			<Button type="button" variant="outline" disabled={busy} onclick={startAssetCreate}
				><LinkIcon data-icon="inline-start" />Add by URL</Button
			>
			<Button type="button" disabled={busy} onclick={startAssetUpload}
				><CloudUploadIcon data-icon="inline-start" />Upload media</Button
			>
		</div>
	</header>

	{#if message}<p class="manager-message" role="status">{message}</p>{/if}

	<div class="manager-layout">
		<aside class="folder-sidebar" aria-label="Media folders">
			<button
				type="button"
				class="root-folder"
				class:active={selectedFolderId === null}
				onclick={() => selectFolder(null)}
			>
				<FolderOpenIcon aria-hidden="true" />
				<span class="folder-copy"
					><strong>Library root</strong><small>Top-level folders</small></span
				>
			</button>
			{#each folderRows as row (row.folder.id)}
				<button
					type="button"
					class="folder-row"
					class:active={selectedFolderId === row.folder.id}
					class:child-folder={row.depth > 0}
					style:--folder-depth={row.depth}
					onclick={() => selectFolder(row.folder.id)}
				>
					{#if row.depth > 0}<span class="tree-elbow" aria-hidden="true"></span>{/if}
					{#if row.folder.children.length > 0}
						<FolderOpenIcon aria-hidden="true" />
					{:else}
						<FolderIcon aria-hidden="true" />
					{/if}
					<span class="folder-copy">
						<strong>{row.folder.name}</strong>
						{#if row.depth > 0}
							<small
								>inside {foldersById.get(row.folder.parentId ?? '')?.name ?? 'library root'}</small
							>
						{:else}
							<small>Top-level folder</small>
						{/if}
					</span>
				</button>
			{/each}
		</aside>

		<section class="library-content" aria-label="Media folder contents">
			<header class="content-header">
				<div>
					<p class="eyebrow">{selectedFolder ? 'Folder' : 'Library root'}</p>
					<h2>{selectedFolder?.name ?? 'All media'}</h2>
				</div>
				{#if selectedFolder}
					<div class="inline-actions">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => startFolderEdit(selectedFolder)}><PencilIcon /> Edit</Button
						>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => removeFolder(selectedFolder)}><Trash2Icon /> Delete</Button
						>
					</div>
				{/if}
			</header>

			{#if folderForm}
				<form
					class="editor-card"
					onsubmit={(event) => {
						event.preventDefault();
						void saveFolder();
					}}
				>
					<header>
						<strong>{folderForm.id ? 'Edit folder' : 'New folder'}</strong><Button
							type="button"
							variant="ghost"
							size="icon-xs"
							onclick={() => (folderForm = null)}><XIcon /></Button
						>
					</header>
					<label>Folder name<input bind:value={folderForm.name} maxlength="180" /></label>
					<label
						>Parent folder
						<select bind:value={folderForm.parentId}>
							<option value="">Library root</option>
							{#each library.folders.filter((folder) => folder.id !== folderForm?.id) as folder (folder.id)}
								<option value={folder.id}>{folder.name}</option>
							{/each}
						</select>
					</label>
					<footer>
						<Button type="button" variant="ghost" onclick={() => (folderForm = null)}>Cancel</Button
						><Button type="submit" disabled={busy}>Save folder</Button>
					</footer>
				</form>
			{/if}

			{#if assetForm}
				<form
					class="editor-card"
					onsubmit={(event) => {
						event.preventDefault();
						void saveAsset();
					}}
				>
					<header>
						<strong
							>{assetForm.id
								? 'Edit media'
								: assetForm.mode === 'upload'
									? 'Upload media'
									: 'Add media by URL'}</strong
						><Button type="button" variant="ghost" size="icon-xs" onclick={closeAssetForm}
							><XIcon /></Button
						>
					</header>
					<label
						>Display name<input
							bind:value={assetForm.name}
							maxlength="180"
							placeholder="Lesson narration"
						/></label
					>
					{#if assetForm.mode === 'upload'}
						<label class="upload-file-input">
							Media file<input
								bind:this={uploadInput}
								type="file"
								accept="audio/*,video/*,image/*,.aac,.flac,.m4a,.mkv"
								onchange={chooseUploadFile}
								required
							/>
							<small
								>{selectedUploadFile
									? `${selectedUploadFile.name} · ${formatBytes(selectedUploadFile.size)}`
									: 'Audio, video, or image. 50 MB maximum.'}</small
							>
						</label>
					{:else}
						<label
							>Source URL<input
								type="url"
								bind:value={assetForm.sourceUrl}
								maxlength="4000"
								placeholder="https://cdn.example.com/narration.mp3"
								required
							/></label
						>
					{/if}
					{#if assetForm.mode === 'url'}
						<label
							>Kind<select bind:value={assetForm.kind}
								>{#each MEDIA_ASSET_KINDS as kind}<option value={kind}>{kind}</option
									>{/each}</select
							></label
						>
						<label
							>Optional MIME type<input
								bind:value={assetForm.mimeType}
								maxlength="120"
								placeholder="audio/mpeg"
							/></label
						>
					{/if}
					<footer>
						<Button type="button" variant="ghost" onclick={closeAssetForm}>Cancel</Button><Button
							type="submit"
							disabled={busy}>{assetForm.mode === 'upload' ? 'Upload media' : 'Save media'}</Button
						>
					</footer>
				</form>
			{/if}

			{#if displayedFolders.length || displayedAssets.length}
				<div class="item-grid">
					{#each displayedFolders as folder (folder.id)}
						<article class="library-item folder-item">
							<button class="item-main" type="button" onclick={() => selectFolder(folder.id)}>
								<span class="item-icon"><FolderIcon /></span><span
									><strong>{folder.name}</strong><small>Folder</small></span
								>
							</button>
							<div class="item-actions">
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Edit ${folder.name}`}
									onclick={() => startFolderEdit(folder)}><PencilIcon /></Button
								><Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Delete ${folder.name}`}
									onclick={() => removeFolder(folder)}><Trash2Icon /></Button
								>
							</div>
						</article>
					{/each}
					{#each displayedAssets as asset (asset.id)}
						<article class="library-item asset-item">
							<div class="item-main">
								<span class="item-icon" data-kind={asset.kind}
									>{#if asset.kind === 'audio'}<AudioLinesIcon
										/>{:else if asset.kind === 'video'}<VideoIcon />{:else}<ImageIcon />{/if}</span
								>
								<span
									><strong>{asset.name}</strong><small
										>{asset.kind} · {asset.mimeType ?? 'No MIME type'}</small
									><code>{asset.id}</code></span
								>
							</div>
							<div class="item-actions">
								<a
									href={asset.sourceUrl}
									target="_blank"
									rel="noreferrer"
									aria-label={`Open ${asset.name}`}><LinkIcon /></a
								><Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Copy ID for ${asset.name}`}
									onclick={() => copyMediaId(asset.id)}><CopyIcon /></Button
								><Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Edit ${asset.name}`}
									onclick={() => startAssetEdit(asset)}><PencilIcon /></Button
								><Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Delete ${asset.name}`}
									onclick={() => removeAsset(asset)}><Trash2Icon /></Button
								>
							</div>
						</article>
					{/each}
				</div>
			{:else}
				<div class="empty-library">
					<FolderOpenIcon size={28} />
					<h3>This folder is empty.</h3>
					<p>Create a nested folder or add a media URL to give it a reusable identity.</p>
					<div>
						<Button type="button" variant="outline" onclick={startFolderCreate}>New folder</Button
						><Button type="button" onclick={startAssetCreate}>Add media</Button>
					</div>
				</div>
			{/if}
		</section>
	</div>
</main>

<style>
	.media-manager {
		display: grid;
		gap: 1rem;
		max-inline-size: 82rem;
		margin-inline: auto;
	}
	.manager-header,
	.content-header,
	.header-actions,
	.inline-actions,
	.item-actions,
	.editor-card header,
	.editor-card footer,
	.empty-library > div {
		display: flex;
		align-items: center;
	}
	.manager-header,
	.content-header {
		justify-content: space-between;
		gap: 1rem;
	}
	.manager-header > div:first-child {
		max-inline-size: 42rem;
	}
	.eyebrow,
	h1,
	h2,
	h3,
	p {
		margin: 0;
	}
	.eyebrow {
		color: var(--muted-foreground);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	h1 {
		margin-block: 0.18rem 0.4rem;
		font-size: clamp(1.65rem, 3.5vw, 2.35rem);
		letter-spacing: -0.045em;
	}
	.manager-header p:last-child {
		color: var(--muted-foreground);
		font-size: 0.8rem;
		line-height: 1.5;
	}
	.header-actions,
	.inline-actions,
	.item-actions,
	.empty-library > div {
		gap: 0.35rem;
		flex-wrap: wrap;
	}
	.manager-message {
		border-radius: 0.6rem;
		padding: 0.6rem 0.75rem;
		background: color-mix(in oklch, var(--accent) 55%, transparent);
		color: var(--accent-foreground);
		font-size: 0.78rem;
	}
	.manager-layout {
		display: grid;
		grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
		align-items: start;
		gap: 1rem;
	}
	.folder-sidebar {
		position: sticky;
		inset-block-start: calc(var(--app-header-height, 0rem) + 1rem);
		display: grid;
		gap: 0.12rem;
		max-block-size: calc(100svh - var(--app-header-height, 0rem) - 2rem);
		overflow: auto;
		border: 0.0625rem solid var(--border);
		border-radius: 0.8rem;
		padding: 0.45rem;
		background: var(--card);
	}
	.folder-sidebar button {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-inline-size: 0;
		min-block-size: 2.7rem;
		border: 0;
		border-radius: 0.45rem;
		padding-inline: 0.75rem;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: 0.78rem;
		text-align: start;
		cursor: pointer;
		overflow: visible;
		white-space: normal;
	}
	.folder-sidebar .root-folder {
		margin-block-end: 0.25rem;
		border-block-end: 0.0625rem solid var(--border);
		border-radius: 0.45rem 0.45rem 0;
	}
	.folder-sidebar .folder-row {
		padding-inline-start: 0.75rem;
	}
	.folder-sidebar .folder-row.child-folder {
		padding-inline-start: calc(0.75rem + var(--folder-depth) * 1.15rem);
		background: color-mix(in oklch, var(--muted) calc(8% + var(--folder-depth) * 4%), transparent);
	}
	.folder-sidebar .folder-row.child-folder::before {
		position: absolute;
		inset-block: 0;
		inset-inline-start: calc(0.63rem + (var(--folder-depth) - 1) * 1.15rem);
		border-inline-start: 0.0625rem solid color-mix(in oklch, var(--border) 85%, transparent);
		content: '';
	}
	.tree-elbow {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: calc(0.63rem + (var(--folder-depth) - 1) * 1.15rem);
		inline-size: 0.75rem;
		block-size: 50%;
		border-block-end: 0.0625rem solid color-mix(in oklch, var(--border) 85%, transparent);
		border-inline-start: 0.0625rem solid color-mix(in oklch, var(--border) 85%, transparent);
	}
	.folder-copy {
		display: grid;
		min-inline-size: 0;
		gap: 0.08rem;
	}
	.folder-copy strong,
	.folder-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.folder-copy strong {
		font-size: 0.76rem;
	}
	.folder-copy small {
		color: var(--muted-foreground);
		font-size: 0.61rem;
		line-height: 1.2;
	}
	.folder-sidebar button:hover,
	.folder-sidebar button.active {
		background: color-mix(in oklch, var(--accent) 75%, transparent);
	}
	.folder-sidebar :global(svg) {
		flex: 0 0 auto;
		inline-size: 0.95rem;
	}
	.library-content {
		display: grid;
		gap: 0.85rem;
		min-inline-size: 0;
		border: 0.0625rem solid var(--border);
		border-radius: 0.8rem;
		padding: clamp(0.75rem, 2vw, 1.15rem);
		background: var(--card);
	}
	.content-header h2 {
		margin-block-start: 0.15rem;
		font-size: 1.2rem;
		overflow-wrap: anywhere;
	}
	.editor-card {
		display: grid;
		gap: 0.7rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.7rem;
		padding: 0.8rem;
		background: color-mix(in oklch, var(--muted) 45%, var(--background));
	}
	.editor-card header {
		justify-content: space-between;
		gap: 0.5rem;
	}
	.editor-card label {
		display: grid;
		gap: 0.25rem;
		color: var(--muted-foreground);
		font-size: 0.72rem;
		font-weight: 600;
	}
	.editor-card input,
	.editor-card select {
		inline-size: 100%;
		min-block-size: 2.3rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.45rem;
		padding-inline: 0.6rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		font-size: 0.82rem;
	}
	.upload-file-input small {
		color: var(--muted-foreground);
		font-size: 0.66rem;
		font-weight: 500;
	}
	.upload-file-input input[type='file'] {
		padding-block: 0.35rem;
	}
	.editor-card footer {
		justify-content: flex-end;
		gap: 0.4rem;
	}
	.item-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.65rem;
	}
	.library-item {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.6rem;
		min-block-size: 8rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.7rem;
		padding: 0.7rem;
		background: var(--background);
	}
	.library-item:hover {
		border-color: color-mix(in oklch, var(--ring) 48%, var(--border));
	}
	.item-main {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		min-inline-size: 0;
		border: 0;
		padding: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: start;
	}
	button.item-main {
		cursor: pointer;
	}
	.item-main > span:last-child {
		display: grid;
		min-inline-size: 0;
		gap: 0.14rem;
	}
	.item-main strong {
		overflow: hidden;
		font-size: 0.82rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-main small,
	.item-main code {
		color: var(--muted-foreground);
		font-size: 0.68rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.item-main code {
		font-size: 0.61rem;
	}
	.item-icon {
		display: grid;
		flex: 0 0 auto;
		inline-size: 2.25rem;
		block-size: 2.25rem;
		place-items: center;
		border-radius: 0.55rem;
		background: color-mix(in oklch, var(--accent) 72%, transparent);
		color: var(--accent-foreground);
	}
	.item-icon[data-kind='audio'] {
		background: color-mix(in oklch, #38bdf8 25%, transparent);
		color: #0369a1;
	}
	.item-icon[data-kind='video'] {
		background: color-mix(in oklch, #a78bfa 26%, transparent);
		color: #6d28d9;
	}
	.item-icon[data-kind='image'] {
		background: color-mix(in oklch, #34d399 25%, transparent);
		color: #047857;
	}
	.item-icon :global(svg) {
		inline-size: 1.1rem;
	}
	.item-actions {
		justify-content: flex-end;
	}
	.item-actions a {
		display: grid;
		inline-size: 1.5rem;
		block-size: 1.5rem;
		place-items: center;
		border-radius: 0.35rem;
		color: var(--muted-foreground);
	}
	.item-actions a:hover {
		background: var(--muted);
		color: var(--foreground);
	}
	.empty-library {
		display: grid;
		min-block-size: 18rem;
		place-items: center;
		align-content: center;
		gap: 0.55rem;
		color: var(--muted-foreground);
		text-align: center;
	}
	.empty-library h3 {
		color: var(--foreground);
		font-size: 0.92rem;
	}
	.empty-library p {
		max-inline-size: 23rem;
		font-size: 0.75rem;
		line-height: 1.45;
	}
	@media (max-width: 48rem) {
		.manager-header {
			align-items: flex-start;
			flex-direction: column;
		}
		.manager-layout {
			grid-template-columns: 1fr;
		}
		.folder-sidebar {
			position: static;
			display: flex;
			max-block-size: none;
			overflow-x: auto;
		}
		.folder-sidebar button {
			flex: 0 0 auto;
		}
	}
	@media (max-width: 32rem) {
		.media-manager {
			gap: 0.75rem;
		}
		.header-actions {
			inline-size: 100%;
			gap: 0.25rem;
		}
		.header-actions :global(button) {
			flex: 1;
		}
		.item-grid {
			grid-template-columns: 1fr;
		}
		.library-content,
		.editor-card {
			padding: var(--panel-gutter);
		}
		.library-item {
			gap: 0.45rem;
			min-block-size: 0;
			padding: 0.55rem;
		}
		.folder-sidebar {
			padding: 0.35rem;
		}
		.folder-sidebar button {
			min-block-size: 2.45rem;
			padding-inline: 0.6rem;
		}
	}
</style>
