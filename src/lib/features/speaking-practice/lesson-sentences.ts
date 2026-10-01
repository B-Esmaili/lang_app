import { richTextAutomaticHighlightOffsets } from '$lib/components/rich-text/model';
import {
	courseMediaResourceCues,
	type CourseMediaResource
} from '$lib/domain/course-media-resource';
import { transcriptTextSources } from '$lib/domain/transcribed-text';
import {
	lessonCourseSentences,
	normalizeNoteAnchor,
	type CourseSentence
} from '$lib/features/course-builder/course-notes';
import type { LessonDocument, WidgetInstance } from '$lib/features/lesson-editor/model/types';
import type { SpeakingSentence } from './model';

type TimedWord = { text: string; textOffset: number; startMs: number; endMs: number };
type SentenceSource = {
	label: string;
	url?: string;
	words?: TimedWord[];
};

/** Uses the same stable anchors as course notes, so reordering content preserves selections. */
export function lessonSpeakingSentences(
	document: LessonDocument,
	mediaResources: readonly CourseMediaResource[] = []
): SpeakingSentence[] {
	const sources = new Map<string, SentenceSource>();
	for (const [frameIndex, frame] of document.frames.entries()) {
		for (const widget of Object.values(frame.slots).flat()) {
			const label = sourceLabel(widget);
			if (!label) continue;
			sources.set(widget.id, {
				label: `${frame.title || `Frame ${frameIndex + 1}`} · ${label}`,
				...timedSource(widget, mediaResources)
			});
		}
	}
	return lessonCourseSentences(document).flatMap((sentence) => {
		const source = sources.get(sentence.widgetId);
		if (!source || !/^en(?:-|$)/iu.test(sentence.language)) return [];
		const referenceAudio = sentenceClip(sentence, source);
		return [
			{
				id: sentence.id,
				text: sentence.text,
				language: sentence.language,
				direction: sentence.direction,
				sourceLabel: source.label,
				...(referenceAudio ? { referenceAudio } : {})
			}
		];
	});
}

function sourceLabel(widget: WidgetInstance): string | undefined {
	switch (widget.type) {
		case 'language.passage':
			return 'Passage';
		case 'language.audio':
			return widget.content.title || 'Audio transcript';
		case 'language.vocabulary':
			return widget.content.title || 'Vocabulary';
		case 'content.rich-text':
			return 'Reading';
		case 'content.callout':
			return 'Callout';
		case 'content.vocabulary':
			return 'Vocabulary note';
		// Assessment instructions and speaking widgets are not reference material.
		default:
			return undefined;
	}
}

function timedSource(
	widget: WidgetInstance,
	mediaResources: readonly CourseMediaResource[]
): Pick<SentenceSource, 'url' | 'words'> {
	if (widget.type === 'language.audio') {
		const snapshot = widget.content.transcribedText;
		if (!widget.content.sourceUrl || snapshot?.alignment !== 'synced') return {};
		const tokens = new Map(snapshot.tokens.map((token) => [token.id, token]));
		const words = transcriptTextSources(snapshot.tokens).flatMap((source) =>
			source.tokenLocations.flatMap(({ tokenId, textOffset }) => {
				const token = tokens.get(tokenId);
				return token ? [{ ...token, textOffset }] : [];
			})
		);
		return { url: widget.content.sourceUrl, words };
	}
	if (
		widget.type === 'content.rich-text' ||
		widget.type === 'content.callout' ||
		widget.type === 'content.vocabulary'
	) {
		const resource = mediaResources.find(
			(item) => item.name === widget.content.highlightResourceName
		);
		if (!resource?.sourceUrl || resource.transcribedText?.alignment !== 'synced') return {};
		const offsets = richTextAutomaticHighlightOffsets(widget.content.document);
		return {
			url: resource.sourceUrl,
			words: courseMediaResourceCues(resource).flatMap((cue) => {
				const textOffset = offsets.get(cue.id);
				return textOffset === undefined ? [] : [{ ...cue, textOffset }];
			})
		};
	}
	return {};
}

/** Only offer reference playback when the complete sentence has matching, valid timings. */
function sentenceClip(
	sentence: CourseSentence,
	source: SentenceSource
): SpeakingSentence['referenceAudio'] {
	if (!source.url || !source.words?.length) return undefined;
	const words = source.words.filter(
		(word) => word.textOffset >= sentence.start && word.textOffset < sentence.end
	);
	if (
		!words.length ||
		normalizeNoteAnchor(words.map((word) => word.text).join(' ')) !== sentence.text
	) {
		return undefined;
	}
	for (const [index, word] of words.entries()) {
		if (
			!Number.isFinite(word.startMs) ||
			!Number.isFinite(word.endMs) ||
			word.startMs < 0 ||
			word.endMs <= word.startMs ||
			(index > 0 && word.startMs < words[index - 1].startMs)
		)
			return undefined;
	}
	const startSeconds = words[0].startMs / 1000;
	const endSeconds = words[words.length - 1].endMs / 1000;
	return endSeconds > startSeconds ? { url: source.url, startSeconds, endSeconds } : undefined;
}
