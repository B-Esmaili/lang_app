import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import type {
	SpeechEngineMode,
	SpeechEngineStatus,
	SpeechWorkerRequest,
	SpeechWorkerResponse
} from './engine-types';
import { WEB_STT } from './stt-config';
import { speechModelId } from './speech-model';

// All network activity is model/runtime download. Recorded audio is only passed to WASM.
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
	// A single thread also works on sites without cross-origin isolation headers.
	env.backends.onnx.wasm.numThreads = 1;
	env.backends.onnx.wasm.proxy = false;
}

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let loadedMode: SpeechEngineMode | null = null;
let busy = false;
const downloads = new Map<string, { loaded: number; total: number }>();

function send(message: SpeechWorkerResponse): void {
	self.postMessage(message);
}

function status(value: SpeechEngineStatus): void {
	send({ type: 'status', status: value });
}

async function loadModel(mode: SpeechEngineMode): Promise<AutomaticSpeechRecognitionPipeline> {
	const modelId = speechModelId(mode, WEB_STT);
	if (transcriber && loadedMode === mode) return transcriber;
	if (transcriber || (loading && loadedMode !== mode)) {
		await transcriber?.dispose();
		transcriber = null;
		loading = null;
	}
	if (!loading) {
		downloads.clear();
		loadedMode = mode;
		const label = mode === 'persian' ? 'Persian' : 'English';
		loading = pipeline('automatic-speech-recognition', modelId, {
			device: 'wasm',
			dtype:
				mode === 'english' && WEB_STT === 'moonshine'
					? { encoder_model: 'fp32', decoder_model_merged: 'q8' }
					: 'q8',
			progress_callback: (event) => {
				if (event.status === 'progress') {
					downloads.set(event.file, { loaded: event.loaded, total: event.total });
					const files = [...downloads.values()];
					const total = files.reduce((sum, file) => sum + file.total, 0);
					const loaded = files.reduce((sum, file) => sum + file.loaded, 0);
					status({
						phase: 'loading',
						progress: total ? Math.min(99, Math.round((loaded / total) * 100)) : null,
						message: `Downloading ${label} speech model · ${(loaded / 1_000_000).toFixed(1)} MB received`
					});
				} else if (event.status === 'done') {
					status({
						phase: 'loading',
						progress: null,
						message: `Preparing ${label} speech model…`
					});
				}
			}
		})
			.then((model) => {
				transcriber = model;
				status({ phase: 'ready', progress: 100, message: 'Ready · speech stays on this device' });
				return model;
			})
			.catch((error: unknown) => {
				loading = null;
				loadedMode = null;
				throw error;
			});
	}
	return loading;
}

self.onmessage = async (event: MessageEvent<SpeechWorkerRequest>) => {
	const message = event.data;
	if (busy) {
		send({
			type: 'error',
			id: message.id,
			message: 'A recording is already being checked. Try again.'
		});
		return;
	}
	busy = true;
	try {
		const model = await loadModel(message.mode);
		if (message.type === 'load') {
			send({ type: 'result', id: message.id });
			return;
		}
		status({
			phase: 'transcribing',
			progress: null,
			message: 'Listening to your recording on this device…'
		});
		const forcedLanguage = message.mode === 'persian' ? 'fa' : 'en';
		// Persian fallback is transcription in Persian, never translation into English.
		const result = await model(
			message.samples,
			message.mode !== 'english' || WEB_STT === 'whisper'
				? {
						language: forcedLanguage,
						task: 'transcribe',
						return_timestamps: false,
						max_new_tokens: 256
					}
				: { return_timestamps: false, max_new_tokens: 256 }
		);
		const text = Array.isArray(result) ? result.map((item) => item.text).join(' ') : result.text;
		send({ type: 'result', id: message.id, text: text.trim(), language: forcedLanguage });
		status({ phase: 'ready', progress: 100, message: 'Ready · speech stays on this device' });
	} catch {
		send({
			type: 'error',
			id: message.id,
			message: transcriber
				? 'The recording could not be checked on this device. Try a shorter recording.'
				: 'The speech model could not load. Check your connection and available storage, then try again.'
		});
	} finally {
		busy = false;
	}
};
