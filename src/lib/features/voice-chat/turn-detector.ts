export const HANDS_FREE_SILENCE_MS = 2_000;
export const HANDS_FREE_IDLE_MS = 12_000;
export const HANDS_FREE_ECHO_GAP_MS = 450;

/** Lightweight, local silence detection, not a speech classifier. Best used in a quiet room. */
export class TurnDetector {
	private elapsed = 0;
	private voiced = 0;
	private quiet = 0;
	private detected = false;
	private result: 'listening' | 'finished' | 'empty' = 'listening';

	get hasSpeech(): boolean {
		return this.detected;
	}

	push(samples: Float32Array, sampleRate: number): 'listening' | 'finished' | 'empty' {
		if (this.result !== 'listening') return this.result;
		if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return this.result;
		const duration = (samples.length / sampleRate) * 1000;
		let sum = 0;
		let squares = 0;
		for (const sample of samples) {
			if (!Number.isFinite(sample)) return this.result;
			sum += sample;
			squares += sample * sample;
		}
		// Remove DC offset so a constant microphone bias doesn't count as speech.
		const rms = Math.sqrt(Math.max(0, squares / samples.length - (sum / samples.length) ** 2));
		this.elapsed += duration;
		if (rms >= 0.008) {
			this.voiced += duration;
			this.quiet = 0;
			if (this.voiced >= 200) this.detected = true;
		} else {
			this.quiet += duration;
			// Isolated clicks must not trigger an answer; tolerate short gaps within a word.
			if (!this.detected && this.quiet >= 200) this.voiced = 0;
		}
		if (this.detected && this.quiet >= HANDS_FREE_SILENCE_MS) this.result = 'finished';
		else if (!this.detected && this.elapsed >= HANDS_FREE_IDLE_MS) this.result = 'empty';
		return this.result;
	}
}
