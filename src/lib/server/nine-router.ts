export const DEFAULT_NINE_ROUTER_URL = 'http://127.0.0.1:20128/v1';

export type NineRouterOptions = {
	baseUrl?: string;
	apiKey?: string;
	fetcher?: typeof fetch;
	/** The one exact gateway model ID that the application may use. */
	model?: string;
};

export type NineRouterModel = {
	id: string;
	name: string;
};

export function nineRouterUrl(baseUrl = DEFAULT_NINE_ROUTER_URL, path: string): string {
	return `${baseUrl.replace(/\/+$/, '')}/${path}`;
}

/** Lists chat models exposed by an OpenAI-compatible provider. */
export async function fetchNineRouterModels({
	baseUrl,
	apiKey,
	model,
	fetcher = fetch
}: NineRouterOptions = {}): Promise<{ data: NineRouterModel[] }> {
	const configuredModel = model?.trim();
	if (!configuredModel) return { data: [] };
	const { data } = await fetchOpenAiCompatibleModels({ baseUrl, apiKey, fetcher });
	return { data: data.filter((gatewayModel) => gatewayModel.id === configuredModel) };
}

/** Lists every model exposed by a user-supplied OpenAI-compatible connection. */
export async function fetchOpenAiCompatibleModels({
	baseUrl,
	apiKey,
	fetcher = fetch
}: Pick<NineRouterOptions, 'baseUrl' | 'apiKey' | 'fetcher'> = {}): Promise<{
	data: NineRouterModel[];
}> {
	const headers = new Headers({ accept: 'application/json' });
	if (apiKey) headers.set('authorization', `Bearer ${apiKey}`);

	let response: Response;
	try {
		response = await fetcher(nineRouterUrl(baseUrl, 'models'), { headers });
	} catch {
		throw new Error('Could not connect to the AI provider. Check the base URL and API key.');
	}
	if (!response.ok) {
		throw new Error(`AI provider models request failed with status ${response.status}`);
	}

	const payload: unknown = await response.json();
	if (
		typeof payload !== 'object' ||
		payload === null ||
		!('data' in payload) ||
		!Array.isArray(payload.data)
	) {
		throw new Error('The AI provider returned an invalid models response');
	}

	const data = payload.data.map((model: unknown): NineRouterModel => {
		if (
			typeof model !== 'object' ||
			model === null ||
			!('id' in model) ||
			typeof model.id !== 'string' ||
			!model.id.trim()
		) {
			throw new Error('The AI provider returned an invalid model');
		}
		return {
			id: model.id,
			name:
				'name' in model && typeof model.name === 'string' && model.name.trim()
					? model.name
					: model.id
		};
	});
	return { data };
}
