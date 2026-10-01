import { json, type RequestHandler } from '@sveltejs/kit';
import { deleteMediaFolder, updateMediaFolder } from '$lib/server/media-library';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const folder = await updateMediaFolder(
			requireRouteParam(params.folderId, 'Folder ID'),
			requireViewer(locals),
			await readJsonObject(request)
		);
		return json({ folder });
	} catch (error) {
		return apiFailure(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		await deleteMediaFolder(requireRouteParam(params.folderId, 'Folder ID'), requireViewer(locals));
		return new Response(null, { status: 204 });
	} catch (error) {
		return apiFailure(error);
	}
};
