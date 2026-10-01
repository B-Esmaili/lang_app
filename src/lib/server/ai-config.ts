import type { NineRouterOptions } from './nine-router';

/**
 * Resolves the authenticated user's OpenAI-compatible connection. The provider URL, API key,
 * and model are deliberately not read from the server environment.
 */
export function getAiServiceOptions(
	fetcher: typeof fetch = fetch,
	connection: { baseUrl: string; apiKey: string; model: string }
): NineRouterOptions {
	return {
		baseUrl: connection.baseUrl,
		apiKey: connection.apiKey,
		model: connection.model,
		fetcher
	};
}
