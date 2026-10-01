/// <reference lib="webworker" />

import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

type WhisperModel = 'tiny' | 'base';
type LabLanguage = 'fa' | 'en';

type Request = {
	type: 'transcribe';
	id: string;
	model: WhisperModel;
	language: LabLanguage;
	samples: Float32Array;
};

type ProgressEvent = {
	status?: string;
	progress?: number;
	file?: string;
};

const MODEL_IDS: Record<LabLanguage, Record<WhisperModel, string>> = {
	fa: {
		tiny: 'onnx-community/whisper-tiny',
		base: 'onnx-community/whisper-base'
	},
	en: {
		tiny: 'onnx-community/whisper-tiny.en',
		base: 'onnx-community/whisper-base.en'
	}
};

// The route deliberately works without cross-origin isolation. ONNX Runtime will
// use its single-threaded WASM path when SharedArrayBuffer is unavailable.
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
	env.backends.onnx.wasm.numThreads = 1;
	env.backends.onnx.wasm.proxy = false;
}

let loadedModel: `${LabLanguage}:${WhisperModel}` | null = null;
let transcriber: AutomaticSpeechRecognitionPipeline | null = null;

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function post(message: unknown): void {
	self.postMessage(message);
}

async function load(model: WhisperModel, language: LabLanguage, id: string) {
	const modelKey = `${language}:${model}` as const;
	if (transcriber && loadedModel === modelKey)
		return { instance: transcriber, loadMs: 0, warm: true };

	if (transcriber && 'dispose' in transcriber) await transcriber.dispose();
	transcriber = null;
	loadedModel = null;

	const startedAt = performance.now();
	const instance = await pipeline('automatic-speech-recognition', MODEL_IDS[language][model], {
		device: 'wasm',
		dtype: 'q8',
		progress_callback: (event: ProgressEvent) => {
			if (event.status === 'progress' && Number.isFinite(event.progress)) {
				post({
					type: 'status',
					id,
					phase: 'loading',
					progress: Math.max(0, Math.min(100, event.progress ?? 0)),
					message: `Downloading ${event.file ?? 'model data'}…`
				});
			}
		}
	});

	transcriber = instance;
	loadedModel = modelKey;
	return { instance, loadMs: performance.now() - startedAt, warm: false };
}

self.onmessage = async (event: MessageEvent<Request>) => {
	const request = event.data;
	if (request?.type !== 'transcribe') return;

	try {
		post({
			type: 'status',
			id: request.id,
			phase: 'loading',
			progress: 0,
			message: `Loading Whisper ${request.model === 'tiny' ? 'Tiny' : 'Base'} (quantized)…`
		});
		const { instance, loadMs, warm } = await load(request.model, request.language, request.id);
		post({
			type: 'status',
			id: request.id,
			phase: 'transcribing',
			progress: null,
			message:
				request.language === 'en'
					? 'Transcribing locally with the English-only checkpoint…'
					: 'Transcribing locally with Persian forced…'
		});

		const startedAt = performance.now();
		const result = await instance(
			request.samples,
			request.language === 'fa'
				? {
						language: 'fa',
						task: 'transcribe',
						return_timestamps: false,
						max_new_tokens: 256
					}
				: { return_timestamps: false, max_new_tokens: 256 }
		);
		const transcript = Array.isArray(result)
			? result.map((item) => item.text).join(' ')
			: result.text;

		post({
			type: 'result',
			id: request.id,
			transcript: transcript.trim(),
			loadMs,
			inferenceMs: performance.now() - startedAt,
			warm
		});
	} catch (error) {
		post({ type: 'error', id: request.id, message: errorMessage(error) });
	}
};
