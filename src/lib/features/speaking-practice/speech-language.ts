import type { DetectedSpeechLanguage, SpeechLanguageProbabilities } from './engine-types';

export type SpeechLanguageDetection = {
	language: DetectedSpeechLanguage | null;
	confidence: number;
	languageProbabilities?: SpeechLanguageProbabilities;
};

/** Normalize over every language token, as Whisper does, before selecting en/fa. */
export function scoreSpeechLanguage(
	logits: ArrayLike<number>,
	languageTokens: Record<string, number>
): SpeechLanguageDetection {
	const english = logits[languageTokens['<|en|>']];
	const persian = logits[languageTokens['<|fa|>']];
	const scores = Object.values(languageTokens).map((token) => logits[token]);
	if (
		!Number.isFinite(english) ||
		!Number.isFinite(persian) ||
		!scores.length ||
		scores.some((score) => !Number.isFinite(score))
	) {
		return { language: null, confidence: 0 };
	}
	const maximum = Math.max(...scores);
	const total = scores.reduce((sum, score) => sum + Math.exp(score - maximum), 0);
	return {
		language: english > persian ? 'en' : persian > english ? 'fa' : null,
		confidence: Math.exp(Math.max(english, persian) - maximum) / total,
		languageProbabilities: {
			en: Math.exp(english - maximum) / total,
			fa: Math.exp(persian - maximum) / total
		}
	};
}

// Initial, tunable routing heuristics for the English/Persian pair, not calibrated accuracy.
export const LANGUAGE_SELECTION_THRESHOLDS = {
	minimumScoreRatio: 3,
	minimumAbsoluteGap: 0.01
} as const;

export type SpeechLanguageSelection = {
	language: DetectedSpeechLanguage | null;
	requiresReview: boolean;
	absoluteGap: number | null;
	scoreRatio: number | null;
};

export function selectSpeechLanguage(
	probabilities: SpeechLanguageProbabilities | undefined
): SpeechLanguageSelection {
	if (
		!probabilities ||
		![probabilities.en, probabilities.fa].every(
			(score) => Number.isFinite(score) && score >= 0 && score <= 1
		) ||
		probabilities.en + probabilities.fa > 1 + 1e-6
	) {
		return { language: null, requiresReview: true, absoluteGap: null, scoreRatio: null };
	}
	const { en, fa } = probabilities;
	const higher = Math.max(en, fa);
	const lower = Math.min(en, fa);
	const absoluteGap = higher - lower;
	// Infinity represents a positive winner with a zero runner-up, not a missing score.
	const scoreRatio = lower > 0 ? higher / lower : higher > 0 ? Infinity : null;
	return {
		language: en > fa ? 'en' : fa > en ? 'fa' : null,
		requiresReview:
			absoluteGap + Number.EPSILON < LANGUAGE_SELECTION_THRESHOLDS.minimumAbsoluteGap ||
			(scoreRatio ?? 0) + 4 * Number.EPSILON < LANGUAGE_SELECTION_THRESHOLDS.minimumScoreRatio,
		absoluteGap,
		scoreRatio
	};
}

export function needsLanguageReview(detection: SpeechLanguageDetection): boolean {
	return selectSpeechLanguage(detection.languageProbabilities).requiresReview;
}
