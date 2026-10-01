import type { DetectedSpeechLanguage, LocalSpeechResult } from '../speaking-practice/engine-types';
import {
	LANGUAGE_SELECTION_THRESHOLDS,
	selectSpeechLanguage
} from '../speaking-practice/speech-language';
import type { BrowserSpeechResult } from './browser-speech-recognition';
import { selectVoiceChatLanguage } from './speech-language-selection';

export type SpeechLanguageMode = 'auto' | DetectedSpeechLanguage;
export type TranscriptCandidates = Record<DetectedSpeechLanguage, string>;
type LocalRecognition = {
	detect: () => Promise<LocalSpeechResult>;
	transcribe: (language: DetectedSpeechLanguage) => Promise<string>;
};

/** Locale-forced browser confidence is never evidence of the spoken language. */
export async function recognizeVoiceTurn(
	mode: SpeechLanguageMode,
	browser: BrowserSpeechResult | null,
	local: LocalRecognition,
	reviewAllCandidates = false,
	onProvider?: (provider: string) => void
) {
	const browserUsable = Boolean(browser && !browser.error && browser.text.trim());
	const provider = (language: DetectedSpeechLanguage) => {
		const label = language === 'fa' ? 'Persian' : 'English';
		if (browserUsable && browser?.language === language)
			return `Web Speech API · ${label} (${language === 'fa' ? 'fa-IR' : 'en-US'})`;
		const reason =
			browser && browser.language !== language
				? `Auto selected ${label}`
				: `Web Speech: ${browser?.error ?? 'no transcript'}`;
		return `${language === 'fa' ? 'Whisper' : 'Moonshine'} fallback · ${label} (${reason})`;
	};
	console.info('[Voice chat STT] Web Speech result:', { mode, ...browser });
	const candidate = async (language: DetectedSpeechLanguage) => {
		onProvider?.(provider(language));
		if (browserUsable && browser?.language === language) return browser.text.trim();
		return (await local.transcribe(language)).trim();
	};
	if (mode !== 'auto') {
		return {
			text: await candidate(mode),
			language: mode,
			candidates: null,
			requiresReview: false,
			provider: provider(mode)
		};
	}

	let detection: LocalSpeechResult | undefined;
	try {
		detection = await local.detect();
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error;
		console.warn('[Voice chat STT] Language scoring failed:', error);
		// The learner can still explicitly select a transcript if language detection fails.
	}
	const selection = selectSpeechLanguage(detection?.languageProbabilities);
	console.info('[Voice chat STT] Language scores:', {
		probabilities: detection?.languageProbabilities ?? null,
		thresholds: LANGUAGE_SELECTION_THRESHOLDS,
		...selection
	});
	const candidates: TranscriptCandidates = { en: '', fa: '' };
	// Keep a browser result already received, even when the audio scores select the
	// other language. It remains available for review and in the diagnostic table.
	if (browserUsable && browser) candidates[browser.language] = browser.text.trim();
	if (!selection.requiresReview && selection.language && !reviewAllCandidates) {
		// Generate only the selected language; never silently switch languages after a failure.
		candidates[selection.language] = await candidate(selection.language);
	} else {
		const results = await Promise.allSettled([candidate('en'), candidate('fa')]);
		for (const [index, language] of (['en', 'fa'] as const).entries()) {
			const result = results[index];
			if (result.status === 'fulfilled') candidates[language] = result.value;
			else if (result.reason instanceof Error && result.reason.name === 'AbortError')
				throw result.reason;
		}
		if (!candidates.en && !candidates.fa)
			throw new Error(
				'Speech recognition is unavailable. Try again, choose English or Persian, or type your answer.'
			);
	}
	let language = selection.language ?? (candidates.fa ? 'fa' : 'en');
	const missingSelected = !candidates[language];
	if ((selection.requiresReview || reviewAllCandidates) && missingSelected)
		language = language === 'en' ? 'fa' : 'en';
	const decision = selectVoiceChatLanguage(detection?.languageProbabilities, {
		text: candidates.fa,
		confidence: null
	});
	decision.requiresReview ||= missingSelected;
	console.table(
		(['en', 'fa'] as const).map((language) => ({
			language: language === 'fa' ? 'Persian' : 'English',
			transcriptEngine:
				browser?.language === language && !browser.error && browser.text.trim()
					? `Web Speech API (${language === 'fa' ? 'fa-IR' : 'en-US'})`
					: language === 'fa'
						? 'Whisper WASM'
						: 'Moonshine WASM',
			transcript: candidates[language],
			transcriptConfidence:
				browser?.language === language && !browser.error ? browser.confidence : null,
			whisperLanguageProbability: detection?.languageProbabilities?.[language] ?? null
		}))
	);
	console.info('Language selection:', decision);
	return {
		text: candidates[language],
		language,
		candidates,
		requiresReview: decision.requiresReview,
		provider: provider(language)
	};
}
