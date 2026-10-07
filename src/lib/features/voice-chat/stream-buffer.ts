/** Audio buffered before a streamed reply starts, even when generation is fast. */
export const MIN_STREAM_START_SECONDS = 0.3;
/** Bridge dispatch and main-thread scheduling jitter for each arriving chunk. */
const DELIVERY_MARGIN_SECONDS = 0.1;
/** Pocket TTS grows its chunks from 0.16 s to about one second; assume the next may double. */
const MAX_CHUNK_SECONDS = 1;

export type StreamState = {
	/** Seconds of audio received so far. */
	received: number;
	/** Wall-clock seconds since generation was requested. */
	elapsed: number;
	/** Engine's estimate (0–1) of how much of the reply is generated, or null. */
	progress: number | null;
	/** Duration in seconds of the most recent chunk. */
	lastChunk: number;
};

/**
 * Seconds of audio to buffer before playing a reply that is still being generated, so that
 * playback is unlikely to run dry. The next chunk must arrive before the buffer drains, and when
 * generation is slower than real time the buffer must also cover the remaining shortfall. With
 * fast generation this is a fraction of a second; when slower than real time, playback starts
 * close to the point where it can finish without a gap.
 */
export function streamStartSeconds(state: StreamState): number {
	if (!(state.received > 0) || !(state.elapsed > 0)) return Infinity;
	const speed = state.received / state.elapsed; // audio seconds generated per second
	const nextChunk = Math.min(MAX_CHUNK_SECONDS, 2 * state.lastChunk);
	// Without an estimate, assume a long reply: this only matters when generation is slow.
	const remaining =
		state.progress !== null && state.progress > 0
			? state.received * (1 / Math.min(1, state.progress) - 1)
			: state.received * 4;
	const shortfall = Math.max(0, remaining * (1 / speed - 1));
	return (
		Math.max(MIN_STREAM_START_SECONDS, nextChunk / speed + DELIVERY_MARGIN_SECONDS) + shortfall
	);
}
