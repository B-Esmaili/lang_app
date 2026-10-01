export const courseExplainActions = ['grammar', 'translate', 'elevate'] as const;

export type CourseExplainAction = (typeof courseExplainActions)[number];

export function isCourseExplainAction(value: unknown): value is CourseExplainAction {
	return typeof value === 'string' && courseExplainActions.includes(value as CourseExplainAction);
}

export function createCourseExplainPrompt({
	action,
	text,
	nativeLanguage
}: {
	action: CourseExplainAction;
	text: string;
	nativeLanguage?: string;
}): string {
	const passage = ['Passage:', text].join('\n');

	switch (action) {
		case 'grammar':
			return [
				'Act as a precise, encouraging language tutor.',
				'Explain the grammar in the following course passage in clear, concise language.',
				'Identify the important structures and explain how they work. Use short quoted examples from the passage when helpful.',
				'Do not translate or rewrite the entire passage.',
				'',
				passage
			].join('\n');
		case 'translate':
			return [
				`Translate the following course passage into ${nativeLanguage ?? "the learner's native language"}.`,
				'Preserve the original meaning, tone, formatting, and technical terms. Return only the translation.',
				'',
				passage
			].join('\n');
		case 'elevate':
			return [
				'Rewrite the following course passage in the same language using more advanced, natural vocabulary.',
				'Preserve its meaning, tone, formatting, and technical terms. Improve word choice without making it needlessly ornate.',
				'Return only the rewritten passage.',
				'',
				passage
			].join('\n');
	}
}
