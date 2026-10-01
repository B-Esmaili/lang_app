import type { TranscribedTextSnapshot } from '$lib/domain/transcribed-text';
import type { RichTextDocument } from '$lib/components/rich-text/model';
import type { SpeakingPracticeConfiguration } from '$lib/features/speaking-practice/model';
import type { VoiceChatConfiguration } from '$lib/features/voice-chat/model';

export const LESSON_DOCUMENT_VERSION = 1 as const;

export type EntityId = string;
export type SlotId = string;

export type PreviewMode = 'auto' | 'phone' | 'tablet' | 'desktop';
export type LayoutPreviewMode = Exclude<PreviewMode, 'auto'>;
export type LayoutGap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type TextDirection = 'auto' | 'ltr' | 'rtl';

export type LanguageContentMetadata = {
	/** A BCP 47 language tag, such as `en`, `fa`, or `ar`. */
	language: string;
	direction: TextDirection;
};

export type PassageAnnotationKind =
	'strong' | 'emphasis' | 'highlight' | 'underline' | 'vocabulary';
export type PassageAnnotationTone = 'yellow' | 'mint' | 'lavender' | 'blue';

export type PassageAnnotation = {
	id: EntityId;
	start: number;
	end: number;
	kind: PassageAnnotationKind;
	tone?: PassageAnnotationTone;
};

export type PassageWidgetContent = LanguageContentMetadata & {
	type: 'language.passage';
	text: string;
	annotations: PassageAnnotation[];
};

/** A context-free RichText document placed in a course lesson. */
export type RichTextBlockType =
	'content.rich-text' | 'content.callout' | 'content.quiz' | 'content.vocabulary';
export type RichTextWidgetContent<T extends RichTextBlockType = 'content.rich-text'> =
	LanguageContentMetadata & {
		type: T;
		document: RichTextDocument;
		/** Normalized course-resource alias that drives automatic media highlights. */
		highlightResourceName?: string;
		/** Presentation-only reusable block style; the text document remains portable. */
		blockStyle?: 'prose' | 'callout' | 'quiz' | 'vocabulary';
	};

export type AudioWidgetContent = LanguageContentMetadata & {
	type: 'language.audio';
	title: string;
	sourceUrl: string | null;
	transcript: string;
	/** Immutable timing snapshot. Older documents may safely omit it. */
	transcribedText?: TranscribedTextSnapshot;
	durationSeconds: number | null;
	waveform: number[];
};

export type ResponseWidgetContent = LanguageContentMetadata & {
	type: 'language.response';
	prompt: string;
	placeholder: string;
	format: 'short-text' | 'long-text';
};

export type VocabularyEntry = {
	id: EntityId;
	term: string;
	definition: string;
	example?: string;
};

export type VocabularyWidgetContent = LanguageContentMetadata & {
	type: 'language.vocabulary';
	title: string;
	entries: VocabularyEntry[];
};

export type PronunciationWidgetContent = LanguageContentMetadata & {
	type: 'language.pronunciation';
	prompt: string;
	targetText: string;
	referenceAudioUrl: string | null;
};

export type SpeakingPracticeWidgetContent = LanguageContentMetadata &
	SpeakingPracticeConfiguration & {
		type: 'language.speaking-practice';
	};

export type VoiceChatWidgetContent = LanguageContentMetadata &
	VoiceChatConfiguration & {
		type: 'language.voice-chat';
	};

export type LanguageWidgetContent =
	| PassageWidgetContent
	| AudioWidgetContent
	| ResponseWidgetContent
	| VocabularyWidgetContent
	| PronunciationWidgetContent
	| SpeakingPracticeWidgetContent
	| VoiceChatWidgetContent;

/**
 * Subject packages extend this interface through module augmentation. Keeping
 * the keys namespaced prevents independently authored widget packs from
 * colliding.
 *
 * @example
 * declare module '$lib/features/lesson-editor/model/types' {
 *   interface WidgetContentMap {
 *     'math.coordinate-plane': CoordinatePlaneContent;
 *   }
 * }
 */
export interface WidgetContentMap {
	'content.rich-text': RichTextWidgetContent;
	'content.callout': RichTextWidgetContent<'content.callout'>;
	'content.quiz': RichTextWidgetContent<'content.quiz'>;
	'content.vocabulary': RichTextWidgetContent<'content.vocabulary'>;
	'language.passage': PassageWidgetContent;
	'language.audio': AudioWidgetContent;
	'language.response': ResponseWidgetContent;
	'language.vocabulary': VocabularyWidgetContent;
	'language.pronunciation': PronunciationWidgetContent;
	'language.speaking-practice': SpeakingPracticeWidgetContent;
	'language.voice-chat': VoiceChatWidgetContent;
}

export type WidgetType = Extract<keyof WidgetContentMap, string>;
export type LanguageWidgetType = LanguageWidgetContent['type'];
export type WidgetContentBase<T extends string = string> = {
	type: T;
	/** Optional for non-text widgets; required by every built-in language widget. */
	language?: string;
	direction?: TextDirection;
};
export type WidgetContentFor<T extends WidgetType> = WidgetContentMap[T] & WidgetContentBase<T>;
export type AnyWidgetContent = {
	[T in WidgetType]: WidgetContentFor<T>;
}[WidgetType];

/**
 * A mapped union keeps the widget type and its content correlated when a
 * WidgetInstance is narrowed by `type`.
 */
export type WidgetInstance<T extends WidgetType = WidgetType> = {
	[K in T]: {
		id: EntityId;
		type: K;
		content: WidgetContentFor<K>;
	};
}[T];

export type FrameBorder = 'none' | 'subtle' | 'accent';
export type FrameSurface = 'transparent' | 'plain' | 'muted' | 'accent';
export type FrameShadow = 'none' | 'soft' | 'raised';
export type FrameRadius = 'none' | 'sm' | 'md' | 'lg';
export type FramePadding = 'none' | 'sm' | 'md' | 'lg';

export type FrameAppearance = {
	border: FrameBorder;
	surface: FrameSurface;
	shadow: FrameShadow;
	radius: FrameRadius;
	padding: FramePadding;
};

export const DEFAULT_FRAME_APPEARANCE: Readonly<FrameAppearance> = Object.freeze({
	border: 'none',
	surface: 'transparent',
	shadow: 'none',
	radius: 'none',
	padding: 'md'
});

export type FrameInstance = {
	id: EntityId;
	templateId: EntityId;
	title?: string;
	slots: Record<SlotId, WidgetInstance[]>;
	appearance: FrameAppearance;
};

/**
 * Layouts use proportional column weights and named spacing tokens. `areas`
 * is a row-by-row slot matrix; repeating a slot name makes it span columns.
 */
export type TemplateLayout = {
	columnWeights: number[];
	areas: SlotId[][];
	order: SlotId[];
	gap: LayoutGap;
	/** Relative inner spacing; omitted in older saved layouts and defaults to none. */
	padding?: LayoutGap;
};

export type TemplateSlotDefinition = {
	id: SlotId;
	label: string;
	description?: string;
	accepts?: WidgetType[];
};

export type TemplateDefinition = {
	id: EntityId;
	name: string;
	description?: string;
	slots: TemplateSlotDefinition[];
	variants: Record<LayoutPreviewMode, TemplateLayout>;
};

export type LessonDocument = {
	schemaVersion: typeof LESSON_DOCUMENT_VERSION;
	id: EntityId;
	title: string;
	description?: string;
	language: string;
	direction: TextDirection;
	frames: FrameInstance[];
};

export function createDefaultFrameAppearance(): FrameAppearance {
	return { ...DEFAULT_FRAME_APPEARANCE };
}
