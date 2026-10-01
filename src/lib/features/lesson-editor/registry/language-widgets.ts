import { DEFAULT_VOICE_CHAT } from '$lib/features/voice-chat/model';
import {
	defineWidget,
	type AnyWidgetDefinition,
	type WidgetCategoryDefinition
} from './widget-registry';

export const LANGUAGE_LEARNING_CATEGORY: WidgetCategoryDefinition = {
	id: 'language-learning',
	label: 'Language Learning',
	description: 'Reading, listening, vocabulary, speaking, and written-response activities.',
	icon: 'languages'
};

export const LANGUAGE_WIDGET_DEFINITIONS = [
	defineWidget({
		type: 'language.passage',
		categoryId: LANGUAGE_LEARNING_CATEGORY.id,
		label: 'Passage',
		description: 'Richly annotated reading text.',
		icon: 'book-open',
		createContent: () => ({
			type: 'language.passage',
			language: 'en',
			direction: 'auto',
			text: '',
			annotations: []
		})
	}),
	defineWidget({
		type: 'language.audio',
		categoryId: LANGUAGE_LEARNING_CATEGORY.id,
		label: 'Audio',
		description: 'Listening material with a transcript and waveform.',
		icon: 'audio-lines',
		createContent: () => ({
			type: 'language.audio',
			language: 'en',
			direction: 'auto',
			title: '',
			sourceUrl: null,
			transcript: '',
			durationSeconds: null,
			waveform: []
		})
	}),
	defineWidget({
		type: 'language.response',
		categoryId: LANGUAGE_LEARNING_CATEGORY.id,
		label: 'Response',
		description: 'A short or extended written answer.',
		icon: 'message-square-text',
		createContent: () => ({
			type: 'language.response',
			language: 'en',
			direction: 'auto',
			prompt: '',
			placeholder: '',
			format: 'long-text'
		})
	}),
	defineWidget({
		type: 'language.vocabulary',
		categoryId: LANGUAGE_LEARNING_CATEGORY.id,
		label: 'Vocabulary',
		description: 'Words, definitions, and examples.',
		icon: 'languages',
		createContent: () => ({
			type: 'language.vocabulary',
			language: 'en',
			direction: 'auto',
			title: '',
			entries: []
		})
	}),
	defineWidget({
		type: 'language.speaking-practice',
		categoryId: LANGUAGE_LEARNING_CATEGORY.id,
		label: 'Speaking Practice',
		description:
			'Choose lesson sentences, record your voice, and compare the spoken words locally.',
		icon: 'mic',
		createContent: () => ({
			type: 'language.speaking-practice',
			language: 'en',
			direction: 'ltr',
			title: 'Speaking practice',
			instructions: 'Choose sentences to practise, then read each one aloud.',
			sentenceMode: 'lesson',
			sentenceIds: []
		})
	}),
	defineWidget({
		type: 'language.pronunciation',
		categoryId: LANGUAGE_LEARNING_CATEGORY.id,
		label: 'Pronunciation',
		description: 'A speaking prompt with optional reference audio.',
		icon: 'mic',
		createContent: () => ({
			type: 'language.pronunciation',
			language: 'en',
			direction: 'auto',
			prompt: '',
			targetText: '',
			referenceAudioUrl: null
		})
	}),
	defineWidget({
		type: 'language.voice-chat',
		categoryId: LANGUAGE_LEARNING_CATEGORY.id,
		label: 'Voice Chat',
		description: 'Talk with an AI partner in English and ask for corrections.',
		icon: 'mic',
		createContent: () => ({
			type: 'language.voice-chat',
			language: 'en',
			direction: 'ltr',
			...DEFAULT_VOICE_CHAT
		})
	})
] satisfies readonly AnyWidgetDefinition[];
