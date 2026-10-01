export const MAX_RECORDING_SECONDS = 30;
export const SPEECH_SAMPLE_RATE = 16_000;

export type PracticeRecording = {
	samples: Float32Array;
	blob: Blob;
	durationSeconds: number;
};

// Transfer small chunks off the audio thread. The main thread applies a strict duration cap.
const recorderWorklet = `
class PracticeCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.position = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      for (let i = 0; i < input.length; i++) {
        this.buffer[this.position++] = input[i];
        if (this.position === this.buffer.length) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(2048);
          this.position = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('practice-capture', PracticeCapture);
`;

// A hands-free conversation reuses its gesture-unlocked context across turns.
const recorderModules = new WeakMap<AudioContext, Promise<void>>();
function loadRecorderModule(context: AudioContext): Promise<void> {
	const existing = recorderModules.get(context);
	if (existing) return existing;
	const url = URL.createObjectURL(new Blob([recorderWorklet], { type: 'application/javascript' }));
	const loading = context.audioWorklet
		.addModule(url)
		.catch((error) => {
			recorderModules.delete(context);
			throw error;
		})
		.finally(() => URL.revokeObjectURL(url));
	recorderModules.set(context, loading);
	return loading;
}

/** Band-limited conversion keeps high microphone frequencies from aliasing into speech. */
export function resampleMono(
	samples: Float32Array,
	sourceRate: number,
	targetRate = SPEECH_SAMPLE_RATE
): Float32Array {
	if (
		!Number.isFinite(sourceRate) ||
		sourceRate <= 0 ||
		!Number.isFinite(targetRate) ||
		targetRate <= 0
	) {
		throw new Error('The microphone returned an unsupported sample rate.');
	}
	if (sourceRate === targetRate) return new Float32Array(samples);
	const output = new Float32Array(Math.round((samples.length * targetRate) / sourceRate));
	const step = sourceRate / targetRate;
	const cutoff = Math.min(1, targetRate / sourceRate) * 0.94;
	const radius = 24;
	for (let i = 0; i < output.length; i++) {
		const position = i * step;
		const left = Math.max(0, Math.ceil(position - radius));
		const right = Math.min(samples.length - 1, Math.floor(position + radius));
		let value = 0;
		let weight = 0;
		for (let j = left; j <= right; j++) {
			const distance = j - position;
			const phase = Math.PI * distance * cutoff;
			const sinc = Math.abs(phase) < 1e-8 ? 1 : Math.sin(phase) / phase;
			const window = 0.5 + 0.5 * Math.cos((Math.PI * distance) / radius);
			const coefficient = cutoff * sinc * window;
			value += samples[j] * coefficient;
			weight += coefficient;
		}
		output[i] = weight ? value / weight : 0;
	}
	return output;
}

/** Reject silence, DC-only input and accidental taps before the model can hallucinate text. */
export function validateRecording(samples: Float32Array, sampleRate = SPEECH_SAMPLE_RATE): void {
	if (samples.length < sampleRate * 0.35) {
		throw new Error('That recording was too short. Speak the full sentence, then stop.');
	}
	let activeSamples = 0;
	const window = Math.round(sampleRate * 0.02);
	for (let start = 0; start < samples.length; start += window) {
		const end = Math.min(start + window, samples.length);
		let sum = 0;
		let squares = 0;
		for (let i = start; i < end; i++) {
			if (!Number.isFinite(samples[i]))
				throw new Error('The recording could not be read. Try again.');
			sum += samples[i];
			squares += samples[i] * samples[i];
		}
		const count = end - start;
		const variance = Math.max(0, squares / count - (sum / count) ** 2);
		if (Math.sqrt(variance) >= 0.002) activeSamples += count;
	}
	if (activeSamples < sampleRate * 0.12) {
		throw new Error(
			'No clear audio was recorded. Check your microphone and speak a little louder.'
		);
	}
}

export function createWavBlob(samples: Float32Array, sampleRate = SPEECH_SAMPLE_RATE): Blob {
	const bytes = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(bytes);
	const writeText = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};
	writeText(0, 'RIFF');
	view.setUint32(4, 36 + samples.length * 2, true);
	writeText(8, 'WAVE');
	writeText(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeText(36, 'data');
	view.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
	}
	return new Blob([bytes], { type: 'audio/wav' });
}

export class PracticeRecorder {
	private stream: MediaStream | null = null;
	private context: AudioContext | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private capture: AudioWorkletNode | null = null;
	private mute: GainNode | null = null;
	private chunks: Float32Array[] = [];
	private sampleCount = 0;
	private sampleRate = SPEECH_SAMPLE_RATE;
	private generation = 0;
	private disposed = false;
	private recording = false;
	private starting: Promise<void> | null = null;
	private stopped: Promise<PracticeRecording> | null = null;
	private limitTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private onLimit?: () => void,
		private sharedContext?: AudioContext
	) {}

	start(
		onLevel?: (level: number) => void,
		onSamples?: (samples: Float32Array, sampleRate: number) => void
	): Promise<void> {
		if (this.disposed)
			return Promise.reject(new DOMException('Recording cancelled.', 'AbortError'));
		if (this.recording) return Promise.resolve();
		if (this.starting) return this.starting;
		const starting = this.begin(onLevel, onSamples).finally(() => {
			if (this.starting === starting) this.starting = null;
		});
		this.starting = starting;
		return starting;
	}

	stop(): Promise<PracticeRecording> {
		if (this.stopped) return this.stopped;
		if (!this.recording) {
			this.generation++;
			this.releaseMicrophone();
			return Promise.reject(new Error('Start a recording before checking your sentence.'));
		}
		this.recording = false;
		this.releaseMicrophone();
		const captured = new Float32Array(this.sampleCount);
		let offset = 0;
		for (const chunk of this.chunks) {
			captured.set(chunk, offset);
			offset += chunk.length;
		}
		this.chunks = [];
		this.sampleCount = 0;
		this.stopped = Promise.resolve().then(() => {
			if (this.disposed) throw new DOMException('Recording cancelled.', 'AbortError');
			const samples = resampleMono(captured, this.sampleRate);
			validateRecording(samples);
			return {
				samples,
				blob: createWavBlob(samples),
				durationSeconds: samples.length / SPEECH_SAMPLE_RATE
			};
		});
		return this.stopped;
	}

	dispose(): void {
		this.disposed = true;
		this.generation++;
		this.recording = false;
		this.releaseMicrophone();
		this.chunks = [];
		this.sampleCount = 0;
		this.stopped = null;
		this.onLimit = undefined;
	}

	private async begin(
		onLevel?: (level: number) => void,
		onSamples?: (samples: Float32Array, sampleRate: number) => void
	): Promise<void> {
		if (
			typeof navigator === 'undefined' ||
			!navigator.mediaDevices?.getUserMedia ||
			!globalThis.isSecureContext
		) {
			throw new Error(
				'Microphone recording needs a secure connection (HTTPS) and a recent browser.'
			);
		}
		if (typeof AudioContext === 'undefined' || typeof AudioWorkletNode === 'undefined') {
			throw new Error('This browser does not support microphone recording. Try a recent browser.');
		}
		const generation = ++this.generation;
		this.stopped = null;
		this.chunks = [];
		this.sampleCount = 0;
		try {
			// Resume while still in the user's click gesture, before the permission dialog.
			const context = this.sharedContext ?? new AudioContext();
			this.context = context;
			const resumed = context.resume();
			// A cancelled permission dialog may close the context before resume settles.
			void resumed.catch(() => {});
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			});
			if (this.disposed || this.generation !== generation) {
				stream.getTracks().forEach((track) => track.stop());
				throw new DOMException('Recording cancelled.', 'AbortError');
			}
			this.stream = stream;
			await resumed;
			await loadRecorderModule(context);
			if (this.disposed || this.generation !== generation) {
				throw new DOMException('Recording cancelled.', 'AbortError');
			}
			this.sampleRate = context.sampleRate;
			this.source = context.createMediaStreamSource(stream);
			this.capture = new AudioWorkletNode(context, 'practice-capture', {
				channelCount: 1,
				channelCountMode: 'explicit'
			});
			this.mute = context.createGain();
			this.mute.gain.value = 0;
			this.capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
				if (!this.recording) return;
				const remaining = Math.floor(this.sampleRate * MAX_RECORDING_SECONDS) - this.sampleCount;
				const chunk = event.data.length <= remaining ? event.data : event.data.slice(0, remaining);
				this.chunks.push(chunk);
				this.sampleCount += chunk.length;
				let energy = 0;
				for (const sample of chunk) energy += sample * sample;
				onLevel?.(Math.min(1, Math.sqrt(energy / Math.max(1, chunk.length)) * 8));
				onSamples?.(chunk, this.sampleRate);
				if (this.sampleCount >= this.sampleRate * MAX_RECORDING_SECONDS) this.limitReached();
			};
			this.source.connect(this.capture);
			this.capture.connect(this.mute);
			this.mute.connect(context.destination);
			this.recording = true;
			this.limitTimer = setTimeout(() => this.limitReached(), MAX_RECORDING_SECONDS * 1000);
		} catch (error) {
			if (this.generation === generation) this.releaseMicrophone();
			if (error instanceof DOMException) {
				if (error.name === 'NotAllowedError') {
					throw new Error(
						'Microphone access was denied. Allow it in your browser settings, then try again.',
						{ cause: error }
					);
				}
				if (error.name === 'NotFoundError')
					throw new Error('No microphone was found. Connect one and try again.', { cause: error });
				if (error.name === 'NotReadableError')
					throw new Error('Your microphone is unavailable or in use. Check it and try again.', {
						cause: error
					});
			}
			throw error;
		}
	}

	private limitReached(): void {
		if (!this.recording) return;
		// Always release the microphone, even if the host has no onLimit callback.
		void this.stop().catch(() => {});
		this.onLimit?.();
	}

	private releaseMicrophone(): void {
		if (this.limitTimer) clearTimeout(this.limitTimer);
		this.limitTimer = null;
		if (this.capture) {
			this.capture.port.onmessage = null;
			this.capture.port.close();
			this.capture.disconnect();
		}
		this.source?.disconnect();
		this.mute?.disconnect();
		this.stream?.getTracks().forEach((track) => track.stop());
		if (this.context && this.context !== this.sharedContext && this.context.state !== 'closed')
			void this.context.close().catch(() => {});
		this.capture = null;
		this.source = null;
		this.mute = null;
		this.stream = null;
		this.context = null;
	}
}
