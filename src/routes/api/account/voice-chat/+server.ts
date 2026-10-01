import { json, type RequestHandler } from '@sveltejs/kit';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';
import { UserAiCredentialError } from '$lib/server/ai-user-credentials';
import { getVoiceChatPreferences, saveVoiceChatPreferences } from '$lib/server/voice-chat-settings';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		return json(await getVoiceChatPreferences(requireViewer(locals).id), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return apiFailure(error);
	}
};

export const PUT: RequestHandler = async ({ locals, request, url }) => {
	try {
		assertSameOrigin(request, url);
		const viewer = requireViewer(locals);
		return json(await saveVoiceChatPreferences(viewer.id, await readJsonObject(request)), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		if (error instanceof UserAiCredentialError)
			return json({ error: error.message }, { status: error.status });
		return apiFailure(error);
	}
};
