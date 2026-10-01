import { emptyRichTextDocument } from '../../../components/rich-text/model';
import type { WidgetContentFor, WidgetType } from '../model/types';
import {
	collectWidgetCategories,
	defineWidget,
	findWidgetDefinition,
	type AnyWidgetDefinition,
	type WidgetCategoryDefinition,
	type WidgetDefinition
} from './widget-registry';
import { LANGUAGE_LEARNING_CATEGORY, LANGUAGE_WIDGET_DEFINITIONS } from './language-widgets';

export const CONTENT_CATEGORY: WidgetCategoryDefinition = {
	id: 'content',
	label: 'Content',
	description: 'Flexible building blocks for authored course material.',
	icon: 'shapes'
};

export const CONTENT_WIDGET_DEFINITIONS = [
	defineWidget({
		type: 'content.rich-text',
		categoryId: CONTENT_CATEGORY.id,
		label: 'Rich text',
		description: 'Formatted text with emphasis, highlights, and automatic cue anchors.',
		icon: 'text-cursor-input',
		createContent: () => ({
			type: 'content.rich-text',
			language: 'en',
			direction: 'auto',
			document: emptyRichTextDocument(),
			highlightResourceName: undefined,
			blockStyle: 'prose'
		})
	}),
	defineWidget({
		type: 'content.callout', categoryId: CONTENT_CATEGORY.id, label: 'Callout', description: 'A highlighted explanation or key idea.', icon: 'shapes',
		createContent: () => ({ type: 'content.callout', language: 'en', direction: 'auto', document: emptyRichTextDocument(), blockStyle: 'callout' })
	}),
	defineWidget({
		type: 'content.quiz', categoryId: CONTENT_CATEGORY.id, label: 'Quiz prompt', description: 'A reusable knowledge-check text block.', icon: 'message-square-text',
		createContent: () => ({ type: 'content.quiz', language: 'en', direction: 'auto', document: emptyRichTextDocument(), blockStyle: 'quiz' })
	}),
	defineWidget({
		type: 'content.vocabulary', categoryId: CONTENT_CATEGORY.id, label: 'Vocabulary note', description: 'A reusable term, definition, or example block.', icon: 'languages',
		createContent: () => ({ type: 'content.vocabulary', language: 'en', direction: 'auto', document: emptyRichTextDocument(), blockStyle: 'vocabulary' })
	})
] satisfies readonly AnyWidgetDefinition[];

export const WIDGET_CATEGORIES = [CONTENT_CATEGORY, LANGUAGE_LEARNING_CATEGORY] as const;
export const WIDGET_DEFINITIONS: readonly AnyWidgetDefinition[] = [
	...CONTENT_WIDGET_DEFINITIONS,
	...LANGUAGE_WIDGET_DEFINITIONS
];

export function getWidgetDefinition<T extends WidgetType>(type: T): WidgetDefinition<T> {
	const definition = findWidgetDefinition(WIDGET_DEFINITIONS, type);
	if (!definition) throw new Error(`No widget is registered for type "${type}".`);
	return definition as WidgetDefinition<T>;
}

export function createWidgetContent<T extends WidgetType>(type: T): WidgetContentFor<T> {
	return getWidgetDefinition(type).createContent();
}

export function getWidgetCategories(): WidgetCategoryDefinition[] {
	return collectWidgetCategories(WIDGET_CATEGORIES, WIDGET_DEFINITIONS);
}
