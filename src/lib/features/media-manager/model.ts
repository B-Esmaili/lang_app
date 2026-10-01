/** The media leaves supported by the course renderer. */
export const MEDIA_ASSET_KINDS = ['audio', 'video', 'image'] as const;
export type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];

export type MediaFolder = Readonly<{
	id: string;
	ownerId: string;
	parentId: string | null;
	name: string;
	createdAt: string;
	updatedAt: string;
}>;

export type MediaAsset = Readonly<{
	id: string;
	ownerId: string;
	folderId: string | null;
	name: string;
	kind: MediaAssetKind;
	sourceUrl: string;
	mimeType: string | null;
	createdAt: string;
	updatedAt: string;
}>;

export type MediaLibrary = Readonly<{
	folders: MediaFolder[];
	assets: MediaAsset[];
}>;

export type MediaFolderTreeNode = MediaFolder & { children: MediaFolderTreeNode[] };
export type MediaFolderTreeRow = Readonly<{ folder: MediaFolderTreeNode; depth: number }>;

/** Builds a stable folder tree while safely ignoring stale/missing parents. */
export function buildMediaFolderTree(folders: readonly MediaFolder[]): MediaFolderTreeNode[] {
	const nodes = new Map<string, MediaFolderTreeNode>(
		folders.map((folder) => [folder.id, { ...folder, children: [] }])
	);
	const roots: MediaFolderTreeNode[] = [];
	for (const folder of folders) {
		const node = nodes.get(folder.id);
		if (!node) continue;
		const parent = folder.parentId ? nodes.get(folder.parentId) : undefined;
		if (!parent || parent.id === node.id) roots.push(node);
		else parent.children.push(node);
	}
	const sort = (items: MediaFolderTreeNode[]) => {
		items.sort((left, right) => left.name.localeCompare(right.name));
		for (const item of items) sort(item.children);
	};
	sort(roots);
	return roots;
}

export function flattenMediaFolderTree(
	nodes: readonly MediaFolderTreeNode[],
	depth = 0
): MediaFolderTreeRow[] {
	return nodes.flatMap((folder) => [
		{ folder, depth },
		...flattenMediaFolderTree(folder.children, depth + 1)
	]);
}

/** Returns a supported kind only when the URL has a recognizable media extension. */
export function inferMediaAssetKind(sourceUrl: string): MediaAssetKind | null {
	const pathname = sourceUrl.split(/[?#]/u, 1)[0]?.toLocaleLowerCase() ?? '';
	if (/\.(mp3|wav|m4a|ogg|flac|aac)$/u.test(pathname)) return 'audio';
	if (/\.(mp4|webm|mov|mkv|m4v)$/u.test(pathname)) return 'video';
	if (/\.(png|jpe?g|gif|webp|avif)$/u.test(pathname)) return 'image';
	return null;
}
