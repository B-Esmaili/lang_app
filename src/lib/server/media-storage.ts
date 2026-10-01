import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import {
	inferMediaAssetKind,
	type MediaAsset,
	type MediaAssetKind
} from '$lib/features/media-manager/model';

/** Kept bounded because uploads are validated in memory before being persisted. */
export const MAX_MEDIA_UPLOAD_MEGABYTES = 50;
export const MAX_MEDIA_UPLOAD_BYTES = MAX_MEDIA_UPLOAD_MEGABYTES * 1024 * 1024;

export type PreparedMediaUpload = Readonly<{
	bytes: Uint8Array;
	kind: MediaAssetKind;
	mimeType: string;
	originalName: string;
}>;

type StoredMediaFile = Readonly<{
	size: number;
}>;

const MIME_KINDS: Readonly<Record<string, MediaAssetKind>> = {
	'audio/aac': 'audio',
	'audio/flac': 'audio',
	'audio/m4a': 'audio',
	'audio/mp3': 'audio',
	'audio/mp4': 'audio',
	'audio/mpeg': 'audio',
	'audio/ogg': 'audio',
	'audio/wav': 'audio',
	'audio/wave': 'audio',
	'image/avif': 'image',
	'image/gif': 'image',
	'image/jpeg': 'image',
	'image/png': 'image',
	'image/webp': 'image',
	'video/mp4': 'video',
	'video/quicktime': 'video',
	'video/webm': 'video',
	'video/x-matroska': 'video'
};

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
	aac: 'audio/aac',
	avif: 'image/avif',
	flac: 'audio/flac',
	gif: 'image/gif',
	jpeg: 'image/jpeg',
	jpg: 'image/jpeg',
	m4a: 'audio/mp4',
	m4v: 'video/mp4',
	mkv: 'video/x-matroska',
	mov: 'video/quicktime',
	mp3: 'audio/mpeg',
	mp4: 'video/mp4',
	ogg: 'audio/ogg',
	png: 'image/png',
	wav: 'audio/wav',
	webm: 'video/webm',
	webp: 'image/webp'
};

const DEFAULT_MIME_BY_KIND: Readonly<Record<MediaAssetKind, string>> = {
	audio: 'audio/mpeg',
	image: 'image/png',
	video: 'video/mp4'
};

export class MediaStorageError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'MediaStorageError';
	}
}

/** Validates and materializes an audio, video, or image file before it is stored. */
export async function prepareMediaUpload(file: File): Promise<PreparedMediaUpload> {
	if (!file.name.trim()) throw new MediaStorageError(400, 'The uploaded file must have a name.');
	if (file.size === 0) throw new MediaStorageError(400, 'The selected file is empty.');
	if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
		throw new MediaStorageError(
			413,
			`Media files must be ${MAX_MEDIA_UPLOAD_MEGABYTES} MB or smaller.`
		);
	}

	const fileNameKind = inferMediaAssetKind(file.name);
	const suppliedMimeType = file.type.trim().toLocaleLowerCase();
	const mimeKind = suppliedMimeType ? (MIME_KINDS[suppliedMimeType] ?? null) : null;
	if (!fileNameKind && !mimeKind) {
		throw new MediaStorageError(415, 'Upload an audio, video, or image file.');
	}
	if (fileNameKind && mimeKind && fileNameKind !== mimeKind) {
		throw new MediaStorageError(415, 'The file extension and media type do not match.');
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	if (bytes.byteLength === 0) throw new MediaStorageError(400, 'The selected file is empty.');
	return {
		bytes,
		kind: fileNameKind ?? mimeKind!,
		mimeType: acceptedMimeType(suppliedMimeType, file.name, fileNameKind ?? mimeKind!),
		originalName: basename(file.name)
	};
}

/** A same-origin source URL that resolves a media record to its uploaded bytes. */
export function uploadedMediaSourceUrl(mediaId: string): string {
	return `/api/media/files/${encodeURIComponent(mediaId)}`;
}

export function isUploadedMediaSource(asset: Pick<MediaAsset, 'id' | 'sourceUrl'>): boolean {
	return asset.sourceUrl === uploadedMediaSourceUrl(asset.id);
}

export async function storeMediaFile(mediaId: string, bytes: Uint8Array): Promise<void> {
	const destination = mediaFilePath(mediaId);
	await mkdir(mediaStorageDirectory(), { recursive: true });
	const temporary = `${destination}.${process.pid}.${randomUUID()}.upload`;
	try {
		await writeFile(temporary, bytes, { flag: 'wx' });
		await rename(temporary, destination);
	} catch (error) {
		await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

export async function removeStoredMediaFile(mediaId: string): Promise<void> {
	await unlink(mediaFilePath(mediaId)).catch((error: unknown) => {
		if (isMissingFile(error)) return;
		throw error;
	});
}

export async function getStoredMediaFile(mediaId: string): Promise<StoredMediaFile | null> {
	try {
		const details = await stat(mediaFilePath(mediaId));
		return details.isFile() ? { size: details.size } : null;
	} catch (error) {
		if (isMissingFile(error)) return null;
		throw error;
	}
}

export async function readStoredMediaFile(mediaId: string): Promise<Uint8Array | null> {
	try {
		return new Uint8Array(await readFile(mediaFilePath(mediaId)));
	} catch (error) {
		if (isMissingFile(error)) return null;
		throw error;
	}
}

export function openStoredMediaStream(
	mediaId: string,
	start = 0,
	end?: number
): ReadableStream<Uint8Array> {
	return Readable.toWeb(
		createReadStream(mediaFilePath(mediaId), { start, end })
	) as ReadableStream<Uint8Array>;
}

function mediaStorageDirectory(): string {
	return resolve(process.env.MEDIA_STORAGE_DIR?.trim() || join(process.cwd(), 'data', 'media'));
}

function mediaFilePath(mediaId: string): string {
	const fileName = createHash('sha256').update(mediaId).digest('hex');
	return join(mediaStorageDirectory(), fileName);
}

function acceptedMimeType(
	suppliedMimeType: string,
	fileName: string,
	kind: MediaAssetKind
): string {
	if (MIME_KINDS[suppliedMimeType] === kind) return suppliedMimeType;
	const extension = fileName.split('.').at(-1)?.toLocaleLowerCase() ?? '';
	return MIME_BY_EXTENSION[extension] ?? DEFAULT_MIME_BY_KIND[kind];
}

function isMissingFile(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
