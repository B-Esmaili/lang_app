import type { PassageAnnotation, PassageAnnotationTone } from '../../model/types';

export type AnnotatedTextSegment = {
	start: number;
	end: number;
	text: string;
	annotationIds: string;
	strong: boolean;
	emphasis: boolean;
	highlight: boolean;
	highlightTone?: PassageAnnotationTone;
	underline: boolean;
	vocabulary: boolean;
};

/**
 * Splits plain text at annotation boundaries. Svelte can render the resulting
 * segments safely during SSR without injecting stored HTML.
 */
export function segmentAnnotatedText(
	text: string,
	annotations: PassageAnnotation[]
): AnnotatedTextSegment[] {
	if (!text) return [];

	const validAnnotations = annotations.filter(
		(annotation) =>
			annotation.start >= 0 && annotation.end > annotation.start && annotation.end <= text.length
	);
	const boundaries = [
		...new Set([0, text.length, ...validAnnotations.flatMap(({ start, end }) => [start, end])])
	].toSorted((left, right) => left - right);
	const segments: AnnotatedTextSegment[] = [];

	for (let index = 0; index < boundaries.length - 1; index += 1) {
		const start = boundaries[index];
		const end = boundaries[index + 1];
		if (end <= start) continue;

		const active = validAnnotations
			.filter((annotation) => annotation.start <= start && annotation.end >= end)
			.toSorted((left, right) => left.id.localeCompare(right.id));
		const highlight = active.find((annotation) => annotation.kind === 'highlight');

		segments.push({
			start,
			end,
			text: text.slice(start, end),
			annotationIds: active.map((annotation) => annotation.id).join(' '),
			strong: active.some((annotation) => annotation.kind === 'strong'),
			emphasis: active.some((annotation) => annotation.kind === 'emphasis'),
			highlight: Boolean(highlight),
			highlightTone: highlight?.tone,
			underline: active.some((annotation) => annotation.kind === 'underline'),
			vocabulary: active.some((annotation) => annotation.kind === 'vocabulary')
		});
	}

	return segments;
}
