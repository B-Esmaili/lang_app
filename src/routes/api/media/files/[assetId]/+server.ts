import type { RequestHandler } from '@sveltejs/kit';
import { MediaLibraryError, getReadableMediaAsset } from '$lib/server/media-library';
import { getStoredMediaFile, openStoredMediaStream } from '$lib/server/media-storage';
import { apiFailure, requireRouteParam, requireViewer } from '$lib/server/api-request';

type ByteRange = Readonly<{ start: number; end: number; partial: boolean }>;

export const GET: RequestHandler = async ({ locals, params, request }) => {
	try {
		const asset = await getReadableMediaAsset(
			requireRouteParam(params.assetId, 'Media ID'),
			requireViewer(locals)
		);
		const storedFile = await getStoredMediaFile(asset.id);
		if (!storedFile) throw new MediaLibraryError(404, 'The uploaded media file is unavailable.');

		const range = parseByteRange(request.headers.get('range'), storedFile.size);
		if (!range) {
			return new Response(null, {
				status: 416,
				headers: {
					'content-range': `bytes */${storedFile.size}`,
					'cache-control': 'private, no-store'
				}
			});
		}
		return new Response(openStoredMediaStream(asset.id, range.start, range.end), {
			status: range.partial ? 206 : 200,
			headers: {
				'accept-ranges': 'bytes',
				'cache-control': 'private, no-store',
				'content-length': String(range.end - range.start + 1),
				'content-type': asset.mimeType ?? 'application/octet-stream',
				'x-content-type-options': 'nosniff',
				...(range.partial
					? { 'content-range': `bytes ${range.start}-${range.end}/${storedFile.size}` }
					: {})
			}
		});
	} catch (error) {
		return apiFailure(error);
	}
};

function parseByteRange(header: string | null, size: number): ByteRange | null {
	if (!header) return { start: 0, end: size - 1, partial: false };
	const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
	if (!match) return null;
	const [, startText, endText] = match;
	if (!startText && !endText) return null;

	if (!startText) {
		const suffixLength = Number(endText);
		if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
		return { start: Math.max(0, size - suffixLength), end: size - 1, partial: true };
	}

	const start = Number(startText);
	const requestedEnd = endText ? Number(endText) : size - 1;
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(requestedEnd) ||
		start < 0 ||
		start >= size ||
		requestedEnd < start
	) {
		return null;
	}
	return { start, end: Math.min(requestedEnd, size - 1), partial: true };
}
