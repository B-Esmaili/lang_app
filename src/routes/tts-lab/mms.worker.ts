import { env, pipeline, type TextToAudioPipeline } from '@huggingface/transformers';

type Request = {
	type: 'generate';
	id: string;
	text: string;
	language: 'fa' | 'en';
};

type Status = {
	type: 'status';
	id: string;
	phase: 'loading' | 'generating' | 'ready';
	progress: number | null;
	message: string;
};

const MODEL_IDS = {
	fa: 'payam1394/traxlate-mms-tts-fas',
	en: 'Xenova/mms-tts-eng'
} as const;

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
	env.backends.onnx.wasm.numThreads = 1;
	env.backends.onnx.wasm.proxy = false;
}

let synthesizer: TextToAudioPipeline | null = null;
let loading: Promise<TextToAudioPipeline> | null = null;
let loadedLanguage: Request['language'] | null = null;
let busy = false;

function send(message: Status | Record<string, unknown>): void {
	self.postMessage(message);
}

async function loadModel(
	id: string,
	language: Request['language']
): Promise<{ model: TextToAudioPipeline; loadMs: number }> {
	if (synthesizer && loadedLanguage === language) return { model: synthesizer, loadMs: 0 };
	if (synthesizer && 'dispose' in synthesizer) await synthesizer.dispose();
	synthesizer = null;
	loadedLanguage = null;

	const startedAt = performance.now();
	if (!loading) {
		const downloads = new Map<string, { loaded: number; total: number }>();
		loading = pipeline('text-to-speech', MODEL_IDS[language], {
			device: 'wasm',
			dtype: 'q8',
			progress_callback: (event) => {
				if (event.status === 'progress') {
					downloads.set(event.file, { loaded: event.loaded, total: event.total });
					const files = [...downloads.values()];
					const loaded = files.reduce((sum, file) => sum + file.loaded, 0);
					const total = files.reduce((sum, file) => sum + file.total, 0);
					send({
						type: 'status',
						id,
						phase: 'loading',
						progress: total ? Math.min(99, Math.round((loaded / total) * 100)) : null,
						message: `Downloading MMS q8 model · ${(loaded / 1_000_000).toFixed(1)} MB`
					});
				} else if (event.status === 'done') {
					send({
						type: 'status',
						id,
						phase: 'loading',
						progress: null,
						message: 'Preparing the MMS model…'
					});
				}
			}
		})
			.then((model) => {
				synthesizer = model;
				loadedLanguage = language;
				return model;
			})
			.catch((error: unknown) => {
				loading = null;
				throw error;
			});
	}

	return { model: await loading, loadMs: performance.now() - startedAt };
}

self.onmessage = async (event: MessageEvent<Request>) => {
	const request = event.data;
	if (request.type !== 'generate') return;

	if (busy) {
		send({ type: 'error', id: request.id, message: 'MMS is already generating audio.' });
		return;
	}

	busy = true;
	try {
		const { model, loadMs } = await loadModel(request.id, request.language);
		send({
			type: 'status',
			id: request.id,
			phase: 'generating',
			progress: null,
			message: 'Synthesizing locally with MMS…'
		});

		const inferenceStartedAt = performance.now();
		const output = await model(request.text);
		if (Array.isArray(output)) throw new Error('MMS returned an unexpected batch response.');

		const generationMs = performance.now() - inferenceStartedAt;
		const blob = await output.toBlob();
		const durationSeconds = output.audio.length / output.sampling_rate;

		send({
			type: 'result',
			id: request.id,
			blob,
			loadMs,
			generationMs,
			durationSeconds,
			sampleRate: output.sampling_rate,
			bytes: blob.size,
			cached: loadMs === 0
		});
		send({
			type: 'status',
			id: request.id,
			phase: 'ready',
			progress: 100,
			message: 'MMS output is ready.'
		});
	} catch (error) {
		send({
			type: 'error',
			id: request.id,
			message: error instanceof Error ? error.message : 'MMS synthesis failed.'
		});
	} finally {
		busy = false;
	}
};
