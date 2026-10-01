import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareMediaUpload } from '../src/lib/server/media-storage';

test('prepares supported uploads with a reliable media kind and MIME type', async () => {
	const upload = await prepareMediaUpload(
		new File(['audio bytes'], 'lesson.mp3', { type: 'audio/mpeg' })
	);
	assert.equal(upload.kind, 'audio');
	assert.equal(upload.mimeType, 'audio/mpeg');
	assert.equal(upload.originalName, 'lesson.mp3');
});

test('rejects non-media files and mismatched media types', async () => {
	await assert.rejects(
		prepareMediaUpload(new File(['not media'], 'notes.pdf', { type: 'application/pdf' })),
		/Upload an audio, video, or image file/u
	);
	await assert.rejects(
		prepareMediaUpload(new File(['not really a video'], 'lesson.mp4', { type: 'audio/mpeg' })),
		/The file extension and media type do not match/u
	);
	await assert.rejects(
		prepareMediaUpload(new File(['<svg />'], 'illustration.svg', { type: 'image/svg+xml' })),
		/Upload an audio, video, or image file/u
	);
});
