import type { WidgetContentFor, WidgetType } from '../model/types';

export type WidgetCategoryId = string;

export type WidgetCategoryDefinition = {
	id: WidgetCategoryId;
	label: string;
	description: string;
	icon?: WidgetIconName;
};

/** Semantic icon key resolved by the UI layer. Subject packs may add their own. */
export type WidgetIconName = string;

export type WidgetDefinition<T extends WidgetType = WidgetType> = {
	type: T;
	categoryId: WidgetCategoryId;
	label: string;
	description: string;
	icon: WidgetIconName;
	createContent: () => WidgetContentFor<T>;
};

export type AnyWidgetDefinition = {
	[T in WidgetType]: WidgetDefinition<T>;
}[WidgetType];

export function defineWidget<T extends WidgetType>(
	definition: WidgetDefinition<T>
): WidgetDefinition<T> {
	return definition;
}

export function findWidgetDefinition(
	definitions: readonly AnyWidgetDefinition[],
	type: WidgetType
): AnyWidgetDefinition | undefined {
	return definitions.find((definition) => definition.type === type);
}

export function collectWidgetCategories(
	categories: readonly WidgetCategoryDefinition[],
	definitions: readonly AnyWidgetDefinition[]
): WidgetCategoryDefinition[] {
	const usedCategoryIds = new Set(definitions.map((definition) => definition.categoryId));
	return categories.filter((category) => usedCategoryIds.has(category.id));
}
