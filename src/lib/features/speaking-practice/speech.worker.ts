import {
	env,
	pipeline,
	Tensor,
	type AutomaticSpeechRecognitionPipeline
} from '@huggingface/transformers';
import type {
	SpeechEngineMode,
	SpeechEngineStatus,
	SpeechWorkerRequest,
	SpeechWorkerResponse
} from './engine-types';
import { scoreSpeechLanguage, type SpeechLanguageDetection } from './speech-language';

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

const MODEL_IDS: Record<SpeechEngineMode, string> = {
	english: 'onnx-community/moonshine-tiny-ONNX',
	persian: 'onnx-community/whisper-base',
	bilingual: 'onnx-community/whisper-tiny'
};

function send(message: SpeechWorkerResponse): void {
	self.postMessage(message);
}

function status(value: SpeechEngineStatus): void {
	send({ type: 'status', status: value });
}

async function loadModel(mode: SpeechEngineMode): Promise<AutomaticSpeechRecognitionPipeline> {
	if (transcriber && loadedMode === mode) return transcriber;
	if (transcriber || (loading && loadedMode !== mode)) {
		await transcriber?.dispose();
		transcriber = null;
		loading = null;
	}
	if (!loading) {
		downloads.clear();
		loadedMode = mode;
		const label =
			mode === 'bilingual' ? 'language detection' : mode === 'persian' ? 'Persian' : 'English';
		loading = pipeline('automatic-speech-recognition', MODEL_IDS[mode], {
			device: 'wasm',
			dtype: mode === 'english' ? { encoder_model: 'fp32', decoder_model_merged: 'q8' } : 'q8',
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

type WhisperGenerationConfig = {
	decoder_start_token_id?: number;
	lang_to_id?: Record<string, number>;
};

/**
 * Read Whisper's first decoder-step language logits without decoding a transcript.
 * This keeps Auto's language decision independent of either forced-language recognizer.
 */
async function detectLanguage(
	model: AutomaticSpeechRecognitionPipeline,
	samples: Float32Array
): Promise<SpeechLanguageDetection> {
	const generation = model.model.generation_config as WhisperGenerationConfig | null;
	const config = model.model.config as unknown as { decoder_start_token_id?: number };
	const startToken = generation?.decoder_start_token_id ?? config.decoder_start_token_id;
	const englishToken = generation?.lang_to_id?.['<|en|>'];
	const persianToken = generation?.lang_to_id?.['<|fa|>'];
	if (
		typeof startToken !== 'number' ||
		typeof englishToken !== 'number' ||
		typeof persianToken !== 'number'
	) {
		throw new Error('The bilingual speech model does not expose language detection tokens.');
	}

	const processed = await model.processor(samples);
	const decoderInputIds = new Tensor('int64', BigInt64Array.from([BigInt(startToken)]), [1, 1]);
	let output: Record<string, unknown> | undefined;
	try {
		output = (await model.model({
			input_features: processed.input_features,
			decoder_input_ids: decoderInputIds
		})) as unknown as Record<string, unknown>;
		const logits = output.logits instanceof Tensor ? output.logits : undefined;
		const vocabularySize = logits?.dims.at(-1) ?? 0;
		if (!logits || !vocabularySize) throw new Error('Language detection returned no scores.');
		const offset = logits.data.length - vocabularySize;
		const scores = Array.from(logits.data.slice(offset), Number);
		return scoreSpeechLanguage(scores, generation!.lang_to_id!);
	} finally {
		// Direct forward calls also return decoder key/value tensors. They are not reused here.
		for (const tensor of new Set(Object.values(output ?? {}))) {
			if (tensor instanceof Tensor) tensor.dispose();
		}
		decoderInputIds.dispose();
		processed.input_features?.dispose?.();
	}
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
		const forcedLanguage =
			message.mode === 'persian'
				? 'fa'
				: message.type === 'transcribe'
					? message.language
					: undefined;
		const detection =
			message.mode === 'bilingual' && !forcedLanguage
				? await detectLanguage(model, message.samples)
				: { language: forcedLanguage ?? 'en', confidence: 1 };
		if (message.type === 'detect') {
			send({ type: 'result', id: message.id, ...detection });
			status({ phase: 'ready', progress: 100, message: 'Ready · speech stays on this device' });
			return;
		}
		// Persian fallback is transcription in Persian, never translation into English.
		const result = await model(
			message.samples,
			message.mode !== 'english'
				? {
						language: forcedLanguage ?? detection.language ?? 'en',
						task: 'transcribe',
						return_timestamps: false,
						max_new_tokens: 256
					}
				: { return_timestamps: false, max_new_tokens: 256 }
		);
		const text = Array.isArray(result) ? result.map((item) => item.text).join(' ') : result.text;
		send({ type: 'result', id: message.id, text: text.trim(), ...detection });
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
