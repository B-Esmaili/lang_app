/** Reveal complete words using the audio position; the voice engines do not expose word timestamps. */
export function spokenTextAt(text: string, progress: number): string {
	const words = text.match(/\s*\S+\s*/gu) ?? [];
	if (!words.length) return text;
	const fraction = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
	// Keep the final word hidden until playback ends, so the full answer never appears early.
	const count =
		fraction === 1
			? words.length
			: Math.min(words.length - 1 || 1, Math.max(1, Math.ceil(fraction * words.length)));
	return words.slice(0, count).join('');
}
