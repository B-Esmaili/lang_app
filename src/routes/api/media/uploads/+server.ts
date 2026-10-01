import { json, type RequestHandler } from '@sveltejs/kit';
import {
	MAX_MEDIA_UPLOAD_BYTES,
	MAX_MEDIA_UPLOAD_MEGABYTES,
	prepareMediaUpload
} from '$lib/server/media-storage';
import { createUploadedMediaAsset } from '$lib/server/media-library';
import {
	apiFailure,
	ApiRequestError,
	assertSameOrigin,
	requireViewer
} from '$lib/server/api-request';

const MULTIPART_OVERHEAD_ALLOWANCE = 1024 * 1024;

export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		if (!request.headers.get('content-type')?.toLowerCase().includes('multipart/form-data')) {
			throw new ApiRequestError(415, 'Upload media using multipart form data.');
		}
		const contentLength = Number(request.headers.get('content-length') ?? 0);
		if (
			Number.isFinite(contentLength) &&
			contentLength > MAX_MEDIA_UPLOAD_BYTES + MULTIPART_OVERHEAD_ALLOWANCE
		) {
			throw new ApiRequestError(
				413,
				`Media files must be ${MAX_MEDIA_UPLOAD_MEGABYTES} MB or smaller.`
			);
		}

		const form = await request.formData().catch(() => null);
		if (!form) throw new ApiRequestError(400, 'The upload could not be read.');
		const file = form.get('file');
		if (!(file instanceof File)) throw new ApiRequestError(400, 'Choose a media file to upload.');

		const upload = await prepareMediaUpload(file);
		const input: Record<string, unknown> = { folderId: form.get('folderId') };
		const name = form.get('name');
		if (typeof name === 'string' && name.trim()) input.name = name;
		const asset = await createUploadedMediaAsset(requireViewer(locals), input, upload);
		return json({ asset }, { status: 201 });
	} catch (error) {
		return apiFailure(error);
	}
};
