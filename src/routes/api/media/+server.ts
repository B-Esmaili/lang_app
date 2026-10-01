import { json, type RequestHandler } from '@sveltejs/kit';
import { createMediaAsset, listMediaLibrary } from '$lib/server/media-library';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json(await listMediaLibrary(requireViewer(locals)));
	} catch (error) {
		return apiFailure(error);
	}
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const asset = await createMediaAsset(requireViewer(locals), await readJsonObject(request));
		return json({ asset }, { status: 201 });
	} catch (error) {
		return apiFailure(error);
	}
};
