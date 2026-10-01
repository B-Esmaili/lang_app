import { error } from '@sveltejs/kit';
import { query } from '$app/server';
import {
	fetchFreeOpenRouterChatModels,
	type OpenRouterModelsResponse
} from '$lib/server/openrouter';

export type { OpenRouterModel, OpenRouterModelsResponse } from '$lib/server/openrouter';

export const getOpenRouterModels = query(async (): Promise<OpenRouterModelsResponse> => {
	try {
		return await fetchFreeOpenRouterChatModels();
	} catch (cause) {
		error(502, cause instanceof Error ? cause.message : 'OpenRouter models request failed');
	}
});
