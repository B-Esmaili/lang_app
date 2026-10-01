import createPiperPhonemize from '@diffusionstudio/piper-wasm/build/piper_phonemize.js';
import piperDataUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.data?url';
import piperWasmUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url';
import * as ort from 'onnxruntime-web/wasm';
import { createWavBlob } from '../speaking-practice/audio-recorder';
import { isVoiceChatVoiceId, voiceModelUrl, type VoiceChatVoiceId } from './voices';
import { VOICE_CHAT_LIMITS } from './model';
import type { VoiceRequest, VoiceResponse } from './tts-types';

// Same VITS models and Piper phonemization as diffusionstudio/vits-web.
// Bundle WASM locally, run without COOP/COEP, and keep the ONNX session warm.
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
const CACHE_NAME = 'voice-chat-vits-v1';
type Config = {
	audio: { sample_rate: number };
	espeak: { voice: string };
	inference: { noise_scale: number; length_scale: number; noise_w: number };
	speaker_id_map?: Record<string, number>;
};
let loaded: { voiceId: VoiceChatVoiceId; config: Config; session: ort.InferenceSession } | null =
	null;
let busy = false;

function send(value: VoiceResponse) {
	self.postMessage(value);
}
function status(id: number, message: string, progress: number | null = null) {
	send({ type: 'status', id, status: { message, progress } });
}

async function resource(url: string, id: number): Promise<ArrayBuffer> {
	// Storage can be denied or full; that must not prevent an in-memory session.
	const cache = await caches.open(CACHE_NAME).catch(() => null);
	const cached = await cache?.match(url).catch(() => undefined);
	if (cached) return cached.arrayBuffer();
	const response = await fetch(url);
	if (!response.ok) throw new Error(`The speaker could not be downloaded (${response.status}).`);
	const total = Number(response.headers.get('content-length'));
	const reader = response.body?.getReader();
	if (!reader) return response.arrayBuffer();
	const chunks: Uint8Array[] = [];
	let received = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.byteLength;
		if (!url.endsWith('.json'))
			status(
				id,
				`Downloading speaker · ${(received / 1_000_000).toFixed(1)} MB`,
				total ? Math.min(99, Math.round((received / total) * 100)) : null
			);
	}
	const bytes = new Uint8Array(received);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	await cache?.put(url, new Response(bytes.slice())).catch(() => {});
	return bytes.buffer;
}

async function load(voiceId: VoiceChatVoiceId, id: number) {
	if (loaded?.voiceId === voiceId) return loaded;
	status(id, 'Preparing your speaker…');
	if (loaded) await loaded.session.release();
	loaded = null;
	const url = voiceModelUrl(voiceId);
	const config = JSON.parse(new TextDecoder().decode(await resource(`${url}.json`, id))) as Config;
	const model = await resource(url, id);
	status(id, 'Loading the voice on this device…');
	const session = await ort.InferenceSession.create(model, {
		executionProviders: ['wasm'],
		graphOptimizationLevel: 'all'
	});
	loaded = { voiceId, config, session };
	return loaded;
}

async function phonemes(text: string, voice: string): Promise<number[]> {
	let ids: number[] = [];
	let failure = '';
	const phonemizer = await createPiperPhonemize({
		locateFile: (path) =>
			path.endsWith('.wasm') ? piperWasmUrl : path.endsWith('.data') ? piperDataUrl : path,
		print: (value) => {
			try {
				ids = (JSON.parse(value) as { phoneme_ids: number[] }).phoneme_ids;
			} catch {
				failure = 'The speaker could not read this reply.';
			}
		},
		printErr: (value) => {
			if (/error|failed|abort/iu.test(value)) failure = value;
		}
	});
	phonemizer.callMain([
		'-l',
		voice,
		'--input',
		JSON.stringify([{ text }]),
		'--espeak_data',
		'/espeak-ng-data'
	]);
	if (failure || !ids?.length) throw new Error(failure || 'The speaker produced no phonemes.');
	return ids;
}

self.onmessage = async ({ data }: MessageEvent<VoiceRequest>) => {
	if (busy) {
		send({ type: 'error', id: data.id, message: 'The speaker is already preparing a reply.' });
		return;
	}
	busy = true;
	try {
		if (
			!isVoiceChatVoiceId(data.voiceId) ||
			!data.text?.trim() ||
			data.text.length > VOICE_CHAT_LIMITS.replyText
		)
			throw new Error('Choose a valid speaker and a short reply.');
		const voice = await load(data.voiceId, data.id);
		status(data.id, 'Preparing spoken reply…');
		const ids = await phonemes(data.text.trim(), voice.config.espeak.voice);
		const feeds: Record<string, ort.Tensor> = {
			input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
			input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
			scales: new ort.Tensor(
				'float32',
				Float32Array.from([
					voice.config.inference.noise_scale,
					voice.config.inference.length_scale,
					voice.config.inference.noise_w
				]),
				[3]
			)
		};
		if (Object.keys(voice.config.speaker_id_map ?? {}).length)
			feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
		let outputs: ort.InferenceSession.ReturnType | undefined;
		try {
			outputs = await voice.session.run(feeds);
			const output = outputs.output ?? Object.values(outputs)[0];
			const samples = Float32Array.from(output.data as ArrayLike<number>);
			if (!samples.length) throw new Error('The speaker returned empty audio.');
			send({
				type: 'result',
				id: data.id,
				blob: createWavBlob(samples, voice.config.audio.sample_rate)
			});
		} finally {
			Object.values(feeds).forEach((tensor) => tensor.dispose());
			if (outputs) Object.values(outputs).forEach((tensor) => tensor.dispose());
		}
	} catch (error) {
		send({
			type: 'error',
			id: data.id,
			message: error instanceof Error ? error.message : 'The speaker could not generate audio.'
		});
	} finally {
		busy = false;
	}
};
