import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	buildMediaPickerFolderTree,
	flattenMediaPickerFolderTree
} from '../src/lib/components/media-picker/model';

test('keeps a sorted nested folder hierarchy while preserving orphaned folders', () => {
	const tree = buildMediaPickerFolderTree([
		{ id: 'voice', name: 'Voice', parentId: 'lesson' },
		{ id: 'lesson', name: 'Lessons', parentId: null },
		{ id: 'orphan', name: 'Orphan', parentId: 'missing' },
		{ id: 'images', name: 'Images', parentId: null }
	]);

	assert.deepEqual(tree.map((folder) => folder.id), ['images', 'lesson', 'orphan']);
	assert.deepEqual(
		flattenMediaPickerFolderTree(tree).map((row) => `${row.depth}:${row.folder.id}`),
		['0:images', '0:lesson', '1:voice', '0:orphan']
	);
});
