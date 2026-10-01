import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	buildMediaFolderTree,
	flattenMediaFolderTree,
	inferMediaAssetKind,
	MEDIA_ASSET_KINDS,
	type MediaFolder
} from '../src/lib/features/media-manager/model';

function folder(id: string, name: string, parentId: string | null): MediaFolder {
	return {
		id,
		ownerId: 'user.1',
		parentId,
		name,
		createdAt: '2026-09-17T00:00:00.000Z',
		updatedAt: '2026-09-17T00:00:00.000Z'
	};
}

test('builds a stable nested media-folder tree and keeps orphaned folders reachable', () => {
	const tree = buildMediaFolderTree([
		folder('folder.audio', 'Audio', 'folder.lessons'),
		folder('folder.orphan', 'Recovered', 'missing-folder'),
		folder('folder.lessons', 'Lessons', null),
		folder('folder.video', 'Video', 'folder.lessons')
	]);

	assert.deepEqual(
		flattenMediaFolderTree(tree).map(({ folder, depth }) => [folder.id, depth]),
		[
			['folder.lessons', 0],
			['folder.audio', 1],
			['folder.video', 1],
			['folder.orphan', 0]
		]
	);
});

test('supports only audio, video, and image media leaves', () => {
	assert.deepEqual(MEDIA_ASSET_KINDS, ['audio', 'video', 'image']);
	assert.equal(inferMediaAssetKind('https://cdn.example.com/intro.mp3?download=1'), 'audio');
	assert.equal(inferMediaAssetKind('/media/lesson.webm#start'), 'video');
	assert.equal(inferMediaAssetKind('https://cdn.example.com/card.avif'), 'image');
	assert.equal(inferMediaAssetKind('https://cdn.example.com/guide.pdf'), null);
	assert.equal(inferMediaAssetKind('https://cdn.example.com/reference'), null);
});
