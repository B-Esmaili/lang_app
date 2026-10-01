import { json, type RequestHandler } from '@sveltejs/kit';
import {
	apiFailure,
	assertSameOrigin,
	readJsonObject,
	requireViewer
} from '$lib/server/api-request';
import { AiServiceError } from '$lib/server/ai-service';
import {
	getUserSelectedAiServiceOptions,
	UserAiCredentialError
} from '$lib/server/ai-user-credentials';
import { getVoiceChatPreferences } from '$lib/server/voice-chat-settings';
import { parseVoiceChatRequest, runVoiceChatTurn } from '$lib/server/voice-chat';

// Only one provider turn at a time per student in this server process.
const activeTurns = new Set<string>();

export const POST: RequestHandler = async ({ locals, request, url, fetch }) => {
	let activeUser: string | undefined;
	try {
		assertSameOrigin(request, url);
		const viewer = requireViewer(locals);
		const input = parseVoiceChatRequest(await readJsonObject(request));
		if (activeTurns.has(viewer.id))
			return json(
				{ error: 'A voice chat reply is already in progress. Please wait.' },
				{ status: 429 }
			);
		activeTurns.add(viewer.id);
		activeUser = viewer.id;
		const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]);
		const fetcher: typeof fetch = (resource, init) => fetch(resource, { ...init, signal });
		const preferences = await getVoiceChatPreferences(viewer.id);
		const options = await getUserSelectedAiServiceOptions(
			viewer.id,
			preferences.connectionId,
			fetcher
		);
		return json(await runVoiceChatTurn(input, options), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		if (error instanceof AiServiceError || error instanceof UserAiCredentialError)
			return json({ error: error.message }, { status: error.status });
		return apiFailure(error);
	} finally {
		if (activeUser) activeTurns.delete(activeUser);
	}
};
