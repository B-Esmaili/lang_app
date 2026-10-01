export type MediaPickerKind = 'audio' | 'video' | 'image';

/** A context-free media record for selection interfaces. */
export type MediaPickerItem = Readonly<{
	id: string;
	name: string;
	kind: MediaPickerKind;
	folderId?: string | null;
	description?: string | null;
	disabled?: boolean;
}>;

/** A context-free folder record used to browse a media picker. */
export type MediaPickerFolder = Readonly<{
	id: string;
	name: string;
	parentId: string | null;
}>;

export type MediaPickerFolderTreeNode = MediaPickerFolder & {
	children: MediaPickerFolderTreeNode[];
};
export type MediaPickerFolderTreeRow = Readonly<{
	folder: MediaPickerFolderTreeNode;
	depth: number;
}>;

/** Builds a stable tree and treats missing or self-referential parents as roots. */
export function buildMediaPickerFolderTree(
	folders: readonly MediaPickerFolder[]
): MediaPickerFolderTreeNode[] {
	const nodes = new Map<string, MediaPickerFolderTreeNode>(
		folders.map((folder) => [folder.id, { ...folder, children: [] }])
	);
	const roots: MediaPickerFolderTreeNode[] = [];
	for (const folder of folders) {
		const node = nodes.get(folder.id);
		if (!node) continue;
		const parent = folder.parentId ? nodes.get(folder.parentId) : undefined;
		if (!parent || parent.id === node.id) roots.push(node);
		else parent.children.push(node);
	}
	const sort = (items: MediaPickerFolderTreeNode[]) => {
		items.sort((left, right) => left.name.localeCompare(right.name));
		for (const item of items) sort(item.children);
	};
	sort(roots);
	return roots;
}

/** Flattens a media-folder tree for keyboard-friendly tree browser rows. */
export function flattenMediaPickerFolderTree(
	nodes: readonly MediaPickerFolderTreeNode[],
	depth = 0
): MediaPickerFolderTreeRow[] {
	return nodes.flatMap((folder) => [
		{ folder, depth },
		...flattenMediaPickerFolderTree(folder.children, depth + 1)
	]);
}
