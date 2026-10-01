import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import {
	MEDIA_ASSET_KINDS,
	inferMediaAssetKind,
	type MediaAsset,
	type MediaAssetKind,
	type MediaFolder,
	type MediaLibrary
} from '$lib/features/media-manager/model';
import { db } from '$lib/server/db';
import { mediaAsset, mediaFolder } from '$lib/server/db/media.schema';
import { course, courseEnrollment, courseMediaResource } from '$lib/server/db/course.schema';
import {
	isUploadedMediaSource,
	removeStoredMediaFile,
	storeMediaFile,
	type PreparedMediaUpload,
	uploadedMediaSourceUrl
} from '$lib/server/media-storage';

export type MediaLibraryViewer = { id: string; role: 'admin' | 'teacher' | 'student' };

export class MediaLibraryError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'MediaLibraryError';
	}
}

export async function listMediaLibrary(viewer: MediaLibraryViewer): Promise<MediaLibrary> {
	assertMediaAuthor(viewer);
	const [folders, assets] = await Promise.all([
		db
			.select()
			.from(mediaFolder)
			.where(eq(mediaFolder.ownerId, viewer.id))
			.orderBy(asc(mediaFolder.name), asc(mediaFolder.createdAt)),
		db
			.select()
			.from(mediaAsset)
			.where(eq(mediaAsset.ownerId, viewer.id))
			.orderBy(asc(mediaAsset.name), asc(mediaAsset.createdAt))
	]);
	return { folders: folders.map(serializeFolder), assets: assets.map(serializeAsset) };
}

export async function getMediaAsset(
	assetId: string,
	viewer: MediaLibraryViewer
): Promise<MediaAsset> {
	assertMediaAuthor(viewer);
	return serializeAsset(await requireAsset(assetId, viewer.id));
}

/** Resolves uploaded bytes for the owner or for an enrolled learner using a course resource. */
export async function getReadableMediaAsset(
	assetId: string,
	viewer: MediaLibraryViewer
): Promise<MediaAsset> {
	const [asset] = await db.select().from(mediaAsset).where(eq(mediaAsset.id, assetId)).limit(1);
	if (!asset) throw new MediaLibraryError(404, 'Media item not found.');
	if (viewer.role === 'admin' || (viewer.role === 'teacher' && asset.ownerId === viewer.id)) {
		return serializeAsset(asset);
	}
	const [enrollment] = await db
		.select({ courseId: course.id })
		.from(courseMediaResource)
		.innerJoin(course, eq(courseMediaResource.courseId, course.id))
		.innerJoin(
			courseEnrollment,
			and(
				eq(courseEnrollment.courseId, course.id),
				eq(courseEnrollment.userId, viewer.id),
				eq(courseEnrollment.status, 'active')
			)
		)
		.where(and(eq(courseMediaResource.mediaId, assetId), eq(course.status, 'published')))
		.limit(1);
	if (!enrollment) throw new MediaLibraryError(403, 'You do not have access to this media item.');
	return serializeAsset(asset);
}

export async function createMediaFolder(
	viewer: MediaLibraryViewer,
	input: Record<string, unknown>
): Promise<MediaFolder> {
	assertMediaAuthor(viewer);
	const name = requiredName(input.name, 'Folder name');
	const parentId = optionalId(input.parentId, 'Parent folder ID');
	if (parentId) await requireFolder(parentId, viewer.id);
	await assertAvailableFolderName(viewer.id, parentId, name);
	const [created] = await db
		.insert(mediaFolder)
		.values({ id: entityId('media-folder'), ownerId: viewer.id, parentId, name })
		.returning();
	return serializeFolder(created);
}

export async function updateMediaFolder(
	folderId: string,
	viewer: MediaLibraryViewer,
	input: Record<string, unknown>
): Promise<MediaFolder> {
	assertMediaAuthor(viewer);
	const existing = await requireFolder(folderId, viewer.id);
	const name = 'name' in input ? requiredName(input.name, 'Folder name') : existing.name;
	const parentId =
		'parentId' in input ? optionalId(input.parentId, 'Parent folder ID') : existing.parentId;
	if (parentId) await assertValidFolderParent(folderId, parentId, viewer.id);
	if (name !== existing.name || parentId !== existing.parentId) {
		await assertAvailableFolderName(viewer.id, parentId, name, folderId);
	}
	const [updated] = await db
		.update(mediaFolder)
		.set({ name, parentId, updatedAt: new Date() })
		.where(eq(mediaFolder.id, folderId))
		.returning();
	return serializeFolder(updated);
}

export async function deleteMediaFolder(
	folderId: string,
	viewer: MediaLibraryViewer
): Promise<void> {
	assertMediaAuthor(viewer);
	await requireFolder(folderId, viewer.id);
	const [folders, assets] = await Promise.all([
		db
			.select({ id: mediaFolder.id, parentId: mediaFolder.parentId })
			.from(mediaFolder)
			.where(eq(mediaFolder.ownerId, viewer.id)),
		db.select().from(mediaAsset).where(eq(mediaAsset.ownerId, viewer.id))
	]);
	const deletedFolderIds = new Set([folderId]);
	for (let found = true; found;) {
		found = false;
		for (const folder of folders) {
			if (
				folder.parentId &&
				deletedFolderIds.has(folder.parentId) &&
				!deletedFolderIds.has(folder.id)
			) {
				deletedFolderIds.add(folder.id);
				found = true;
			}
		}
	}
	const uploadedAssets = assets
		.map(serializeAsset)
		.filter(
			(asset) =>
				asset.folderId && deletedFolderIds.has(asset.folderId) && isUploadedMediaSource(asset)
		);
	await db.delete(mediaFolder).where(eq(mediaFolder.id, folderId));
	await removeUploadedMediaFiles(uploadedAssets);
}

export async function createMediaAsset(
	viewer: MediaLibraryViewer,
	input: Record<string, unknown>,
	options: { id?: string } = {}
): Promise<MediaAsset> {
	assertMediaAuthor(viewer);
	const sourceUrl = validSourceUrl(input.sourceUrl);
	const name = requiredName(input.name ?? defaultMediaName(sourceUrl), 'Media name');
	const folderId = optionalId(input.folderId, 'Folder ID');
	if (folderId) await requireFolder(folderId, viewer.id);
	const kind = validMediaKind(input.kind, sourceUrl);
	const mimeType = optionalText(input.mimeType, 'MIME type', 120);
	await assertAvailableAssetName(viewer.id, folderId, name);
	const [created] = await db
		.insert(mediaAsset)
		.values({
			id: options.id ?? entityId('media'),
			ownerId: viewer.id,
			folderId,
			name,
			kind,
			sourceUrl,
			mimeType
		})
		.returning();
	return serializeAsset(created);
}

/** Stores a validated file before atomically attaching it to a stable media identity. */
export async function createUploadedMediaAsset(
	viewer: MediaLibraryViewer,
	input: Record<string, unknown>,
	upload: PreparedMediaUpload
): Promise<MediaAsset> {
	assertMediaAuthor(viewer);
	const id = entityId('media');
	await storeMediaFile(id, upload.bytes);
	try {
		return await createMediaAsset(
			viewer,
			{
				...input,
				name: input.name ?? upload.originalName,
				kind: upload.kind,
				mimeType: upload.mimeType,
				sourceUrl: uploadedMediaSourceUrl(id)
			},
			{ id }
		);
	} catch (error) {
		await removeStoredMediaFile(id).catch(() => undefined);
		throw error;
	}
}

export async function updateMediaAsset(
	assetId: string,
	viewer: MediaLibraryViewer,
	input: Record<string, unknown>
): Promise<MediaAsset> {
	assertMediaAuthor(viewer);
	const existing = await requireAsset(assetId, viewer.id);
	const sourceUrl = 'sourceUrl' in input ? validSourceUrl(input.sourceUrl) : existing.sourceUrl;
	const name = 'name' in input ? requiredName(input.name, 'Media name') : existing.name;
	const folderId =
		'folderId' in input ? optionalId(input.folderId, 'Folder ID') : existing.folderId;
	if (folderId) await requireFolder(folderId, viewer.id);
	const kind =
		'kind' in input
			? validMediaKind(input.kind, sourceUrl)
			: validMediaKind(existing.kind, sourceUrl);
	const mimeType =
		'mimeType' in input ? optionalText(input.mimeType, 'MIME type', 120) : existing.mimeType;
	if (name !== existing.name || folderId !== existing.folderId) {
		await assertAvailableAssetName(viewer.id, folderId, name, assetId);
	}
	const [updated] = await db
		.update(mediaAsset)
		.set({ name, folderId, kind, sourceUrl, mimeType, updatedAt: new Date() })
		.where(eq(mediaAsset.id, assetId))
		.returning();
	const serialized = serializeAsset(updated);
	if (isUploadedMediaSource(serializeAsset(existing)) && !isUploadedMediaSource(serialized)) {
		await removeUploadedMediaFiles([serializeAsset(existing)]);
	}
	return serialized;
}

export async function deleteMediaAsset(
	assetId: string,
	viewer: MediaLibraryViewer
): Promise<MediaAsset> {
	assertMediaAuthor(viewer);
	const asset = await requireAsset(assetId, viewer.id);
	await db.delete(mediaAsset).where(eq(mediaAsset.id, assetId));
	const serialized = serializeAsset(asset);
	if (isUploadedMediaSource(serialized)) {
		await removeUploadedMediaFiles([serialized]);
	}
	return serialized;
}

async function removeUploadedMediaFiles(assets: readonly MediaAsset[]): Promise<void> {
	await Promise.all(
		assets.map(async (asset) => {
			try {
				await removeStoredMediaFile(asset.id);
			} catch (error) {
				console.error(`Could not remove uploaded media ${asset.id}.`, error);
			}
		})
	);
}

async function requireFolder(id: string, ownerId: string) {
	const [folder] = await db
		.select()
		.from(mediaFolder)
		.where(and(eq(mediaFolder.id, id), eq(mediaFolder.ownerId, ownerId)))
		.limit(1);
	if (!folder) throw new MediaLibraryError(404, 'Media folder not found.');
	return folder;
}

async function requireAsset(id: string, ownerId: string) {
	const [asset] = await db
		.select()
		.from(mediaAsset)
		.where(and(eq(mediaAsset.id, id), eq(mediaAsset.ownerId, ownerId)))
		.limit(1);
	if (!asset) throw new MediaLibraryError(404, 'Media item not found.');
	return asset;
}

async function assertValidFolderParent(folderId: string, parentId: string, ownerId: string) {
	if (folderId === parentId) throw new MediaLibraryError(400, 'A folder cannot contain itself.');
	let cursor: string | null = parentId;
	let depth = 0;
	while (cursor) {
		if (cursor === folderId)
			throw new MediaLibraryError(400, 'A folder cannot be moved into itself.');
		if (depth++ > 100) throw new MediaLibraryError(400, 'Folder nesting is too deep.');
		const folder = await requireFolder(cursor, ownerId);
		cursor = folder.parentId;
	}
}

async function assertAvailableFolderName(
	ownerId: string,
	parentId: string | null,
	name: string,
	excludeId?: string
) {
	const conditions = [eq(mediaFolder.ownerId, ownerId), eq(mediaFolder.name, name)];
	conditions.push(parentId ? eq(mediaFolder.parentId, parentId) : isNull(mediaFolder.parentId));
	if (excludeId) conditions.push(ne(mediaFolder.id, excludeId));
	const [existing] = await db
		.select({ id: mediaFolder.id })
		.from(mediaFolder)
		.where(and(...conditions))
		.limit(1);
	if (existing) throw new MediaLibraryError(409, 'A folder with this name already exists here.');
}

async function assertAvailableAssetName(
	ownerId: string,
	folderId: string | null,
	name: string,
	excludeId?: string
) {
	const conditions = [eq(mediaAsset.ownerId, ownerId), eq(mediaAsset.name, name)];
	conditions.push(folderId ? eq(mediaAsset.folderId, folderId) : isNull(mediaAsset.folderId));
	if (excludeId) conditions.push(ne(mediaAsset.id, excludeId));
	const [existing] = await db
		.select({ id: mediaAsset.id })
		.from(mediaAsset)
		.where(and(...conditions))
		.limit(1);
	if (existing)
		throw new MediaLibraryError(409, 'A media item with this name already exists here.');
}

function serializeFolder(row: typeof mediaFolder.$inferSelect): MediaFolder {
	return {
		id: row.id,
		ownerId: row.ownerId,
		parentId: row.parentId,
		name: row.name,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

function serializeAsset(row: typeof mediaAsset.$inferSelect): MediaAsset {
	return {
		id: row.id,
		ownerId: row.ownerId,
		folderId: row.folderId,
		name: row.name,
		kind: validMediaKind(row.kind, row.sourceUrl),
		sourceUrl: row.sourceUrl,
		mimeType: row.mimeType,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	};
}

function assertMediaAuthor(viewer: MediaLibraryViewer) {
	if (viewer.role === 'student') {
		throw new MediaLibraryError(403, 'Teacher or administrator access is required.');
	}
}

function requiredName(value: unknown, label: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new MediaLibraryError(400, `${label} is required.`);
	}
	const name = value.trim();
	if (name.length > 180) throw new MediaLibraryError(400, `${label} is too long.`);
	if (/[\u0000-\u001f]/u.test(name))
		throw new MediaLibraryError(400, `${label} contains invalid characters.`);
	return name;
}

function optionalId(value: unknown, label: string): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string' || !value.trim() || value.length > 200) {
		throw new MediaLibraryError(400, `${label} is invalid.`);
	}
	return value;
}

function optionalText(value: unknown, label: string, maximumLength: number): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string' || value.trim().length > maximumLength) {
		throw new MediaLibraryError(400, `${label} is invalid.`);
	}
	return value.trim();
}

function validSourceUrl(value: unknown): string {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > 4_000) {
		throw new MediaLibraryError(400, 'A media source URL is required.');
	}
	const sourceUrl = value.trim();
	if (sourceUrl.startsWith('/')) return sourceUrl;
	try {
		const url = new URL(sourceUrl);
		if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
	} catch {
		// Fall through to the safe user-facing error below.
	}
	throw new MediaLibraryError(400, 'Media source URLs must use HTTP(S) or start with /.');
}

function validMediaKind(value: unknown, sourceUrl: string): MediaAssetKind {
	if (value === undefined || value === null || value === '') {
		const inferredKind = inferMediaAssetKind(sourceUrl);
		if (inferredKind) return inferredKind;
		throw new MediaLibraryError(400, 'Choose whether this media is audio, video, or an image.');
	}
	if (typeof value !== 'string' || !MEDIA_ASSET_KINDS.includes(value as MediaAssetKind)) {
		throw new MediaLibraryError(400, 'Media must be audio, video, or an image.');
	}
	return value as MediaAssetKind;
}

function defaultMediaName(sourceUrl: string): string {
	const pathname = sourceUrl.split(/[?#]/u, 1)[0] ?? '';
	const name = pathname.split('/').at(-1)?.trim();
	return name || 'Untitled media';
}

function entityId(prefix: string): string {
	return `${prefix}.${crypto.randomUUID()}`;
}
