import { json } from '@sveltejs/kit';
import { AiServiceError, streamAiChat } from '$lib/server/ai-service';
import {
	getUserFreeChatServiceOptions,
	UserAiCredentialError
} from '$lib/server/ai-user-credentials';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ fetch, locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const viewer = requireViewer(locals);
		const body = await readJsonObject(request);
		const { stream, contentType } = await streamAiChat(
			body,
			await getUserFreeChatServiceOptions(viewer.id, fetch)
		);

		return new Response(stream, {
			headers: {
				'cache-control': 'no-cache, no-transform',
				'content-type': contentType,
				'x-accel-buffering': 'no'
			}
		});
	} catch (cause) {
		if (cause instanceof AiServiceError || cause instanceof UserAiCredentialError) {
			return json({ error: cause.message }, { status: cause.status });
		}
		return apiFailure(cause);
	}
};
