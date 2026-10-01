import { json, type RequestHandler } from '@sveltejs/kit';
import {
	createUserAiConnection,
	getUserAiConnectionApiKey,
	listUserAiConnections,
	UserAiCredentialError,
	validateOpenAiCompatibleConnection
} from '$lib/server/ai-user-credentials';
import { fetchOpenAiCompatibleModels } from '$lib/server/nine-router';
import {
	ApiRequestError,
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json(await listUserAiConnections(requireViewer(locals).id));
	} catch (error) {
		return apiFailure(error);
	}
};

/** Populates the model picker without persisting any key supplied by the form. */
export const POST: RequestHandler = async ({ fetch, locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const viewer = requireViewer(locals);
		const body = await readJsonObject(request);
		const validated = validateOpenAiCompatibleConnection({
			provider: body.provider,
			baseUrl: body.baseUrl,
			apiKey: body.apiKey
		});
		const apiKey =
			validated.apiKey ?? (await getUserAiConnectionApiKey(viewer.id, body.connectionId));
		return json(
			await fetchOpenAiCompatibleModels({ baseUrl: validated.baseUrl, apiKey, fetcher: fetch })
		);
	} catch (error) {
		if (error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		if (error instanceof ApiRequestError) return apiFailure(error);
		if (error instanceof Error) return json({ error: error.message }, { status: 502 });
		return apiFailure(error);
	}
};

export const PUT: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const viewer = requireViewer(locals);
		const body = await readJsonObject(request);
		return json(
			await createUserAiConnection(viewer.id, {
				label: body.label,
				provider: body.provider,
				baseUrl: body.baseUrl,
				model: body.model,
				apiKey: body.apiKey
			})
		);
	} catch (error) {
		if (error instanceof UserAiCredentialError) {
			return json({ error: error.message }, { status: error.status });
		}
		return apiFailure(error);
	}
};
