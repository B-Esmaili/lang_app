import type { EntityId } from '../../model/types';
import type { SpeakingSentence } from '$lib/features/speaking-practice/model';

export type AudioPlaybackState = {
	playing: boolean;
	progressSeconds: number;
};

export type TimedTextPlaybackState = {
	isPlaying: boolean;
	sourceKey: string | null;
	textOffset: number | null;
};

export type PronunciationPracticeStatus = 'idle' | 'recording' | 'complete';

export type PronunciationPracticeState = {
	status: PronunciationPracticeStatus;
	recordedSeconds: number;
	referencePlaying: boolean;
};

/** Controlled learner state. Authored widget content remains in LessonDocument. */
export type LanguageWidgetRuntimeBindings = {
	/** Lesson sentence inventory, derived from authored text rather than copied into widgets. */
	speakingSentences?: readonly SpeakingSentence[];
	responseAnswers?: Readonly<Partial<Record<EntityId, string>>>;
	audioPlayback?: Readonly<Partial<Record<EntityId, AudioPlaybackState>>>;
	pronunciationPractice?: Readonly<Partial<Record<EntityId, PronunciationPracticeState>>>;
	onResponseAnswerChange?: (widgetId: EntityId, answer: string) => void;
	onAudioPlaybackChange?: (widgetId: EntityId, playback: AudioPlaybackState) => void;
	onTimedTextPlaybackChange?: (widgetId: EntityId, playback: TimedTextPlaybackState) => void;
	onPronunciationPracticeChange?: (
		widgetId: EntityId,
		practice: PronunciationPracticeState
	) => void;
};
