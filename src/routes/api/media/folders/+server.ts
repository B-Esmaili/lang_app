import { json, type RequestHandler } from '@sveltejs/kit';
import { createMediaFolder } from '$lib/server/media-library';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';

export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const folder = await createMediaFolder(requireViewer(locals), await readJsonObject(request));
		return json({ folder }, { status: 201 });
	} catch (error) {
		return apiFailure(error);
	}
};
