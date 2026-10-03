import { test, expect } from '@playwright/test';

// Opt in: downloads public recordings and the configured real WASM model.
test('real configured STT transcribes explicit languages without detection', async ({
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
		'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav',
		'https://huggingface.co/datasets/FluidInference/fleurs-full/resolve/main/fa_ir/fa_ir_0000.wav'
	];
	for (const [index, url] of sources.entries()) {
		const response = await request.get(url);
		expect(response.ok()).toBe(true);
		const body = await response.body();
		await page.route(`**/speech-fixture-${index}.wav`, (route) =>
			route.fulfill({ body, contentType: 'audio/wav' })
		);
	}
	await page.goto('/en/tts-lab');
	const result = await page.evaluate(async () => {
		const enginePath = '/src/lib/features/speaking-practice/speech-engine.ts';
		const configPath = '/src/lib/features/speaking-practice/stt-config.ts';
		const { LocalSpeechEngine } = await import(enginePath);
		const { WEB_STT } = await import(configPath);
		const decoder = new AudioContext({ sampleRate: 16000 });
		const decode = async (index: number) => {
			const bytes = await (await fetch(`/speech-fixture-${index}.wav`)).arrayBuffer();
			return (await decoder.decodeAudioData(bytes)).getChannelData(0);
		};
		const englishEngine = new LocalSpeechEngine(undefined, 'english');
		let persianEngine: InstanceType<typeof LocalSpeechEngine> | null = null;
		try {
			const english = await englishEngine.transcribe(await decode(0), 'en');
			englishEngine.dispose();
			let persian = '';
			if (WEB_STT === 'whisper') {
				persianEngine = new LocalSpeechEngine(undefined, 'persian');
				persian = await persianEngine.transcribe(await decode(1), 'fa');
			}
			console.info('Real speech transcripts', JSON.stringify({ WEB_STT, english, persian }));
			return { webStt: WEB_STT, english, persian };
		} finally {
			englishEngine.dispose();
			persianEngine?.dispose();
			await decoder.close();
		}
	});
	expect(result.english.toLowerCase()).toContain('country');
	if (result.webStt === 'whisper') {
		expect(result.persian).toMatch(/[\u0600-\u06ff]/);
		expect(result.persian.trim().length).toBeGreaterThan(10);
	} else {
		expect(result.persian).toBe('');
	}
});
