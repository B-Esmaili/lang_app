import { json, type RequestHandler } from '@sveltejs/kit';
import { selectUserAiAssistant, UserAiCredentialError } from '$lib/server/ai-user-credentials';
import {
	apiFailure,
	assertSameOrigin,
	requireRouteParam,
	requireViewer
} from '$lib/server/api-request';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		return json(
			await selectUserAiAssistant(
				requireViewer(locals).id,
				requireRouteParam(params.connectionId, 'Connection ID')
			)
		);
	} catch (error) {
		if (error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};
