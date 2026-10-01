import { test, expect } from '@playwright/test';

// Opt in: these checks download public recordings and the real WASM model.
test('real WASM detects both languages and transcribes with Moonshine English and Whisper Persian', async ({
	page,
	request
}) => {
	test.skip(process.env.VOICE_CHAT_TEST_REAL_STT !== '1', 'Opt in to speech model downloads.');
	test.setTimeout(300_000);
	page.on('console', (message) => {
		if (message.type() === 'error' || message.text().startsWith('Real speech'))
			console.log(message.text());
	});
	const sources = [
		['en', 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav'],
		[
			'fa',
			'https://huggingface.co/datasets/FluidInference/fleurs-full/resolve/main/fa_ir/fa_ir_0000.wav'
		],
		[
			'fa',
			'https://huggingface.co/datasets/FluidInference/fleurs-full/resolve/main/fa_ir/fa_ir_0001.wav'
		]
	] as const;
	for (let index = 0; index < sources.length; index++) {
		console.log('Loading speech fixture', index);
		const response = await request.get(sources[index][1]);
		expect(response.ok()).toBe(true);
		const body = await response.body();
		await page.route(`**/speech-fixture-${index}.wav`, (route) =>
			route.fulfill({ body, contentType: 'audio/wav' })
		);
	}
	await page.goto('/en/tts-lab');
	console.log('Running real WASM speech worker');
	const { results, english, persian } = await page.evaluate(async () => {
		const path = '/src/lib/features/speaking-practice/speech-engine.ts';
		const { LocalSpeechEngine } = await import(path);
		const languagePath = '/src/lib/features/speaking-practice/speech-language.ts';
		const { needsLanguageReview } = await import(languagePath);
		let previousProgress = '';
		const engine = new LocalSpeechEngine((status: { phase: string; progress: number | null }) => {
			const progress = `${status.phase}:${Math.floor((status.progress ?? 0) / 20)}`;
			if (progress !== previousProgress) {
				console.info('Real speech progress', progress);
				previousProgress = progress;
			}
		}, 'bilingual');
		const englishEngine = new LocalSpeechEngine(undefined, 'english');
		const persianEngine = new LocalSpeechEngine(undefined, 'persian');
		const decoder = new AudioContext({ sampleRate: 16000 });
		const results = [];
		const recordings: Float32Array[] = [];
		try {
			for (const index of [0, 1, 2, 0]) {
				const bytes = await (await fetch(`/speech-fixture-${index}.wav`)).arrayBuffer();
				const audio = await decoder.decodeAudioData(bytes);
				recordings[index] = audio.getChannelData(0);
				const result = await engine.detectLanguage(recordings[index]);
				results.push({ index, ...result, needsReview: needsLanguageReview(result) });
				console.info('Real speech result', JSON.stringify(results.at(-1)));
			}
			const english = await englishEngine.transcribe(recordings[0], 'en');
			const persian = await persianEngine.transcribe(recordings[1], 'fa');
			console.info('Real speech transcripts', JSON.stringify({ english, persian }));
			return { results, english, persian };
		} finally {
			engine.dispose();
			englishEngine.dispose();
			persianEngine.dispose();
			await decoder.close();
		}
	});
	console.log(JSON.stringify(results, null, 2));
	expect(results.map((result) => result.language)).toEqual(['en', 'fa', 'fa', 'en']);
	// This actual Persian clip triggered the previous-language fallback and sent English.
	expect(results[2].needsReview).toBe(true);
	expect(results[0].needsReview).toBe(false);
	expect(english.toLowerCase()).toContain('country');
	expect(persian).toMatch(/[\u0600-\u06ff]/);
	expect(persian.trim().length).toBeGreaterThan(10);
});
