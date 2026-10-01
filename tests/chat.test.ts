import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AiServiceError, completeAiChat } from '../src/lib/server/ai-service';
import { ChatError, streamChat } from '../src/lib/server/chat';
import { fetchNineRouterModels, fetchOpenAiCompatibleModels } from '../src/lib/server/nine-router';

const input = {
	messages: [
		{ role: 'user', content: 'Remember blue' },
		{ role: 'assistant', content: 'OK' },
		{ role: 'user', content: 'What color?' }
	]
};

test('normalizes and limits the catalog to the configured gateway model', async () => {
	const fetcher: typeof fetch = async (_url, options) => {
		assert.equal(new Headers(options?.headers).has('authorization'), false);
		return Response.json({ data: [{ id: 'provider/model' }, { id: 'combo', name: 'My combo' }] });
	};
	assert.deepEqual(await fetchNineRouterModels({ fetcher, model: 'provider/model' }), {
		data: [{ id: 'provider/model', name: 'provider/model' }]
	});
});

test('lists the full provider catalog while configuring a connection', async () => {
	const fetcher: typeof fetch = async (url, options) => {
		assert.equal(String(url), 'https://provider.example/v1/models');
		assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-key');
		return Response.json({ data: [{ id: 'model-a' }, { id: 'model-b', name: 'Model B' }] });
	};

	assert.deepEqual(
		await fetchOpenAiCompatibleModels({
			baseUrl: 'https://provider.example/v1',
			apiKey: 'test-key',
			fetcher
		}),
		{
			data: [
				{ id: 'model-a', name: 'model-a' },
				{ id: 'model-b', name: 'Model B' }
			]
		}
	);
});

test('lists models from providers that do not require an API key', async () => {
	const fetcher: typeof fetch = async (url, options) => {
		assert.equal(String(url), 'http://localhost:11434/v1/models');
		assert.equal(new Headers(options?.headers).has('authorization'), false);
		return Response.json({ data: [{ id: 'local-model' }] });
	};

	assert.deepEqual(
		await fetchOpenAiCompatibleModels({
			baseUrl: 'http://localhost:11434/v1',
			fetcher
		}),
		{ data: [{ id: 'local-model', name: 'local-model' }] }
	);
});

test('sends authentication and complete history and preserves SSE bytes', async () => {
	const calls: string[] = [];
	const sse = 'data: {"choices":[{"delta":{"content":"Blue"}}]}\n\ndata: [DONE]\n\n';
	const fetcher: typeof fetch = async (url, options) => {
		calls.push(String(url));
		assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-key');
		if (String(url).endsWith('/models')) {
			return Response.json({ data: [{ id: 'provider/model' }] });
		}
		assert.equal(options?.method, 'POST');
		assert.deepEqual(JSON.parse(String(options?.body)), {
			model: 'provider/model',
			...input,
			stream: true
		});
		return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
	};
	const result = await streamChat(input, {
		baseUrl: 'http://localhost:20128/v1/',
		apiKey: 'test-key',
		model: 'provider/model',
		fetcher
	});
	assert.deepEqual(calls, [
		'http://localhost:20128/v1/models',
		'http://localhost:20128/v1/chat/completions'
	]);
	assert.equal(result.contentType, 'text/event-stream');
	assert.equal(await new Response(result.stream).text(), sse);
});

test('rejects invalid history before contacting the gateway', async () => {
	const fetcher: typeof fetch = async () => {
		throw new Error('Must not fetch');
	};
	await assert.rejects(
		streamChat({ ...input, messages: [] }, { fetcher }),
		(error: unknown) => error instanceof ChatError && error.status === 400
	);
});

test('rejects models absent from the gateway catalog', async () => {
	const fetcher: typeof fetch = async () => Response.json({ data: [] });
	await assert.rejects(
		streamChat(input, { fetcher, model: 'provider/model' }),
		(error: unknown) => error instanceof ChatError && error.status === 503
	);
});

test('preserves provider rate-limit errors', async () => {
	const fetcher: typeof fetch = async (url) =>
		String(url).endsWith('/models')
			? Response.json({ data: [{ id: 'provider/model' }] })
			: Response.json({ error: { message: 'Quota exhausted' } }, { status: 429 });
	await assert.rejects(
		streamChat(input, { fetcher, model: 'provider/model' }),
		(error: unknown) =>
			error instanceof ChatError && error.status === 429 && error.message === 'Quota exhausted'
	);
});

test('reports an unavailable AI provider', async () => {
	const fetcher: typeof fetch = async () => {
		throw new TypeError('fetch failed');
	};
	await assert.rejects(
		streamChat(input, { fetcher, model: 'provider/model' }),
		(error: unknown) =>
			error instanceof ChatError && error.status === 502 && error.message.includes('AI provider')
	);
});

test('exposes only the exact configured model', async () => {
	const fetcher: typeof fetch = async () =>
		Response.json({
			data: [
				{ id: 'gemini/one' },
				{ id: 'gemini/two' },
				{ id: 'gemini-other/one' },
				{ id: 'kr/selected' },
				{ id: 'kr/other' },
				{ id: 'my-combo' }
			]
		});
	const { data } = await fetchNineRouterModels({
		fetcher,
		model: 'kr/selected'
	});
	assert.deepEqual(
		data.map((model) => model.id),
		['kr/selected']
	);
});

test('missing chat model exposes no models and sends no upstream requests', async () => {
	const fetcher: typeof fetch = async () => {
		throw new Error('Must not fetch');
	};
	assert.deepEqual(await fetchNineRouterModels({ fetcher }), { data: [] });
	await assert.rejects(
		streamChat(input, { fetcher }),
		(error: unknown) => error instanceof ChatError && error.status === 503
	);
});

test('chat ignores a client-supplied model and always sends the configured model', async () => {
	const calls: Array<{ url: string; body?: unknown }> = [];
	const fetcher: typeof fetch = async (url, options) => {
		calls.push({ url: String(url), body: options?.body && JSON.parse(String(options.body)) });
		if (String(url).endsWith('/models')) {
			return Response.json({ data: [{ id: 'provider/configured' }] });
		}
		return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
	};
	await streamChat(
		{ ...input, model: 'provider/untrusted' },
		{ fetcher, model: 'provider/configured' }
	);
	assert.deepEqual(calls.at(-1)?.body, {
		model: 'provider/configured',
		messages: input.messages,
		stream: true
	});
});

test('returns a regular completion through the shared AI service', async () => {
	const fetcher: typeof fetch = async (url, options) => {
		if (String(url).endsWith('/models')) {
			return Response.json({ data: [{ id: 'provider/configured' }] });
		}
		assert.deepEqual(JSON.parse(String(options?.body)), {
			model: 'provider/configured',
			...input,
			stream: false
		});
		return Response.json({ choices: [{ message: { content: ' Clear explanation. ' } }] });
	};

	assert.equal(
		await completeAiChat(input, { fetcher, model: 'provider/configured' }),
		'Clear explanation.'
	);
});

test('empty completions report exhausted token budgets without exposing reasoning', async () => {
	for (const finishReason of ['length', 'stop']) {
		let completions = 0;
		const fetcher: typeof fetch = async (url) => {
			if (String(url).endsWith('/models'))
				return Response.json({ data: [{ id: 'provider/configured' }] });
			completions++;
			return Response.json({
				choices: [
					{
						finish_reason: finishReason,
						message: { content: null, reasoning_content: 'Internal reasoning, not an answer.' }
					}
				]
			});
		};
		await assert.rejects(
			completeAiChat(input, { fetcher, model: 'provider/configured', maxOutputTokens: 300 }),
			(error: unknown) => {
				assert.ok(error instanceof AiServiceError);
				assert.equal(error.status, 502);
				assert.match(
					error.message,
					finishReason === 'length' ? /token limit before producing an answer/ : /empty completion/
				);
				assert.doesNotMatch(error.message, /Internal reasoning/);
				return true;
			}
		);
		assert.equal(completions, 1, 'an empty response must not trigger unbounded retries');
	}
});
