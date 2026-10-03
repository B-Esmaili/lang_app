import type {
	LocalSpeechResult,
	DetectedSpeechLanguage,
	SpeechEngineMode,
	SpeechEngineStatus,
	SpeechWorkerRequest,
	SpeechWorkerResponse
} from './engine-types';

export type { LocalSpeechResult, SpeechEngineMode, SpeechEngineStatus } from './engine-types';

type PendingRequest = {
	resolve: (result: LocalSpeechResult) => void;
	reject: (reason: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
};

/** One lazy, isolated model worker. Recorded audio is processed on this device. */
export class LocalSpeechEngine {
	private worker: Worker | null = null;
	private loading: Promise<void> | null = null;
	private ready = false;
	private disposed = false;
	private transcribing = false;
	private nextId = 0;
	private pending = new Map<number, PendingRequest>();

	constructor(
		private onStatus?: (status: SpeechEngineStatus) => void,
		private mode: SpeechEngineMode = 'english'
	) {}

	load(): Promise<void> {
		if (this.disposed) return Promise.reject(new Error('Speaking practice was closed.'));
		if (this.ready) return Promise.resolve();
		if (this.loading) return this.loading;
		const loading = this.request({ id: ++this.nextId, type: 'load', mode: this.mode }, 5 * 60_000)
			.then(() => {
				this.ready = true;
			})
			.finally(() => {
				if (this.loading === loading) this.loading = null;
			});
		this.loading = loading;
		return loading;
	}

	async transcribe(samples: Float32Array, language?: DetectedSpeechLanguage): Promise<string> {
		return (await this.recognize(samples, language)).text;
	}

	async recognize(
		samples: Float32Array,
		language?: DetectedSpeechLanguage
	): Promise<LocalSpeechResult> {
		return this.process(samples, language);
	}

	private async process(
		samples: Float32Array,
		language?: DetectedSpeechLanguage
	): Promise<LocalSpeechResult> {
		if (this.mode === 'english' && language === 'fa') {
			throw new Error('Use the Persian speech model for Persian transcription.');
		}
		if (this.mode === 'persian' && language === 'en') {
			throw new Error('Use the English speech model for English transcription.');
		}
		if (this.transcribing) throw new Error('Please wait for the current recording to be checked.');
		if (!samples.length || samples.length > 16_000 * 30) {
			throw new Error('Record between a moment and 30 seconds of speech.');
		}
		if (samples.some((sample) => !Number.isFinite(sample))) {
			throw new Error('The recording could not be read. Please record it again.');
		}
		this.transcribing = true;
		try {
			await this.load();
			// Transfer a copy so the learner's local replay buffer remains intact.
			const copy = new Float32Array(samples);
			return await this.request(
				{
					id: ++this.nextId,
					type: 'transcribe',
					mode: this.mode,
					samples: copy,
					language
				},
				2 * 60_000,
				[copy.buffer]
			);
		} finally {
			this.transcribing = false;
		}
	}

	dispose(): void {
		this.disposed = true;
		this.reset(new DOMException('Speaking practice was closed.', 'AbortError'));
		this.onStatus = undefined;
	}

	private getWorker(): Worker {
		if (this.disposed) throw new DOMException('Speaking practice was closed.', 'AbortError');
		if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
			throw new Error(
				'This browser does not support local speech recognition. Try a recent browser.'
			);
		}
		if (this.worker) return this.worker;
		const worker = new Worker(new URL('./speech.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (event: MessageEvent<SpeechWorkerResponse>) => {
			if (this.worker !== worker) return;
			const message = event.data;
			if (message.type === 'status') {
				this.onStatus?.(message.status);
				return;
			}
			const request = this.pending.get(message.id);
			if (!request) return;
			if (message.type === 'error') {
				// Recreate the worker on retry; a failed ONNX session cannot always be reused.
				this.reset(new Error(message.message));
				return;
			}
			clearTimeout(request.timeout);
			this.pending.delete(message.id);
			request.resolve({
				text: message.text ?? '',
				language: message.language === 'fa' ? 'fa' : 'en'
			});
		};
		worker.onerror = (event) => {
			event.preventDefault();
			if (this.worker === worker) {
				this.reset(
					new Error('Local speech recognition could not start. Please try loading it again.')
				);
			}
		};
		worker.onmessageerror = () => {
			if (this.worker === worker)
				this.reset(new Error('The recording could not be processed. Try again.'));
		};
		this.worker = worker;
		this.onStatus?.({
			phase: 'loading',
			progress: null,
			message: 'Preparing local speech recognition…'
		});
		return worker;
	}

	private request(
		message: SpeechWorkerRequest,
		timeoutMs: number,
		transfer: Transferable[] = []
	): Promise<LocalSpeechResult> {
		return new Promise((resolve, reject) => {
			try {
				const worker = this.getWorker();
				const timeout = setTimeout(() => {
					this.reset(
						new Error(
							message.type === 'load'
								? 'The speech model took too long to load. Check your connection and try again.'
								: 'Checking this recording took too long on this device. Try a shorter recording.'
						)
					);
				}, timeoutMs);
				this.pending.set(message.id, { resolve, reject, timeout });
				worker.postMessage(message, transfer);
			} catch (error) {
				const failure =
					error instanceof Error ? error : new Error('Local speech recognition failed.');
				this.reset(failure);
				reject(failure);
			}
		});
	}

	private reset(error: Error): void {
		this.worker?.terminate();
		this.worker = null;
		this.ready = false;
		this.loading = null;
		for (const request of this.pending.values()) {
			clearTimeout(request.timeout);
			request.reject(error);
		}
		this.pending.clear();
	}
}
