import { json, type RequestHandler } from '@sveltejs/kit';
import {
	selectUserFreeChatConnection,
	UserAiCredentialError
} from '$lib/server/ai-user-credentials';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';

/** Assigns one saved connection to /chat. */
export const PUT: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const body = await readJsonObject(request);
		return json(await selectUserFreeChatConnection(requireViewer(locals).id, body.connectionId));
	} catch (error) {
		if (error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};
