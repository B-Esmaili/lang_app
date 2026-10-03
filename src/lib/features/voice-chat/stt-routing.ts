import type { DetectedSpeechLanguage } from '../speaking-practice/engine-types';
import type { WebStt } from '../speaking-practice/stt-config';
import type { BrowserSpeechResult } from './browser-speech-recognition';

export type SpeechLanguageMode = DetectedSpeechLanguage;

/** The input language is selected by the learner; no language model is run to infer it. */
export async function recognizeVoiceTurn(
	language: SpeechLanguageMode,
	browser: BrowserSpeechResult | null,
	local: { transcribe: (language: DetectedSpeechLanguage) => Promise<string> },
	onProvider?: (provider: string) => void,
	webStt: WebStt = 'whisper'
) {
	const browserUsable = Boolean(browser && !browser.error && browser.text.trim());
	console.info('[Voice chat STT] Web Speech result:', { language, ...browser });
	if (browserUsable && browser?.language === language) {
		const provider = `Web Speech API · ${language === 'fa' ? 'Persian (fa-IR)' : 'English (en-US)'}`;
		onProvider?.(provider);
		return { text: browser.text.trim(), language, provider };
	}
	if (language === 'fa' && webStt === 'moonshine') {
		throw new Error(
			'Persian speech needs Web Speech in Moonshine mode. Check browser speech support and microphone permission, or type your question.'
		);
	}
	const reason = browser?.error ?? 'no transcript';
	const provider = `${webStt === 'whisper' ? 'Whisper' : 'Moonshine'} fallback · ${language === 'fa' ? 'Persian' : 'English'} (Web Speech: ${reason})`;
	onProvider?.(provider);
	return { text: (await local.transcribe(language)).trim(), language, provider };
}
