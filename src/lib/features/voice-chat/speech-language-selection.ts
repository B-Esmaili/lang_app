import type { SpeechLanguageProbabilities } from '../speaking-practice/engine-types';
import {
	selectSpeechLanguage,
	type SpeechLanguageSelection
} from '../speaking-practice/speech-language';

type VoiceChatLanguageSelection = SpeechLanguageSelection & {
	source: 'whisper-probabilities';
};

/**
 * Select the spoken language from Whisper's symmetric language probabilities.
 * The fa-IR browser recognizer is forced to assume Persian, so its confidence
 * describes that transcript under the assumption; it is not language evidence.
 */
export function selectVoiceChatLanguage(
	probabilities: SpeechLanguageProbabilities | undefined,
	persian: { text: string; confidence: number | null }
): VoiceChatLanguageSelection {
	const selection = selectSpeechLanguage(probabilities);
	return {
		...selection,
		// Never auto-send a Persian decision when no Persian transcript is available.
		requiresReview:
			selection.requiresReview || (selection.language === 'fa' && !persian.text.trim()),
		source: 'whisper-probabilities'
	};
}
