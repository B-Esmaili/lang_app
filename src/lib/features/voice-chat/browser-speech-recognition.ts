import type { DetectedSpeechLanguage } from '../speaking-practice/engine-types';

export type BrowserSpeechResult = {
	text: string;
	confidence: number | null;
	language: DetectedSpeechLanguage;
	error: string | null;
};

type RecognitionResult = {
	isFinal: boolean;
	0: { transcript: string; confidence: number };
};
type Recognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	maxAlternatives: number;
	onresult:
		((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
	onerror: ((event: { error: string }) => void) | null;
	onend: (() => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
	if (typeof window === 'undefined') return null;
	const host = window as typeof window & {
		SpeechRecognition?: RecognitionConstructor;
		webkitSpeechRecognition?: RecognitionConstructor;
	};
	return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

/** One locale per recording. Keep browser text when its session ends before the recorder. */
export class BrowserSpeechRecognition {
	private recognition: Recognition | null = null;
	private segments: { text: string; confidence: number }[] = [];
	private completion: Promise<BrowserSpeechResult> | null = null;
	private finish: ((result: BrowserSpeechResult) => void) | null = null;
	private failure: string | null = null;

	constructor(readonly language: DetectedSpeechLanguage) {}

	start(): boolean {
		this.abort();
		this.segments = [];
		this.failure = null;
		this.completion = null;
		const Constructor = recognitionConstructor();
		if (!Constructor) {
			this.failure = 'unavailable';
			return false;
		}
		try {
			const recognition = new Constructor();
			this.recognition = recognition;
			this.completion = new Promise((resolve) => (this.finish = resolve));
			recognition.lang = this.language === 'fa' ? 'fa-IR' : 'en-US';
			recognition.continuous = true;
			recognition.interimResults = true;
			recognition.maxAlternatives = 1;
			recognition.onresult = (event) => {
				if (this.recognition !== recognition) return;
				this.segments.length = event.results.length;
				for (let i = event.resultIndex; i < event.results.length; i++) {
					const result = event.results[i];
					this.segments[i] = {
						text: result[0]?.transcript?.trim() ?? '',
						confidence: result.isFinal ? result[0]?.confidence : NaN
					};
				}
			};
			recognition.onerror = (event) => {
				if (this.recognition === recognition) this.fail(event.error || 'recognition-failed');
			};
			recognition.onend = () => {
				// A normal service end is not an error, even before the page's silence timer.
				if (this.recognition === recognition) this.complete();
			};
			recognition.start();
			return this.failure === null;
		} catch {
			this.fail('start-failed');
			return false;
		}
	}

	async stop(): Promise<BrowserSpeechResult> {
		if (!this.recognition || !this.completion) return this.result();
		const recognition = this.recognition;
		const completion = this.completion;
		try {
			recognition.stop();
		} catch {
			this.fail('stop-failed');
		}
		const timeout = setTimeout(() => {
			if (this.recognition === recognition) this.fail('timeout');
		}, 1_500);
		try {
			return await completion;
		} finally {
			clearTimeout(timeout);
		}
	}

	abort(): void {
		this.segments = [];
		this.fail('aborted');
	}

	private fail(reason: string): void {
		// Some browsers never finalize after stop(). Keep the latest hypothesis at
		// the stop deadline; actual service errors still use the saved audio fallback.
		const stoppedWithText =
			(reason === 'timeout' || reason === 'stop-failed') && this.segments.some((part) => part.text);
		this.failure = stoppedWithText ? null : reason;
		const recognition = this.recognition;
		this.complete();
		try {
			recognition?.abort();
		} catch {
			// Already stopped by the browser.
		}
	}

	private result(): BrowserSpeechResult {
		const confidences = this.segments
			.map((part) => part.confidence)
			.filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
		return {
			text: this.failure
				? ''
				: this.segments
						.map((part) => part.text)
						.join(' ')
						.replace(/\s+/gu, ' ')
						.trim(),
			confidence: confidences.length
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: null,
			language: this.language,
			error: this.failure
		};
	}

	private complete(): void {
		const recognition = this.recognition;
		this.recognition = null;
		if (recognition) {
			recognition.onresult = null;
			recognition.onerror = null;
			recognition.onend = null;
		}
		this.finish?.(this.result());
		this.finish = null;
	}
}
