const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

export type OpenRouterModel = {
	id: string;
	name: string;
	architecture?: {
		input_modalities?: unknown;
		output_modalities?: unknown;
		[key: string]: unknown;
	};
	pricing?: Record<string, unknown>;
	[key: string]: unknown;
};

export type OpenRouterModelsResponse = {
	data: OpenRouterModel[];
};

export async function fetchOpenRouterModels(
	fetcher: typeof fetch = fetch
): Promise<OpenRouterModelsResponse> {
	const response = await fetcher(OPENROUTER_MODELS_URL, {
		headers: {
			accept: 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error(`OpenRouter models request failed with status ${response.status}`);
	}

	const payload: unknown = await response.json();

	if (!isOpenRouterModelsResponse(payload)) {
		throw new Error('OpenRouter returned an invalid models response');
	}

	return payload;
}

export async function fetchFreeOpenRouterModels(
	fetcher: typeof fetch = fetch
): Promise<OpenRouterModelsResponse> {
	const { data } = await fetchOpenRouterModels(fetcher);

	return {
		data: data.filter(isFreeOpenRouterModel)
	};
}

export async function fetchFreeOpenRouterChatModels(
	fetcher: typeof fetch = fetch
): Promise<OpenRouterModelsResponse> {
	const { data } = await fetchFreeOpenRouterModels(fetcher);

	return {
		data: data.filter(supportsTextChat)
	};
}

function supportsTextChat(model: OpenRouterModel): boolean {
	const inputModalities = model.architecture?.input_modalities;
	const outputModalities = model.architecture?.output_modalities;

	return (
		Array.isArray(inputModalities) &&
		inputModalities.includes('text') &&
		Array.isArray(outputModalities) &&
		outputModalities.includes('text')
	);
}

function isFreeOpenRouterModel(model: OpenRouterModel): boolean {
	const pricing = model.pricing;

	if (!pricing) return false;

	let hasPrice = false;

	for (const [key, value] of Object.entries(pricing)) {
		if (key === 'overrides') {
			if (!hasOnlyFreeOverrides(value)) return false;
			continue;
		}

		if (value === null || value === undefined) continue;

		hasPrice = true;

		if (!isZeroPrice(value)) return false;
	}

	return hasPrice;
}

function hasOnlyFreeOverrides(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (!Array.isArray(value)) return false;

	return value.every((override) => {
		if (typeof override !== 'object' || override === null) return false;

		return Object.entries(override).every(
			([key, price]) => key.startsWith('min_') || price === null || isZeroPrice(price)
		);
	});
}

function isZeroPrice(value: unknown): boolean {
	return (
		(typeof value === 'string' || typeof value === 'number') && value !== '' && Number(value) === 0
	);
}

function isOpenRouterModelsResponse(value: unknown): value is OpenRouterModelsResponse {
	return (
		typeof value === 'object' &&
		value !== null &&
		'data' in value &&
		Array.isArray(value.data) &&
		value.data.every(
			(model) =>
				typeof model === 'object' &&
				model !== null &&
				'id' in model &&
				typeof model.id === 'string' &&
				'name' in model &&
				typeof model.name === 'string'
		)
	);
}
