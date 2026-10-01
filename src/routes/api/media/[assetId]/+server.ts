import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteMediaAsset, getMediaAsset, updateMediaAsset } from '$lib/server/media-library';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		return json({
			asset: await getMediaAsset(
				requireRouteParam(params.assetId, 'Media ID'),
				requireViewer(locals)
			)
		});
	} catch (error) {
		return apiFailure(error);
	}
};

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const asset = await updateMediaAsset(
			requireRouteParam(params.assetId, 'Media ID'),
			requireViewer(locals),
			await readJsonObject(request)
		);
		return json({ asset });
	} catch (error) {
		return apiFailure(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		await deleteMediaAsset(requireRouteParam(params.assetId, 'Media ID'), requireViewer(locals));
		return new Response(null, { status: 204 });
	} catch (error) {
		return apiFailure(error);
	}
};
