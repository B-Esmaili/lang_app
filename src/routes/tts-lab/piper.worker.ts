import createPiperPhonemize from '@diffusionstudio/piper-wasm/build/piper_phonemize.js';
import piperDataUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.data?url';
import piperWasmUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url';
import * as ort from 'onnxruntime-web/wasm';

type VoiceId = 'mana' | 'amir' | 'gyro' | 'lessac' | 'amy' | 'sam';

type Request = {
	type: 'generate';
	id: string;
	text: string;
	voiceId: VoiceId;
	speed: number;
};

type Status = {
	type: 'status';
	id: string;
	phase: 'loading' | 'generating' | 'ready';
	progress: number | null;
	message: string;
};

type PiperConfig = {
	audio: { sample_rate: number };
	espeak: { voice: string };
	inference: { noise_scale: number; length_scale: number; noise_w: number };
	speaker_id_map: Record<string, number>;
};

type LoadedVoice = {
	voiceId: VoiceId;
	config: PiperConfig;
	session: ort.InferenceSession;
	modelWasCached: boolean;
};

const VOICES: Record<VoiceId, { label: string; model: string; config: string }> = {
	mana: {
		label: 'Mana Persian Piper',
		model:
			'https://huggingface.co/MahtaFetrat/Mana-Persian-Piper/resolve/main/fa_IR-mana-medium.onnx',
		config:
			'https://huggingface.co/MahtaFetrat/Mana-Persian-Piper/resolve/main/fa_IR-mana-medium.onnx.json'
	},
	amir: {
		label: 'Piper Amir',
		model:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx',
		config:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx.json'
	},
	gyro: {
		label: 'Piper Gyro',
		model:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx',
		config:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx.json'
	},
	lessac: {
		label: 'Piper Lessac',
		model:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
		config:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json'
	},
	amy: {
		label: 'Piper Amy',
		model:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx',
		config:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json'
	},
	sam: {
		label: 'Piper Sam',
		model:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/sam/medium/en_US-sam-medium.onnx',
		config:
			'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/sam/medium/en_US-sam-medium.onnx.json'
	}
};

const CACHE_NAME = 'tts-lab-piper-models-v1';
const MAX_CHUNK_LENGTH = 360;

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

let loadedVoice: LoadedVoice | null = null;
let loading: Promise<LoadedVoice> | null = null;
let busy = false;

function send(message: Status | Record<string, unknown>): void {
	self.postMessage(message);
}

async function readResource(
	url: string,
	id: string,
	label: string,
	reportProgress: boolean
): Promise<{ buffer: ArrayBuffer; cached: boolean }> {
	const cache = await caches.open(CACHE_NAME);
	const cachedResponse = await cache.match(url);
	if (cachedResponse) {
		send({
			type: 'status',
			id,
			phase: 'loading',
			progress: null,
			message: `Reading cached ${label}…`
		});
		return { buffer: await cachedResponse.arrayBuffer(), cached: true };
	}

	const response = await fetch(url);
	if (!response.ok) throw new Error(`Could not download ${label} (${response.status}).`);

	const total = Number(response.headers.get('content-length') ?? 0);
	const reader = response.body?.getReader();
	if (!reader) {
		const buffer = await response.arrayBuffer();
		await cache.put(url, new Response(buffer.slice(0)));
		return { buffer, cached: false };
	}

	const chunks: Uint8Array[] = [];
	let loaded = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.byteLength;
		if (reportProgress) {
			send({
				type: 'status',
				id,
				phase: 'loading',
				progress: total ? Math.min(99, Math.round((loaded / total) * 100)) : null,
				message: `Downloading ${label} · ${(loaded / 1_000_000).toFixed(1)} MB`
			});
		}
	}

	const buffer = new ArrayBuffer(loaded);
	const bytes = new Uint8Array(buffer);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	await cache.put(url, new Response(buffer.slice(0)));
	return { buffer, cached: false };
}

async function loadVoice(voiceId: VoiceId, id: string): Promise<LoadedVoice> {
	if (loadedVoice?.voiceId === voiceId) return loadedVoice;
	if (loading) return loading;

	loading = (async () => {
		const voice = VOICES[voiceId];
		send({
			type: 'status',
			id,
			phase: 'loading',
			progress: 0,
			message: `Loading ${voice.label}…`
		});

		const [modelResource, configResource] = await Promise.all([
			readResource(voice.model, id, `${voice.label} model`, true),
			readResource(voice.config, id, `${voice.label} configuration`, false)
		]);
		const config = JSON.parse(new TextDecoder().decode(configResource.buffer)) as PiperConfig;

		send({
			type: 'status',
			id,
			phase: 'loading',
			progress: null,
			message: `Preparing ${voice.label} with ONNX Runtime…`
		});

		loadedVoice?.session.release();
		loadedVoice = {
			voiceId,
			config,
			session: await ort.InferenceSession.create(modelResource.buffer, {
				executionProviders: ['wasm'],
				graphOptimizationLevel: 'all'
			}),
			modelWasCached: modelResource.cached
		};
		return loadedVoice;
	})().finally(() => {
		loading = null;
	});

	return loading;
}

function splitIntoChunks(text: string): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	if (trimmed.length <= MAX_CHUNK_LENGTH) return [trimmed];

	const sentences = trimmed.match(/[^.!?؟…\n]+[.!?؟…]*\s*/gu) ?? [trimmed];
	const chunks: string[] = [];
	let current = '';

	const pushCurrent = () => {
		const value = current.trim();
		if (value) chunks.push(value);
		current = '';
	};

	for (const sentence of sentences) {
		if ((current + sentence).length > MAX_CHUNK_LENGTH) pushCurrent();
		if (sentence.length <= MAX_CHUNK_LENGTH) {
			current += sentence;
			continue;
		}

		for (const word of sentence.split(/\s+/u)) {
			if (`${current} ${word}`.trim().length > MAX_CHUNK_LENGTH) pushCurrent();
			current = current ? `${current} ${word}` : word;
		}
	}
	pushCurrent();
	return chunks;
}

async function phonemize(text: string, voice: string): Promise<number[]> {
	return new Promise<number[]>((resolve, reject) => {
		let completed = false;
		void createPiperPhonemize({
			locateFile: (path) => {
				if (path.endsWith('.wasm')) return piperWasmUrl;
				if (path.endsWith('.data')) return piperDataUrl;
				return path;
			},
			print: (value) => {
				try {
					const parsed = JSON.parse(value) as { phoneme_ids?: number[] };
					if (!parsed.phoneme_ids?.length) throw new Error('The phonemizer returned no phonemes.');
					completed = true;
					resolve(parsed.phoneme_ids);
				} catch (error) {
					reject(error);
				}
			},
			printErr: (value) => {
				if (!completed && /error|failed|abort/iu.test(value)) reject(new Error(value));
			}
		})
			.then((module) => {
				try {
					module.callMain([
						'-l',
						voice,
						'--input',
						JSON.stringify([{ text: text.trim() }]),
						'--espeak_data',
						'/espeak-ng-data'
					]);
					if (!completed) reject(new Error('The Piper phonemizer produced no output.'));
				} catch (error) {
					reject(error);
				}
			})
			.catch(reject);
	});
}

async function synthesizeChunk(
	text: string,
	voice: LoadedVoice,
	speed: number
): Promise<Float32Array> {
	const phonemeIds = await phonemize(text, voice.config.espeak.voice);
	const int64Phonemes = BigInt64Array.from(phonemeIds, (value) => BigInt(value));
	const feeds: Record<string, ort.Tensor> = {
		input: new ort.Tensor('int64', int64Phonemes, [1, phonemeIds.length]),
		input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(phonemeIds.length)]), [1]),
		scales: new ort.Tensor(
			'float32',
			Float32Array.from([
				voice.config.inference.noise_scale,
				voice.config.inference.length_scale / speed,
				voice.config.inference.noise_w
			]),
			[3]
		)
	};

	if (Object.keys(voice.config.speaker_id_map ?? {}).length > 0) {
		feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
	}

	const result = await voice.session.run(feeds);
	const output = result.output ?? Object.values(result)[0];
	if (!output) throw new Error('The Piper model returned no audio.');
	return Float32Array.from(output.data as ArrayLike<number>);
}

function mergeChunks(chunks: Float32Array[], sampleRate: number): Float32Array {
	const silence = new Float32Array(Math.round(sampleRate * 0.12));
	const total =
		chunks.reduce((sum, chunk) => sum + chunk.length, 0) +
		Math.max(0, chunks.length - 1) * silence.length;
	const merged = new Float32Array(total);
	let offset = 0;
	for (const [index, chunk] of chunks.entries()) {
		merged.set(chunk, offset);
		offset += chunk.length;
		if (index < chunks.length - 1) offset += silence.length;
	}
	return merged;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
	const headerLength = 44;
	const buffer = new ArrayBuffer(headerLength + samples.length * 2);
	const view = new DataView(buffer);
	const writeAscii = (offset: number, value: string) => {
		for (let index = 0; index < value.length; index += 1) {
			view.setUint8(offset + index, value.charCodeAt(index));
		}
	};

	writeAscii(0, 'RIFF');
	view.setUint32(4, buffer.byteLength - 8, true);
	writeAscii(8, 'WAVE');
	writeAscii(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeAscii(36, 'data');
	view.setUint32(40, samples.length * 2, true);

	for (let index = 0; index < samples.length; index += 1) {
		const sample = Math.max(-1, Math.min(1, samples[index]));
		view.setInt16(44 + index * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
	}
	return new Blob([buffer], { type: 'audio/wav' });
}

self.onmessage = async (event: MessageEvent<Request>) => {
	const request = event.data;
	if (request.type !== 'generate') return;
	if (busy) {
		send({ type: 'error', id: request.id, message: 'Piper is already generating audio.' });
		return;
	}

	busy = true;
	try {
		const loadingStartedAt = performance.now();
		const voice = await loadVoice(request.voiceId, request.id);
		const loadMs = performance.now() - loadingStartedAt;
		const chunks = splitIntoChunks(request.text);
		if (!chunks.length) throw new Error('Enter some text first.');

		send({
			type: 'status',
			id: request.id,
			phase: 'generating',
			progress: 0,
			message: `Synthesizing locally with ${VOICES[request.voiceId].label}…`
		});

		const inferenceStartedAt = performance.now();
		const audioChunks: Float32Array[] = [];
		for (const [index, chunk] of chunks.entries()) {
			audioChunks.push(await synthesizeChunk(chunk, voice, request.speed));
			send({
				type: 'status',
				id: request.id,
				phase: 'generating',
				progress: Math.round(((index + 1) / chunks.length) * 100),
				message: `Synthesized ${index + 1} of ${chunks.length} text chunks`
			});
		}

		const samples = mergeChunks(audioChunks, voice.config.audio.sample_rate);
		const generationMs = performance.now() - inferenceStartedAt;
		const blob = encodeWav(samples, voice.config.audio.sample_rate);

		send({
			type: 'result',
			id: request.id,
			blob,
			loadMs,
			generationMs,
			durationSeconds: samples.length / voice.config.audio.sample_rate,
			sampleRate: voice.config.audio.sample_rate,
			bytes: blob.size,
			cached: voice.modelWasCached || loadMs === 0
		});
		send({
			type: 'status',
			id: request.id,
			phase: 'ready',
			progress: 100,
			message: `${VOICES[request.voiceId].label} output is ready.`
		});
	} catch (error) {
		send({
			type: 'error',
			id: request.id,
			message: error instanceof Error ? error.message : 'Piper synthesis failed.'
		});
	} finally {
		busy = false;
	}
};
