import { json, type RequestHandler } from '@sveltejs/kit';
import {
	selectUserTranslationConnection,
	UserAiCredentialError
} from '$lib/server/ai-user-credentials';
import {
	apiFailure,
	ApiRequestError,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';

/** Assigns one saved connection to AI translation in the course authoring workspace. */
export const PUT: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const body = await readJsonObject(request);
		const viewer = requireViewer(locals);
		if (viewer.role === 'student') {
			throw new ApiRequestError(403, 'Teacher or administrator access is required.');
		}
		return json(await selectUserTranslationConnection(viewer.id, body.connectionId));
	} catch (error) {
		if (error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};
