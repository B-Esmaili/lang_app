import type { LessonDocument, TemplateDefinition } from './types';
import { createDefaultFrameAppearance, LESSON_DOCUMENT_VERSION } from './types';

export const BLANK_FRAME_TEMPLATE: TemplateDefinition = {
	id: 'template.blank-frame',
	name: 'Blank frame',
	description: 'A single flowing content region for a simple activity.',
	slots: [
		{
			id: 'content',
			label: 'Content',
			description: 'Any lesson widget can flow through this region.'
		}
	],
	variants: {
		desktop: { columnWeights: [1], areas: [['content']], order: ['content'], gap: 'md' },
		tablet: { columnWeights: [1], areas: [['content']], order: ['content'], gap: 'md' },
		phone: { columnWeights: [1], areas: [['content']], order: ['content'], gap: 'sm' }
	}
};

export const READ_AND_RESPOND_TEMPLATE: TemplateDefinition = {
	id: 'template.read-and-respond',
	name: 'Read and respond',
	description: 'A reading or listening prompt beside a learner response.',
	slots: [
		{
			id: 'lesson',
			label: 'Lesson content',
			description: 'Passage, audio, vocabulary, or pronunciation material.'
		},
		{
			id: 'practice',
			label: 'Learner practice',
			description: 'A prompt for the learner to answer.',
			accepts: [
				'language.response',
				'language.pronunciation',
				'language.speaking-practice',
				'language.voice-chat'
			]
		}
	],
	variants: {
		desktop: {
			columnWeights: [2, 1],
			areas: [['lesson', 'practice']],
			order: ['lesson', 'practice'],
			gap: 'lg'
		},
		tablet: {
			columnWeights: [3, 2],
			areas: [['lesson', 'practice']],
			order: ['lesson', 'practice'],
			gap: 'md'
		},
		phone: {
			columnWeights: [1],
			areas: [['lesson'], ['practice']],
			order: ['lesson', 'practice'],
			gap: 'md'
		}
	}
};

const passageText =
	'یک زبان تازه وقتی آشنا می‌شود که به آهنگ آن گوش بدهید، صداهایش را تمرین کنید و آن را با واژه‌های خودتان به کار ببرید.';

export const SAMPLE_LESSON_DOCUMENT: LessonDocument = {
	schemaVersion: LESSON_DOCUMENT_VERSION,
	id: 'lesson.sample-language',
	title: 'پیدا کردن آهنگ زبان',
	description: 'یک تمرین کوتاه خواندن و شنیدن.',
	language: 'fa',
	direction: 'rtl',
	frames: [
		{
			id: 'frame.introduction',
			templateId: READ_AND_RESPOND_TEMPLATE.id,
			title: 'بخوانید و گوش بدهید',
			appearance: createDefaultFrameAppearance(),
			slots: {
				lesson: [
					{
						id: 'widget.passage.introduction',
						type: 'language.passage',
						content: {
							type: 'language.passage',
							language: 'fa',
							direction: 'rtl',
							text: passageText,
							annotations: [
								{
									id: 'annotation.rhythm',
									start: passageText.indexOf('آهنگ'),
									end: passageText.indexOf('آهنگ') + 'آهنگ'.length,
									kind: 'highlight',
									tone: 'yellow'
								}
							]
						}
					},
					{
						id: 'widget.audio.introduction',
						type: 'language.audio',
						content: {
							type: 'language.audio',
							language: 'fa',
							direction: 'rtl',
							title: 'به متن گوش بدهید',
							sourceUrl: null,
							transcript: passageText,
							durationSeconds: 12,
							waveform: [0.2, 0.44, 0.3, 0.72, 0.48, 0.9, 0.36, 0.62, 0.28, 0.52, 0.2]
						}
					}
				],
				practice: [
					{
						id: 'widget.response.introduction',
						type: 'language.response',
						content: {
							type: 'language.response',
							language: 'fa',
							direction: 'rtl',
							prompt: 'چه چیزی کمک می‌کند یک زبان تازه برای شما آشنا شود؟',
							placeholder: 'پاسخ خود را بنویسید…',
							format: 'long-text'
						}
					}
				]
			}
		}
	]
};
