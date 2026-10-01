import { json } from '@sveltejs/kit';
import { fetchNineRouterModels } from '$lib/server/nine-router';
import {
	getUserFreeChatServiceOptions,
	UserAiCredentialError
} from '$lib/server/ai-user-credentials';
import { ApiRequestError, apiFailure, requireViewer } from '$lib/server/api-request';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch, locals }) => {
	try {
		const viewer = requireViewer(locals);
		const options = await getUserFreeChatServiceOptions(viewer.id, fetch);
		if (!options.model) return json({ error: 'AI model is not configured.' }, { status: 503 });
		const { data: models } = await fetchNineRouterModels(options);
		return json(models);
	} catch (cause) {
		if (cause instanceof UserAiCredentialError) {
			return json({ error: cause.message }, { status: cause.status });
		}
		if (cause instanceof ApiRequestError) {
			return apiFailure(cause);
		}
		return json(
			{ error: cause instanceof Error ? cause.message : 'AI provider models request failed' },
			{ status: 502 }
		);
	}
};
