import { json, type RequestHandler } from '@sveltejs/kit';
import {
	removeUserAiConnection,
	updateUserAiConnection,
	UserAiCredentialError
} from '$lib/server/ai-user-credentials';
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
		const viewer = requireViewer(locals);
		const body = await readJsonObject(request);
		return json(
			await updateUserAiConnection(
				viewer.id,
				requireRouteParam(params.connectionId, 'Connection ID'),
				{
					label: body.label,
					provider: body.provider,
					baseUrl: body.baseUrl,
					model: body.model,
					apiKey: body.apiKey
				}
			)
		);
	} catch (error) {
		if (error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};

export const DELETE: RequestHandler = async ({ locals, params, request, url }) => {
	try {
		assertSameOrigin(request, url);
		await removeUserAiConnection(
			requireViewer(locals).id,
			requireRouteParam(params.connectionId, 'Connection ID')
		);
		return new Response(null, { status: 204 });
	} catch (error) {
		if (error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};
