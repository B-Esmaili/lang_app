<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		ArrowLeft,
		ArrowRight,
		BookOpen,
		BookOpenCheck,
		Check,
		ChevronDown,
		ChevronRight,
		Languages,
		List,
		LoaderCircle,
		LockKeyhole,
		Printer,
		Quote,
		Save,
		Sparkles,
		StickyNote,
		Trash2,
		Users,
		WandSparkles,
		X
	} from '@lucide/svelte';
	import Markdown from '$lib/components/chat/markdown.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		observeReadingViewport,
		scrollIntoReadingViewport
	} from '$lib/components/reading-viewport';
	import {
		LessonEditor,
		type LanguageWidgetRuntimeBindings,
		type TimedTextPlaybackState
	} from '$lib/features/lesson-editor';
	import SentenceNoteStack from './SentenceNoteStack.svelte';
	import {
		courseSentenceAtTextOffset,
		courseSentenceAnchor,
		lessonCourseSentences,
		normalizeNoteAnchor,
		type CourseNote,
		type CourseNoteAnchor,
		type CourseSentence
	} from './course-notes';
	import type { CourseBuilderData } from './model';

	const explainActions = [
		{
			id: 'grammar',
			label: 'Explain grammar',
			icon: BookOpen,
			description: 'Understand the grammar structures in the selected sentences.'
		},
		{
			id: 'translate',
			label: 'Translate to my language',
			icon: Languages,
			description: 'Use the native language configured in your profile.'
		},
		{
			id: 'elevate',
			label: 'Upgrade vocabulary',
			icon: WandSparkles,
			description: 'Rewrite it with more advanced, natural wording.'
		}
	] as const;

	type ExplainAction = (typeof explainActions)[number]['id'];
	type StudyMode = 'explain' | 'notes';
	type StackPosition = { top: number; left: number; width: number };
	type TextPosition = { node: Text; offset: number };
	type WidgetTextIndex = { normalized: string; positions: TextPosition[] };
	type SentenceRangeCacheEntry = { root: HTMLElement; range: Range | null };
	type ActiveTimedTextPlayback = { order: number; playback: TimedTextPlaybackState };

	const textIndexBlockTags = new Set([
		'ADDRESS',
		'ARTICLE',
		'ASIDE',
		'BLOCKQUOTE',
		'DIV',
		'FIGCAPTION',
		'FIGURE',
		'FOOTER',
		'H1',
		'H2',
		'H3',
		'H4',
		'H5',
		'H6',
		'HEADER',
		'LI',
		'MAIN',
		'NAV',
		'P',
		'SECTION'
	]);

	let {
		initialData,
		nativeLanguage,
		viewerId
	}: {
		initialData: CourseBuilderData;
		nativeLanguage?: string;
		viewerId?: string;
	} = $props();

	const data = untrack(() => structuredClone($state.snapshot(initialData)));
	let notes = $state<CourseNote[]>(structuredClone(data.notes ?? []));
	let selectedId = $state(data.lessons[0]?.id ?? '');
	let completedFrameIds = $state<ReadonlySet<string>>(new Set());
	let outlineOpen = $state(true);
	let studyPanelOpen = $state(false);
	let studyMode = $state<StudyMode>('explain');
	let selectedText = $state('');
	let selectedAnchors = $state<CourseNoteAnchor[]>([]);
	let playbackAnchor = $state<CourseNoteAnchor | null>(null);
	let playbackWidgetId = $state<string | null>(null);
	let timedTextPlaybackOrder = 0;
	const activeTimedTextPlayback = new SvelteMap<string, ActiveTimedTextPlayback>();
	let noteStackPosition = $state<StackPosition>({ top: 96, left: 16, width: 260 });
	let noteBody = $state('');
	let noteBusy = $state(false);
	let deletingNoteId = $state<string | null>(null);
	let noteMessage = $state<string | null>(null);
	let aiAnswer = $state('');
	let aiAnswerAnchors = $state<CourseNoteAnchor[]>([]);
	let aiAnswerLanguage = $state<string | null>(null);
	let aiBusy = $state(false);
	let aiSaving = $state(false);
	let explainAction = $state<ExplainAction>('grammar');
	let explainError = $state('');
	let studyPanel = $state<HTMLElement>();
	let studyPanelBody = $state<HTMLDivElement>();
	let lessonContent = $state<HTMLElement>();
	let toolbarHeight = $state(64);
	let studyTrigger: HTMLElement | null = null;
	let anchorRanges = new SvelteMap<string, Range>();
	let highlightedNoteId: string | null = null;
	let widgetTextIndexes = new WeakMap<HTMLElement, WidgetTextIndex>();
	const sentenceRangeCache = new SvelteMap<string, SentenceRangeCacheEntry>();

	const selectedIndex = $derived(
		Math.max(
			0,
			data.lessons.findIndex((lesson) => lesson.id === selectedId)
		)
	);
	const selected = $derived(data.lessons[selectedIndex]);
	const templates = data.templates.map((template) => template.definition);
	const selectedSentences = $derived(selected ? lessonCourseSentences(selected.document) : []);
	const selectedLessonNotes = $derived(
		selected ? notes.filter((note) => note.lessonId === selected.id) : []
	);
	const stackAnchors = $derived(playbackAnchor ? [playbackAnchor] : selectedAnchors);
	const activeNotes = $derived.by(() => {
		return notesForAnchors(stackAnchors);
	});
	const selectedAnchorNotes = $derived.by(() => notesForAnchors(selectedAnchors));
	const selectedAnchorNoteIds = $derived(new Set(selectedAnchorNotes.map((note) => note.id)));
	const readerLanguageRuntime: LanguageWidgetRuntimeBindings = {
		onTimedTextPlaybackChange: handleTimedTextPlaybackChange
	};

	function notesForAnchors(anchors: readonly CourseNoteAnchor[]): CourseNote[] {
		const keys = new Set(anchors.map(({ key }) => key));
		return selectedLessonNotes
			.filter((note) =>
				note.anchors.some((anchor) => {
					const sentence = sentenceForAnchor(anchor, note.source === 'legacy');
					return Boolean(sentence && keys.has(sentence.id));
				})
			)
			.toSorted((left, right) => {
				const leftNative = left.kind === 'translation' && left.language === nativeLanguage ? 1 : 0;
				const rightNative =
					right.kind === 'translation' && right.language === nativeLanguage ? 1 : 0;
				return rightNative - leftNative || right.updatedAt.localeCompare(left.updatedAt);
			});
	}
	const completedFrameCount = $derived(
		selected?.document.frames.filter((frame) => completedFrameIds.has(frame.id)).length ?? 0
	);
	const frameProgressKey = `learning-studio:course:${data.course.id}:completed-frames`;

	onMount(() => {
		outlineOpen = !window.matchMedia('(max-width: 56rem)').matches;
		try {
			const stored = JSON.parse(localStorage.getItem(frameProgressKey) ?? '[]') as unknown;
			if (Array.isArray(stored)) {
				completedFrameIds = new Set(stored.filter((id): id is string => typeof id === 'string'));
			}
		} catch {
			completedFrameIds = new Set();
		}

		let selecting = false;
		const beginSelection = (event: PointerEvent) => {
			selecting = event.target instanceof Node && Boolean(lessonContent?.contains(event.target));
		};
		const finishSelection = (event: PointerEvent) => {
			if (!selecting) return;
			selecting = false;
			captureLessonSelection(event.clientX, event.clientY);
		};
		const rememberSelection = () => {
			if (!selecting) captureLessonSelection();
		};
		let repositionFrame: number | null = null;
		const reposition = (event?: Event) => {
			const target = event?.target;
			if (target instanceof Element && target.closest('.sentence-note-stack, .study-drawer')) {
				return;
			}
			if (repositionFrame !== null) return;
			repositionFrame = requestAnimationFrame(() => {
				repositionFrame = null;
				updateStackPosition();
			});
		};
		document.addEventListener('selectionchange', rememberSelection);
		document.addEventListener('pointerdown', beginSelection, true);
		document.addEventListener('pointerup', finishSelection);
		document.addEventListener('pointercancel', finishSelection);
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', reposition, true);
		const lessonObserver = new MutationObserver(invalidateTextRangeCaches);
		if (lessonContent) {
			lessonObserver.observe(lessonContent, {
				childList: true,
				characterData: true,
				subtree: true
			});
		}
		return () => {
			document.removeEventListener('selectionchange', rememberSelection);
			document.removeEventListener('pointerdown', beginSelection, true);
			document.removeEventListener('pointerup', finishSelection);
			document.removeEventListener('pointercancel', finishSelection);
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', reposition, true);
			if (repositionFrame !== null) cancelAnimationFrame(repositionFrame);
			lessonObserver.disconnect();
			clearNoteHighlight();
		};
	});

	function selectLesson(id: string) {
		if (id === selectedId) return;
		invalidateTextRangeCaches();
		selectedId = id;
		clearStudyContext();
		void tick().then(() => {
			lessonContent?.focus({ preventScroll: true });
			if (window.matchMedia('(max-width: 56rem)').matches) outlineOpen = false;
			lessonContent?.scrollIntoView({ block: 'start' });
		});
	}

	function moveLesson(offset: -1 | 1) {
		const next = data.lessons[selectedIndex + offset];
		if (next) selectLesson(next.id);
	}

	function toggleFrameComplete(frameId: string) {
		const next = new SvelteSet(completedFrameIds);
		if (next.has(frameId)) next.delete(frameId);
		else next.add(frameId);
		completedFrameIds = next;
		try {
			localStorage.setItem(frameProgressKey, JSON.stringify([...next]));
		} catch {
			// Progress remains available for this visit.
		}
	}

	function openFrame(frameId: string) {
		lessonContent
			?.querySelector<HTMLElement>(`[data-lesson-frame][data-frame-id="${CSS.escape(frameId)}"]`)
			?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function exportCourse() {
		window.print();
	}

	function handleTimedTextPlaybackChange(widgetId: string, playback: TimedTextPlaybackState) {
		if (playback.isPlaying) {
			const current = activeTimedTextPlayback.get(widgetId);
			activeTimedTextPlayback.set(widgetId, {
				order: current?.order ?? ++timedTextPlaybackOrder,
				playback
			});
		} else {
			activeTimedTextPlayback.delete(widgetId);
		}
		syncPlaybackNoteContext();
	}

	function syncPlaybackNoteContext() {
		const owner = [...activeTimedTextPlayback].reduce<[string, ActiveTimedTextPlayback] | null>(
			(latest, entry) => (!latest || entry[1].order > latest[1].order ? entry : latest),
			null
		);
		const ownerWidgetId = owner?.[0] ?? null;
		const playback = owner?.[1].playback;
		const sentence =
			ownerWidgetId && playback?.sourceKey && playback.textOffset !== null
				? courseSentenceAtTextOffset(
						selectedSentences,
						ownerWidgetId,
						playback.sourceKey,
						playback.textOffset
					)
				: undefined;
		const nextAnchor = sentence ? courseSentenceAnchor(sentence) : null;
		if (playbackWidgetId === ownerWidgetId && playbackAnchor?.key === nextAnchor?.key) return;
		if (playbackWidgetId === ownerWidgetId && playbackAnchor === null && nextAnchor === null)
			return;
		playbackWidgetId = ownerWidgetId;
		playbackAnchor = nextAnchor;
		clearNoteHighlight();
		void tick().then(updateStackPosition);
	}

	function captureLessonSelection(clientX?: number, clientY?: number): boolean {
		if (!lessonContent || !selected) return false;
		const selection = window.getSelection();
		let sourceRange =
			selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
		if (sourceRange && !rangeBelongsToLesson(sourceRange)) sourceRange = null;
		if (!sourceRange && clientX !== undefined && clientY !== undefined) {
			sourceRange = caretRangeAtPoint(clientX, clientY);
			if (sourceRange && !rangeBelongsToLesson(sourceRange)) sourceRange = null;
		}
		if (!sourceRange) return false;

		const isPoint = sourceRange.collapsed;
		const sourceWidget = widgetForNode(sourceRange.startContainer);
		const next: Array<{ sentence: CourseSentence; range: Range }> = [];
		for (const sentence of selectedSentences) {
			if (isPoint && sourceWidget?.dataset.widgetId !== sentence.widgetId) continue;
			const range = rangeForSentence(sentence);
			if (!range) continue;
			if (isPoint) {
				try {
					if (range.comparePoint(sourceRange.startContainer, sourceRange.startOffset) === 0) {
						next.push({ sentence, range });
						break;
					}
				} catch {
					// The point is outside this sentence range.
				}
			} else if (rangesOverlap(sourceRange, range)) {
				next.push({ sentence, range });
			}
		}

		if (!next.length) return false;

		next.sort((left, right) => left.range.compareBoundaryPoints(Range.START_TO_START, right.range));
		anchorRanges = new SvelteMap(next.map(({ sentence, range }) => [sentence.id, range]));
		selectedAnchors = next.map(({ sentence }) => courseSentenceAnchor(sentence));
		selectedText = selectedAnchors.map(({ text }) => text).join(' ');
		noteMessage = null;
		if (!aiBusy) {
			aiAnswer = '';
			aiAnswerAnchors = [];
			aiAnswerLanguage = null;
			explainError = '';
		}
		updateStackPosition();
		return true;
	}

	function rangeBelongsToLesson(range: Range): boolean {
		const ancestor = range.commonAncestorContainer;
		return Boolean(
			lessonContent?.contains(ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentNode : ancestor)
		);
	}

	function widgetForNode(node: Node): HTMLElement | null {
		const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
		return element?.closest<HTMLElement>('[data-widget-id]') ?? null;
	}

	function caretRangeAtPoint(x: number, y: number): Range | null {
		const documentWithCaret = document as Document & {
			caretPositionFromPoint?: (
				x: number,
				y: number
			) => { offsetNode: Node; offset: number } | null;
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
		};
		const position = documentWithCaret.caretPositionFromPoint?.(x, y);
		if (position) {
			const range = document.createRange();
			range.setStart(position.offsetNode, position.offset);
			range.collapse(true);
			return range;
		}
		return documentWithCaret.caretRangeFromPoint?.(x, y) ?? null;
	}

	function rangeForSentence(sentence: CourseSentence): Range | null {
		if (!lessonContent) return null;
		const widget = lessonContent.querySelector<HTMLElement>(
			`[data-widget-id="${CSS.escape(sentence.widgetId)}"]`
		);
		if (!widget) return null;
		const rangeRoot = widget.querySelector<HTMLElement>('.audio-transcript') ?? widget;
		const cached = sentenceRangeCache.get(sentence.id);
		if (cached?.root === rangeRoot) {
			if (!cached.range) return null;
			if (
				cached.range.startContainer.isConnected &&
				cached.range.endContainer.isConnected &&
				rangeRoot.contains(cached.range.startContainer) &&
				rangeRoot.contains(cached.range.endContainer)
			) {
				return cached.range;
			}
		}
		const needle = normalizeNoteAnchor(sentence.text);
		const occurrencesBefore = selectedSentences
			.filter(
				(candidate) =>
					candidate.widgetId === sentence.widgetId && candidate.position < sentence.position
			)
			.reduce(
				(total, candidate) =>
					total + countTextOccurrences(normalizeNoteAnchor(candidate.text), needle),
				0
			);
		const range = findTextRange(rangeRoot, sentence.text, occurrencesBefore);
		sentenceRangeCache.set(sentence.id, { root: rangeRoot, range });
		return range;
	}

	function rangeForAnchor(anchor: CourseNoteAnchor): Range | null {
		const canonical = sentenceForAnchor(anchor, false) ?? sentenceForAnchor(anchor, true);
		if (canonical) return rangeForSentence(canonical);
		if (!lessonContent || !anchor.widgetId) return null;
		const widget = lessonContent.querySelector<HTMLElement>(
			`[data-widget-id="${CSS.escape(anchor.widgetId)}"]`
		);
		return widget ? findTextRange(widget, anchor.text, 0) : null;
	}

	function sentenceForAnchor(
		anchor: CourseNoteAnchor,
		allowLegacyFragment: boolean
	): CourseSentence | undefined {
		const direct = selectedSentences.find(({ id }) => id === anchor.key);
		if (direct) return direct;
		const anchorText = normalizeNoteAnchor(anchor.text);
		if (!anchorText) return undefined;
		let matches = selectedSentences.filter((sentence) => {
			const sentenceText = normalizeNoteAnchor(sentence.text);
			return (
				(allowLegacyFragment ? sentenceText.includes(anchorText) : sentenceText === anchorText) &&
				(!anchor.widgetId || sentence.widgetId === anchor.widgetId) &&
				(!anchor.frameId || sentence.frameId === anchor.frameId) &&
				(!anchor.sourceKey || sentence.sourceKey === anchor.sourceKey) &&
				(anchor.occurrence === undefined || sentence.occurrence === anchor.occurrence)
			);
		});
		if (matches.length > 1 && (anchor.prefix || anchor.suffix)) {
			matches = matches.filter(
				(sentence) =>
					(!anchor.prefix || sentence.prefix === normalizeNoteAnchor(anchor.prefix)) &&
					(!anchor.suffix || sentence.suffix === normalizeNoteAnchor(anchor.suffix))
			);
		}
		if (matches.length > 1 && anchor.start !== undefined && anchor.end !== undefined) {
			matches = matches.filter(
				(sentence) => sentence.start === anchor.start && sentence.end === anchor.end
			);
		}
		return matches.length === 1 ? matches[0] : undefined;
	}

	function findTextRange(
		root: HTMLElement,
		searchedText: string,
		occurrence: number
	): Range | null {
		const { normalized, positions } = textIndexForWidget(root);
		const needle = normalizeNoteAnchor(searchedText);
		if (!normalized || !needle) return null;

		let start = -1;
		let from = 0;
		for (let index = 0; index <= occurrence; index += 1) {
			start = normalized.indexOf(needle, from);
			if (start < 0) return null;
			from = start + needle.length;
		}
		const first = positions[start];
		const last = positions[start + needle.length - 1];
		if (!first || !last) return null;
		const range = document.createRange();
		range.setStart(first.node, first.offset);
		range.setEnd(last.node, Math.min(last.offset + 1, last.node.length));
		return range;
	}

	function textIndexForWidget(root: HTMLElement): WidgetTextIndex {
		const cached = widgetTextIndexes.get(root);
		if (cached) return cached;

		const raw: Array<{ character: string; node: Text; offset: number }> = [];
		let latestTextNode: Text | null = null;
		const appendBoundary = () => {
			if (!latestTextNode || !raw.length || /\s/u.test(raw.at(-1)!.character)) return;
			raw.push({ character: ' ', node: latestTextNode, offset: latestTextNode.length });
		};
		const visit = (node: Node) => {
			if (node.nodeType === Node.TEXT_NODE) {
				const textNode = node as Text;
				latestTextNode = textNode;
				for (let index = 0; index < textNode.data.length; index += 1) {
					raw.push({ character: textNode.data[index]!, node: textNode, offset: index });
				}
				return;
			}
			if (!(node instanceof Element)) return;
			if (node.matches('[aria-hidden="true"], button, [contenteditable="true"], .sr-only')) {
				return;
			}
			if (node.tagName === 'BR') {
				appendBoundary();
				return;
			}
			const block = textIndexBlockTags.has(node.tagName);
			if (block) appendBoundary();
			for (const child of node.childNodes) visit(child);
			if (block) appendBoundary();
		};
		visit(root);

		const positions: TextPosition[] = [];
		let normalized = '';
		let previousWasSpace = false;
		for (const item of raw) {
			if (/\s/u.test(item.character)) {
				if (previousWasSpace || !normalized.length) continue;
				normalized += ' ';
				positions.push({ node: item.node, offset: item.offset });
				previousWasSpace = true;
			} else {
				normalized += item.character;
				positions.push({ node: item.node, offset: item.offset });
				previousWasSpace = false;
			}
		}
		const index = { normalized, positions };
		widgetTextIndexes.set(root, index);
		return index;
	}

	function invalidateTextRangeCaches() {
		widgetTextIndexes = new WeakMap<HTMLElement, WidgetTextIndex>();
		sentenceRangeCache.clear();
		anchorRanges.clear();
	}

	function countTextOccurrences(haystack: string, needle: string): number {
		if (!needle) return 0;
		let count = 0;
		let from = 0;
		while (from <= haystack.length - needle.length) {
			const match = haystack.indexOf(needle, from);
			if (match < 0) break;
			count += 1;
			from = match + needle.length;
		}
		return count;
	}

	function rangesOverlap(left: Range, right: Range): boolean {
		return (
			left.compareBoundaryPoints(Range.START_TO_END, right) > 0 &&
			left.compareBoundaryPoints(Range.END_TO_START, right) < 0
		);
	}

	function updateStackPosition() {
		const first = stackAnchors[0];
		const range = first ? (anchorRanges.get(first.key) ?? rangeForAnchor(first)) : null;
		if (!range) return;
		const rect = range.getBoundingClientRect();
		if (!rect.width && !rect.height) return;
		const desiredWidth = Math.min(400, window.innerWidth - 16);
		const left = Math.max(8, Math.min(rect.left, window.innerWidth - desiredWidth - 8));
		const top =
			rect.bottom + 220 < window.innerHeight ? rect.bottom + 10 : Math.max(8, rect.top - 230);
		noteStackPosition = { top, left, width: Math.max(rect.width, 80) };
	}

	function clearSelectedText() {
		selectedText = '';
		selectedAnchors = [];
		anchorRanges.clear();
		aiAnswer = '';
		aiAnswerAnchors = [];
		explainError = '';
		window.getSelection()?.removeAllRanges();
		clearNoteHighlight();
	}

	function clearStudyContext() {
		clearSelectedText();
		activeTimedTextPlayback.clear();
		timedTextPlaybackOrder = 0;
		playbackAnchor = null;
		playbackWidgetId = null;
		noteBody = '';
		noteMessage = null;
		studyPanelOpen = false;
	}

	function openStudyPanel(mode: StudyMode) {
		captureLessonSelection();
		const wasOpen = studyPanelOpen;
		const previousMode = studyMode;
		const previousFocus = document.activeElement;
		if (!wasOpen && previousFocus instanceof HTMLElement) studyTrigger = previousFocus;
		studyMode = mode;
		studyPanelOpen = true;
		noteMessage = null;
		void tick().then(() => {
			if (previousMode !== mode && studyPanelBody) studyPanelBody.scrollTop = 0;
			if (!wasOpen) studyPanel?.focus({ preventScroll: true });
		});
	}

	function closeStudyPanel() {
		studyPanelOpen = false;
		studyTrigger?.focus({ preventScroll: true });
	}

	function getExplainAction(actionId: ExplainAction) {
		return explainActions.find((action) => action.id === actionId) ?? explainActions[0]!;
	}

	function copyAnchors(anchors: readonly CourseNoteAnchor[]): CourseNoteAnchor[] {
		return anchors.map((anchor) => ({ ...anchor }));
	}

	function selectedExplainAction() {
		return getExplainAction(explainAction);
	}

	async function runExplainAction(action: ExplainAction) {
		if (aiBusy) return;
		captureLessonSelection();
		studyMode = 'explain';
		studyPanelOpen = true;
		explainAction = action;
		if (!selectedText || !selectedAnchors.length) {
			noteMessage = 'Select one or more sentences, then choose an AI study action.';
			return;
		}
		const sourceText = selectedText;
		const sourceLessonId = selectedId;
		const sourceAnchors = copyAnchors(selectedAnchors);
		aiBusy = true;
		aiAnswer = '';
		aiAnswerAnchors = [];
		aiAnswerLanguage = null;
		explainError = '';
		try {
			const response = await fetch('/api/ai/explain', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: sourceText, action })
			});
			const payload = (await response.json().catch(() => null)) as {
				explanation?: unknown;
				targetLanguage?: unknown;
				error?: unknown;
			} | null;
			if (!response.ok) {
				throw new Error(
					typeof payload?.error === 'string'
						? payload.error
						: 'The AI study response could not be generated.'
				);
			}
			if (typeof payload?.explanation !== 'string' || !payload.explanation.trim()) {
				throw new Error('No study response was returned.');
			}
			if (selectedId === sourceLessonId) {
				aiAnswer = payload.explanation.trim();
				aiAnswerAnchors = sourceAnchors;
				aiAnswerLanguage =
					typeof payload.targetLanguage === 'string' ? payload.targetLanguage : null;
			}
		} catch (error) {
			if (selectedId === sourceLessonId) {
				explainError =
					error instanceof Error ? error.message : 'The AI study response could not be generated.';
			}
		} finally {
			aiBusy = false;
		}
	}

	async function createNote(input: {
		body: string;
		anchors: CourseNoteAnchor[];
		kind?: 'note' | 'translation';
		source?: 'manual' | 'explanation';
		language?: string | null;
	}): Promise<CourseNote> {
		if (!selected) throw new Error('Choose a lesson first.');
		const response = await fetch(`/api/courses/${data.course.id}/notes`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				lessonId: selected.id,
				kind: input.kind ?? 'note',
				visibility: 'private',
				source: input.source ?? 'manual',
				anchors: input.anchors,
				body: input.body,
				language: input.language ?? null
			})
		});
		const payload = (await response.json().catch(() => null)) as
			CourseNote | { error?: string } | null;
		if (!response.ok || !payload || !('id' in payload)) {
			throw new Error(
				payload && 'error' in payload && typeof payload.error === 'string'
					? payload.error
					: 'The note could not be saved.'
			);
		}
		notes = [payload, ...notes.filter((note) => note.id !== payload.id)];
		return payload;
	}

	async function saveManualNote() {
		if (!noteBody.trim() || !selectedAnchors.length || noteBusy) return;
		noteBusy = true;
		noteMessage = null;
		try {
			await createNote({
				body: noteBody.trim(),
				anchors: copyAnchors(selectedAnchors)
			});
			noteBody = '';
			noteMessage = 'Private note saved.';
		} catch (error) {
			noteMessage = error instanceof Error ? error.message : 'The note could not be saved.';
		} finally {
			noteBusy = false;
		}
	}

	async function saveAiAnswer() {
		if (!aiAnswer || !aiAnswerAnchors.length || aiSaving) return;
		aiSaving = true;
		noteMessage = null;
		try {
			await createNote({
				body: aiAnswer,
				anchors: copyAnchors(aiAnswerAnchors),
				kind: explainAction === 'translate' ? 'translation' : 'note',
				source: 'explanation',
				language:
					explainAction === 'translate' ? (aiAnswerLanguage ?? nativeLanguage ?? null) : null
			});
			noteMessage = 'AI response saved as a private note.';
		} catch (error) {
			noteMessage = error instanceof Error ? error.message : 'The response could not be saved.';
		} finally {
			aiSaving = false;
		}
	}

	async function deleteNote(note: CourseNote) {
		if (deletingNoteId) return;
		deletingNoteId = note.id;
		noteMessage = null;
		try {
			const response = await fetch(
				`/api/courses/${data.course.id}/notes/${encodeURIComponent(note.id)}`,
				{ method: 'DELETE' }
			);
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
				throw new Error(
					typeof payload?.error === 'string' ? payload.error : 'The note could not be deleted.'
				);
			}
			notes = notes.filter((candidate) => candidate.id !== note.id);
			noteMessage = 'Note deleted.';
		} catch (error) {
			noteMessage = error instanceof Error ? error.message : 'The note could not be deleted.';
		} finally {
			deletingNoteId = null;
		}
	}

	function activateNote(note: CourseNote) {
		const resolved = note.anchors.flatMap((anchor) => {
			const sentence = sentenceForAnchor(anchor, note.source === 'legacy');
			const range = sentence ? rangeForSentence(sentence) : null;
			return sentence && range ? [{ sentence, range }] : [];
		});
		if (!resolved.length) return;
		resolved.sort((left, right) => left.sentence.position - right.sentence.position);
		selectedAnchors = resolved.map(({ sentence }) => courseSentenceAnchor(sentence));
		selectedText = selectedAnchors.map(({ text }) => text).join(' ');
		anchorRanges = new SvelteMap(resolved.map(({ sentence, range }) => [sentence.id, range]));
		const firstRange = resolved[0]!.range;
		const element =
			firstRange.startContainer.nodeType === Node.ELEMENT_NODE
				? (firstRange.startContainer as Element)
				: firstRange.startContainer.parentElement;
		if (element) scrollIntoReadingViewport(element, firstRange.getBoundingClientRect());
		highlightNote(note);
		updateStackPosition();
	}

	function highlightNote(note: CourseNote | null) {
		const nextId = note?.id ?? null;
		if (highlightedNoteId === nextId) return;
		clearNoteHighlight();
		if (!note) return;
		highlightedNoteId = note.id;
		const ranges = note.anchors
			.map(rangeForAnchor)
			.filter((range): range is Range => Boolean(range));
		const HighlightConstructor = (
			globalThis as typeof globalThis & {
				Highlight?: new (...ranges: Range[]) => unknown;
			}
		).Highlight;
		const registry = (
			CSS as typeof CSS & {
				highlights?: { set(name: string, value: unknown): void; delete(name: string): void };
			}
		).highlights;
		if (HighlightConstructor && registry && ranges.length) {
			registry.set('course-note-hover', new HighlightConstructor(...ranges));
		}
	}

	function clearNoteHighlight() {
		highlightedNoteId = null;
		(CSS as typeof CSS & { highlights?: { delete(name: string): void } }).highlights?.delete(
			'course-note-hover'
		);
	}

	function excerpt(text: string, length = 120) {
		return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
	}

	function formattedDate(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? 'Earlier'
			: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && studyPanelOpen && !event.defaultPrevented) {
			event.preventDefault();
			closeStudyPanel();
		}
	}}
/>

<div
	class="course-reader"
	use:observeReadingViewport
	style:--course-accent={data.course.accent}
	style:--study-toolbar-height={toolbarHeight + 'px'}
>
	<header class="course-heading">
		<div class="course-copy" lang={data.course.language} dir={data.course.direction}>
			<p class="eyebrow">Your classroom</p>
			<h1>{data.course.title}</h1>
			{#if data.course.description}<p class="course-description">{data.course.description}</p>{/if}
		</div>
		<div class="course-meta">
			<span>{data.lessons.length} {data.lessons.length === 1 ? 'lesson' : 'lessons'}</span>
			<Button type="button" variant="ghost" size="sm" class="course-export" onclick={exportCourse}>
				<Printer data-icon="inline-start" /> Print
			</Button>
		</div>
	</header>

	{#if selected}
		<div class="reader-layout">
			<aside class="course-map" aria-label="Course navigation">
				<details class="course-outline" open={outlineOpen}>
					<summary
						onclick={(event) => {
							event.preventDefault();
							outlineOpen = !outlineOpen;
						}}
					>
						<List size={17} aria-hidden="true" />
						<span>Course contents</span>
						<ChevronDown size={15} class="disclosure-arrow" aria-hidden="true" />
					</summary>
					<nav aria-label="Course lessons">
						{#each data.lessons as lesson, index (lesson.id)}
							<button
								type="button"
								class:active={lesson.id === selectedId}
								aria-current={lesson.id === selectedId ? 'step' : undefined}
								onclick={() => selectLesson(lesson.id)}
							>
								<span class="lesson-number">{String(index + 1).padStart(2, '0')}</span>
								<span
									class="lesson-copy"
									lang={lesson.document.language}
									dir={lesson.document.direction}
								>
									<strong>{lesson.title}</strong>
									<small
										>{lesson.document.frames.length}
										{lesson.document.frames.length === 1 ? 'section' : 'sections'}</small
									>
								</span>
								{#if lesson.id === selectedId}<span class="current-dot" aria-hidden="true"
									></span>{/if}
							</button>
						{/each}
					</nav>
					{#if selected.document.frames.length}
						<details class="frame-progress">
							<summary>
								<span>In this lesson</span>
								<span class="progress-count"
									>{completedFrameCount}/{selected.document.frames.length}</span
								>
								<ChevronDown size={14} class="disclosure-arrow" aria-hidden="true" />
							</summary>
							<p class="outline-hint">Check off sections as you go.</p>
							{#each selected.document.frames as frame, index (frame.id)}
								<div class="frame-row">
									<button type="button" class="frame-link" onclick={() => openFrame(frame.id)}>
										<span>{index + 1}</span>{frame.title || `Section ${index + 1}`}
									</button>
									<button
										type="button"
										class="frame-check"
										class:complete={completedFrameIds.has(frame.id)}
										aria-label={`${completedFrameIds.has(frame.id) ? 'Mark incomplete' : 'Mark complete'}: ${frame.title || `Section ${index + 1}`}`}
										aria-pressed={completedFrameIds.has(frame.id)}
										onclick={() => toggleFrameComplete(frame.id)}><Check size={14} /></button
									>
								</div>
							{/each}
						</details>
					{/if}
				</details>
				<p class="sidebar-note"><BookOpenCheck size={15} /> Learn at your own pace.</p>
			</aside>

			<section class="lesson-stage" aria-label="Current lesson">
				<div
					class="study-toolbar"
					data-reading-overlay="top"
					bind:offsetHeight={toolbarHeight}
					aria-label="Lesson study tools"
				>
					<div class="lesson-position">
						<span
							>Lesson {selectedIndex + 1}<span class="muted"> / {data.lessons.length}</span></span
						>
						<span class:has-selection={Boolean(selectedText)} class="selection-status">
							{selectedText
								? `${selectedAnchors.length} ${selectedAnchors.length === 1 ? 'sentence' : 'sentences'} selected`
								: 'Select a sentence to explore'}
						</span>
					</div>
					<div class="study-tools">
						<Button
							type="button"
							size="sm"
							variant="secondary"
							aria-controls="study-panel"
							aria-expanded={studyPanelOpen && studyMode === 'explain'}
							onclick={() => openStudyPanel('explain')}
							><Sparkles data-icon="inline-start" /> Explain</Button
						>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							aria-controls="study-panel"
							aria-expanded={studyPanelOpen && studyMode === 'notes'}
							onclick={() => openStudyPanel('notes')}
						>
							<StickyNote data-icon="inline-start" /> Notes
							{#if selectedLessonNotes.length}<span class="tool-count"
									>{selectedLessonNotes.length}</span
								>{/if}
						</Button>
					</div>
				</div>

				<div bind:this={lessonContent} class="lesson-content" tabindex="-1">
					{#key selected.id}
						<LessonEditor
							initialDocument={selected.document}
							{templates}
							mediaResources={data.resources}
							languageRuntime={readerLanguageRuntime}
							initialMode="preview"
							editable={false}
							chrome={false}
						/>
					{/key}
				</div>

				<footer class="lesson-footer">
					<Button
						type="button"
						variant="ghost"
						disabled={selectedIndex === 0}
						onclick={() => moveLesson(-1)}
					>
						<ArrowLeft data-icon="inline-start" /> Previous
					</Button>
					<span class="footer-progress">{selectedIndex + 1} of {data.lessons.length}</span>
					{#if selectedIndex < data.lessons.length - 1}
						<Button type="button" onclick={() => moveLesson(1)}
							>Next lesson <ArrowRight data-icon="inline-end" /></Button
						>
					{:else}
						<span class="last-lesson"><Check size={15} /> Last lesson</span>
					{/if}
				</footer>
			</section>
		</div>
	{:else}
		<section class="empty-course">
			<BookOpenCheck size={28} />
			<h2>Your course is being prepared</h2>
			<p>Lessons will appear here when they are ready.</p>
		</section>
	{/if}

	{#if activeNotes.length && stackAnchors.length && !studyPanelOpen}
		<SentenceNoteStack
			notes={activeNotes}
			position={noteStackPosition}
			onHighlight={highlightNote}
			onActivate={activateNote}
		/>
	{/if}

	{#if studyPanelOpen && selected}
		<aside
			id="study-panel"
			class="study-drawer"
			data-reading-overlay="mobile-bottom"
			bind:this={studyPanel}
			tabindex="-1"
			aria-labelledby="study-drawer-title"
		>
			<header class="study-drawer-header">
				<div>
					<h2 id="study-drawer-title">{studyMode === 'explain' ? 'AI help' : 'Notes'}</h2>
					<p lang={selected.document.language} dir={selected.document.direction}>
						{selected.title}
					</p>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Close study panel"
					onclick={closeStudyPanel}><X /></Button
				>
			</header>

			<div class="study-views" role="group" aria-label="Study panel views">
				<button
					type="button"
					class:active={studyMode === 'explain'}
					aria-pressed={studyMode === 'explain'}
					onclick={() => openStudyPanel('explain')}
				>
					<Sparkles size={15} aria-hidden="true" /><span>Explain</span>
				</button>
				<button
					type="button"
					class:active={studyMode === 'notes'}
					aria-pressed={studyMode === 'notes'}
					onclick={() => openStudyPanel('notes')}
				>
					<StickyNote size={15} aria-hidden="true" /><span>Notes</span>
					{#if selectedLessonNotes.length}<span class="count">{selectedLessonNotes.length}</span
						>{/if}
				</button>
			</div>

			<div class="study-panel-body" bind:this={studyPanelBody}>
				{#if selectedText}
					<details class="selected-passage">
						<summary>
							<Quote size={15} aria-hidden="true" />
							<span>{excerpt(selectedText)}</span>
							<ChevronDown size={14} class="disclosure-arrow" aria-hidden="true" />
						</summary>
						<blockquote dir="auto">{selectedText}</blockquote>
						<button class="text-button" type="button" onclick={clearSelectedText}
							>Clear selection</button
						>
					</details>
				{:else}
					<div class="selection-prompt">
						<Quote size={20} aria-hidden="true" />
						<strong>Select a sentence to get started</strong>
						<p>
							Click a sentence or highlight a range. Selection automatically snaps to complete
							sentences.
						</p>
					</div>
				{/if}

				{#if noteMessage}<p class="study-message" role="status">{noteMessage}</p>{/if}

				{#if studyMode === 'explain'}
					<section class="explanation-workspace" aria-label="Temporary AI explanation">
						<div class="explain-actions" role="group" aria-label="Choose an explanation">
							{#each explainActions as action (action.id)}
								<button
									type="button"
									disabled={!selectedText || aiBusy}
									onclick={() => void runExplainAction(action.id)}
								>
									<span class="action-icon"><action.icon size={18} aria-hidden="true" /></span>
									<span class="action-copy"
										><strong>{action.label}</strong><small>{action.description}</small></span
									>
									<ChevronRight size={15} class="action-arrow" aria-hidden="true" />
								</button>
							{/each}
						</div>
						<div class="response-area" aria-live="polite" aria-busy={aiBusy}>
							{#if aiBusy}
								<div class="explanation-loading">
									<LoaderCircle size={17} class="loading-spinner" aria-hidden="true" /><span
										>Preparing your response…</span
									>
								</div>
							{:else if aiAnswer}
								<article class="ai-answer">
									<p class="answer-label"><Sparkles size={14} />{selectedExplainAction().label}</p>
									<div dir="auto"><Markdown content={aiAnswer} /></div>
									<div class="answer-actions">
										<Button
											type="button"
											size="sm"
											disabled={aiSaving}
											onclick={() => void saveAiAnswer()}
										>
											<Save data-icon="inline-start" />
											{aiSaving ? 'Saving…' : 'Save as note'}
										</Button>
										<span>Temporary until you save it.</span>
									</div>
								</article>
							{/if}
							{#if explainError}<p class="workspace-error" role="alert">{explainError}</p>{/if}
						</div>
					</section>
				{:else}
					<section class="note-workspace" aria-label="Course notes">
						{#if selectedAnchors.length}
							<form
								onsubmit={(event) => {
									event.preventDefault();
									void saveManualNote();
								}}
							>
								<label for="course-note-body">Add a note</label>
								<textarea
									id="course-note-body"
									bind:value={noteBody}
									maxlength="20000"
									placeholder="Write a note about the selected sentence…"
									dir="auto"></textarea>
								<div class="note-submit-row">
									<Button type="submit" disabled={noteBusy || !noteBody.trim()}
										><StickyNote data-icon="inline-start" />{noteBusy
											? 'Saving…'
											: 'Save note'}</Button
									>
								</div>
							</form>
						{/if}

						<header class="workspace-heading">
							<div>
								<h3>Saved notes</h3>
								<p>
									{selectedAnchors.length
										? 'Notes related to the selection are highlighted.'
										: 'Translations and notes live together here.'}
								</p>
							</div>
							<span class="count">{selectedLessonNotes.length}</span>
						</header>
						<div class="note-list">
							{#each selectedLessonNotes as note (note.id)}
								<div class="note-row">
									<button
										type="button"
										class="note-card"
										class:selection-related={selectedAnchorNoteIds.has(note.id)}
										disabled={!note.anchors.length}
										aria-label={`Show source for ${note.kind === 'translation' ? 'translation' : 'note'}${selectedAnchorNoteIds.has(note.id) ? ', related to the current selection' : ''}`}
										onclick={() => activateNote(note)}
										onmouseenter={() => highlightNote(note)}
										onmouseleave={() => highlightNote(null)}
										onfocus={() => highlightNote(note)}
										onblur={() => highlightNote(null)}
									>
										<header>
											<span class:translation={note.kind === 'translation'} class="note-type">
												{#if note.kind === 'translation'}<Languages size={13} /> Translation {note.language?.toUpperCase() ??
														''}{:else}<StickyNote size={13} /> Note{/if}
											</span>
											<span class="note-access">
												{#if note.visibility === 'private'}<LockKeyhole size={11} /> Private{:else}<Users
														size={11}
													/>
													{note.authorName}{/if}
											</span>
										</header>
										<span class="note-card-body" dir="auto">{note.body}</span>
										{#if selectedAnchorNoteIds.has(note.id)}
											<span class="selection-match">Related to selection</span>
										{/if}
										<small>{formattedDate(note.updatedAt)} · {excerpt(note.anchorText, 80)}</small>
									</button>
									{#if note.authorId === viewerId}
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											disabled={Boolean(deletingNoteId)}
											aria-label="Delete note"
											onclick={() => void deleteNote(note)}><Trash2 /></Button
										>
									{/if}
								</div>
							{:else}
								<div class="workspace-empty">
									<StickyNote size={24} />
									<h3>No notes yet</h3>
									<p>Select a sentence to add one, or save an AI explanation.</p>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		</aside>
	{/if}
</div>

<style>
	:global(::highlight(course-note-hover)) {
		background: color-mix(in oklch, var(--reader-accent) 28%, #fde68a);
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--reader-accent);
		text-decoration-thickness: 2px;
	}
	.course-reader {
		--reader-accent: var(--course-accent, var(--primary));
		--reader-soft: color-mix(in oklch, var(--reader-accent) 9%, var(--card));
		container-type: inline-size;
		inline-size: 100%;
		max-inline-size: 88rem;
		margin-inline: auto;
		padding: clamp(0.75rem, 2vw, 2rem);
		padding-block-end: calc(clamp(0.75rem, 2vw, 2rem) + var(--reader-bottom-space, 0px));
		color: var(--foreground);
	}
	.course-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 2rem;
		margin-block-end: 1.4rem;
		padding-block-end: 1.35rem;
		border-block-end: 1px solid var(--border);
	}
	.course-copy {
		min-inline-size: 0;
	}
	.eyebrow {
		margin-block-end: 0.35rem;
		color: var(--reader-accent);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	h1 {
		font-size: clamp(1.75rem, 4cqi, 3rem);
		font-weight: 720;
		line-height: 1.08;
		letter-spacing: -0.035em;
		overflow-wrap: anywhere;
	}
	.course-description {
		max-inline-size: 52rem;
		margin-block-start: 0.65rem;
		color: var(--muted-foreground);
		font-size: 1rem;
		line-height: 1.65;
	}
	.course-meta {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.4rem;
		flex-shrink: 0;
		color: var(--muted-foreground);
		font-size: 0.82rem;
	}
	.reader-layout {
		display: grid;
		grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr);
		gap: clamp(1rem, 2.5vw, 2.5rem);
		align-items: start;
	}
	.course-map {
		position: sticky;
		inset-block-start: calc(var(--app-header-height, 4rem) + 1rem);
		max-block-size: calc(100dvh - var(--app-header-height, 4rem) - 2rem);
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.course-outline > summary,
	.frame-progress > summary {
		list-style: none;
		cursor: pointer;
	}
	.course-outline > summary::-webkit-details-marker,
	.frame-progress > summary::-webkit-details-marker {
		display: none;
	}
	.course-outline > summary {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-block-size: 2.75rem;
		padding: 0.55rem 0.5rem;
		font-size: 0.88rem;
		font-weight: 650;
	}
	.course-outline > summary > span {
		flex: 1;
	}
	:global(.disclosure-arrow) {
		transition: transform 150ms ease;
	}
	details[open] > summary > :global(.disclosure-arrow) {
		transform: rotate(180deg);
	}
	.course-map nav {
		display: grid;
		gap: 0.2rem;
	}
	.course-map nav button {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		inline-size: 100%;
		border: 0;
		border-radius: 0.5rem;
		padding: 0.65rem 0.55rem;
		background: transparent;
		color: var(--foreground);
		text-align: start;
		cursor: pointer;
	}
	.course-map nav button:hover {
		background: var(--muted);
	}
	.course-map nav button.active {
		background: var(--reader-soft);
	}
	.lesson-number {
		flex-shrink: 0;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
	.active .lesson-number {
		color: var(--reader-accent);
	}
	.lesson-copy {
		display: grid;
		gap: 0.15rem;
		min-inline-size: 0;
		flex: 1;
	}
	.lesson-copy strong {
		font-size: 0.88rem;
		font-weight: 620;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.lesson-copy small {
		color: var(--muted-foreground);
		font-size: 0.74rem;
	}
	.current-dot {
		inline-size: 0.35rem;
		block-size: 0.35rem;
		border-radius: 50%;
		background: var(--reader-accent);
	}
	.frame-progress {
		margin-block-start: 0.75rem;
		padding-block-start: 0.45rem;
		border-block-start: 1px solid var(--border);
	}
	.frame-progress > summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0.5rem;
		font-size: 0.82rem;
		font-weight: 600;
	}
	.frame-progress > summary > span:first-child {
		flex: 1;
	}
	.progress-count,
	.outline-hint {
		color: var(--muted-foreground);
		font-size: 0.73rem;
	}
	.outline-hint {
		padding: 0 0.5rem 0.35rem;
	}
	.frame-row {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.1rem;
	}
	.frame-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-inline-size: 0;
		flex: 1;
		border: 0;
		padding: 0.45rem 0.3rem;
		background: transparent;
		color: var(--foreground);
		font-size: 0.8rem;
		text-align: start;
		cursor: pointer;
	}
	.frame-link > span {
		color: var(--muted-foreground);
		font-size: 0.72rem;
	}
	.frame-check {
		display: grid;
		place-items: center;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		flex-shrink: 0;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--card);
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.frame-check :global(svg) {
		opacity: 0.25;
	}
	.frame-check.complete {
		border-color: var(--reader-accent);
		background: var(--reader-accent);
		color: var(--card);
	}
	.frame-check.complete :global(svg) {
		opacity: 1;
	}
	.sidebar-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-block-start: 1.25rem;
		padding-inline: 0.5rem;
		color: var(--muted-foreground);
		font-size: 0.78rem;
	}
	.lesson-stage {
		min-inline-size: 0;
	}
	.study-toolbar {
		position: sticky;
		z-index: 10;
		inset-block-start: var(--app-header-height, 4rem);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-block-size: 4rem;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 0.75rem 0.75rem 0 0;
		background: color-mix(in oklch, var(--card) 96%, transparent);
		backdrop-filter: blur(12px);
	}
	.lesson-position {
		display: grid;
		gap: 0.2rem;
		flex-shrink: 0;
		font-size: 0.875rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
	}
	.muted {
		color: var(--muted-foreground);
		font-weight: 400;
	}
	.selection-status {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		font-weight: 400;
	}
	.selection-status.has-selection {
		color: var(--reader-accent);
	}
	.study-tools {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}
	.study-tools :global([data-slot='button']) {
		min-block-size: 2.3rem;
	}
	.tool-count,
	.count {
		display: inline-grid;
		place-items: center;
		min-inline-size: 1.3rem;
		block-size: 1.3rem;
		padding-inline: 0.25rem;
		border-radius: 0.35rem;
		background: var(--muted);
		color: var(--muted-foreground);
		font-size: 0.7rem;
	}
	.lesson-content {
		scroll-margin-block-start: calc(
			var(--app-header-height, 4rem) + var(--study-toolbar-height) + 0.5rem
		);
		min-inline-size: 0;
		padding: clamp(0.65rem, 2vw, 1.75rem);
		border: 1px solid var(--border);
		border-block-start: 0;
		border-radius: 0 0 0.75rem 0.75rem;
		background: var(--card);
	}
	.lesson-content :global(.lesson-editor.reader) {
		background: transparent;
	}
	.lesson-content :global(.lesson-paper) {
		color: var(--foreground);
		font-family: var(
			--font-content,
			'Inter Variable',
			'Noto Sans Arabic Variable',
			system-ui,
			sans-serif
		);
	}
	.lesson-content :global(.document-heading h1) {
		font-size: clamp(1.75rem, 3cqi, 2.5rem);
		font-weight: 700;
		line-height: 1.3;
		letter-spacing: -0.025em;
	}
	.lesson-content :global(.subject-kicker) {
		font-size: 0.82rem;
	}
	.lesson-content :global(.rich-text-prosemirror) {
		text-align: start;
	}
	.lesson-content :global(.subject-kicker),
	.lesson-content :global(.document-description) {
		color: var(--muted-foreground);
	}
	.lesson-content :global(.document-description) {
		font-size: 1rem;
		line-height: 1.7;
	}
	.lesson-content :global(.passage-copy),
	.lesson-content :global(.course-rich-text) {
		font-size: clamp(1.1rem, 1.6cqi, 1.3rem);
		line-height: 1.82;
	}
	.lesson-content :global(.course-rich-text:dir(ltr) .rich-text-prosemirror > p:first-child) {
		display: flow-root;
	}
	.lesson-content
		:global(.course-rich-text:dir(ltr) .rich-text-prosemirror > p:first-child::first-letter),
	.lesson-content :global(.passage-copy:dir(ltr)::first-letter) {
		float: left;
		margin-block-start: 0.08em;
		margin-inline-end: 0.14em;
		color: var(--reader-accent);
		font-size: 3.15em;
		font-weight: 760;
		line-height: 0.78;
	}
	.lesson-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-block: 1.2rem;
	}
	.footer-progress,
	.last-lesson {
		color: var(--muted-foreground);
		font-size: 0.8rem;
	}
	.last-lesson {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.study-drawer {
		position: fixed;
		z-index: 65;
		inset-block: calc(var(--app-header-height, 4rem) + 0.75rem) 0.75rem;
		inset-inline-end: 0.75rem;
		inline-size: min(28rem, calc(100vw - 1.5rem));
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-radius: 0.9rem;
		background: var(--card);
		box-shadow: 0 16px 56px -16px #0005;
		overflow: hidden;
		outline: none;
	}
	.study-drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1rem 0.8rem;
	}
	.study-drawer-header > div {
		min-inline-size: 0;
	}
	.study-drawer-header h2 {
		font-size: 1.1rem;
		font-weight: 680;
		letter-spacing: -0.02em;
	}
	.study-drawer-header p {
		margin-block-start: 0.2rem;
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.8rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.study-views {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		padding-inline: 0.75rem;
		gap: 0.2rem;
		border-block-end: 1px solid var(--border);
	}
	.study-views button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-block-size: 2.7rem;
		border: 0;
		border-block-end: 2px solid transparent;
		padding: 0.5rem;
		background: transparent;
		color: var(--muted-foreground);
		font-size: 0.82rem;
		cursor: pointer;
	}
	.study-views button.active {
		border-block-end-color: var(--reader-accent);
		color: var(--reader-accent);
		font-weight: 620;
	}
	.study-panel-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-block-size: 0;
		padding: 1rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}
	.selected-passage {
		border: 1px solid var(--border);
		border-radius: 0.55rem;
		background: color-mix(in oklch, var(--muted) 35%, var(--card));
	}
	.selected-passage > summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.7rem;
	}
	.selected-passage > summary > span {
		min-inline-size: 0;
		flex: 1;
		overflow: hidden;
		font-size: 0.83rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.selected-passage blockquote {
		max-block-size: 10rem;
		margin: 0 0.7rem;
		overflow-y: auto;
		font-size: 0.88rem;
		line-height: 1.65;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.selected-passage > button {
		margin: 0.5rem 0.7rem 0.7rem;
	}
	.text-button {
		border: 0;
		background: transparent;
		color: var(--muted-foreground);
		font-size: 0.78rem;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.selection-prompt,
	.workspace-empty {
		display: grid;
		justify-items: center;
		gap: 0.6rem;
		padding: 1.4rem 0.7rem;
		text-align: center;
	}
	.selection-prompt :global(svg),
	.workspace-empty :global(svg) {
		color: var(--muted-foreground);
	}
	.selection-prompt strong,
	.workspace-empty h3 {
		font-size: 0.92rem;
		font-weight: 620;
	}
	.selection-prompt p,
	.workspace-empty p {
		color: var(--muted-foreground);
		font-size: 0.84rem;
		line-height: 1.6;
	}
	.explanation-workspace,
	.note-workspace {
		display: grid;
		gap: 1rem;
	}
	.explain-actions {
		display: grid;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		overflow: hidden;
	}
	.explain-actions button {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		inline-size: 100%;
		border: 0;
		border-block-end: 1px solid var(--border);
		padding: 0.85rem 0.75rem;
		background: transparent;
		color: var(--foreground);
		text-align: start;
		cursor: pointer;
	}
	.explain-actions button:last-child {
		border-block-end: 0;
	}
	.explain-actions button:hover:not(:disabled) {
		background: var(--reader-soft);
	}
	.explain-actions button:disabled {
		opacity: 0.48;
		cursor: default;
	}
	.action-icon {
		display: flex;
		flex-shrink: 0;
		color: var(--reader-accent);
	}
	.action-copy {
		display: grid;
		gap: 0.2rem;
		min-inline-size: 0;
		flex: 1;
	}
	.action-copy strong {
		font-size: 0.86rem;
		font-weight: 620;
	}
	.action-copy small {
		color: var(--muted-foreground);
		font-size: 0.76rem;
		line-height: 1.5;
	}
	.response-area:empty {
		display: none;
	}
	.explanation-loading {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.65rem 0;
		color: var(--muted-foreground);
		font-size: 0.86rem;
	}
	:global(.loading-spinner) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.ai-answer {
		display: grid;
		gap: 0.8rem;
		padding-block-start: 0.25rem;
	}
	.answer-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--reader-accent);
		font-size: 0.8rem;
		font-weight: 650;
	}
	.ai-answer :global(.chat-markdown) {
		font-size: 0.93rem;
		line-height: 1.75;
		overflow-wrap: anywhere;
	}
	.answer-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		padding-block-start: 0.2rem;
		border-block-start: 1px solid var(--border);
	}
	.answer-actions > span {
		color: var(--muted-foreground);
		font-size: 0.72rem;
	}
	form {
		display: grid;
		gap: 0.55rem;
	}
	form > label {
		font-size: 0.86rem;
		font-weight: 620;
	}
	textarea {
		inline-size: 100%;
		min-block-size: 6rem;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.7rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		font-size: 0.88rem;
		line-height: 1.6;
		resize: vertical;
	}
	textarea:focus {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.note-submit-row {
		display: flex;
		align-items: end;
		justify-content: flex-end;
		gap: 0.7rem;
	}
	.study-message,
	.workspace-error {
		border-radius: 0.5rem;
		padding: 0.7rem;
		font-size: 0.84rem;
		line-height: 1.5;
	}
	.study-message {
		background: var(--reader-soft);
	}
	.workspace-error {
		background: color-mix(in oklch, var(--destructive) 8%, var(--card));
		color: var(--destructive);
	}
	.workspace-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
	}
	.workspace-heading h3 {
		font-size: 0.92rem;
		font-weight: 650;
	}
	.workspace-heading p {
		margin-block-start: 0.2rem;
		color: var(--muted-foreground);
		font-size: 0.78rem;
	}
	.note-list {
		display: grid;
		gap: 0.55rem;
	}
	.note-row {
		display: flex;
		align-items: flex-start;
		gap: 0.25rem;
	}
	.note-card {
		display: grid;
		gap: 0.55rem;
		inline-size: 100%;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.75rem;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		text-align: start;
		outline: none;
		flex: 1;
	}
	.note-card:hover,
	.note-card:focus-visible {
		border-color: var(--reader-accent);
	}
	.note-card.selection-related {
		border-color: color-mix(in oklch, var(--reader-accent) 58%, var(--border));
		background: color-mix(in oklch, var(--reader-accent) 9%, var(--card));
		box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--reader-accent) 15%, transparent);
	}
	.note-card.selection-related:hover,
	.note-card.selection-related:focus-visible {
		border-color: var(--reader-accent);
	}
	.note-card:disabled {
		cursor: default;
		opacity: 1;
	}
	.note-card > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.55rem;
	}
	.note-type,
	.note-access {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.72rem;
		font-weight: 620;
	}
	.note-type {
		color: var(--reader-accent);
	}
	.note-type.translation {
		color: color-mix(in oklch, var(--reader-accent) 70%, #166534);
	}
	.note-access,
	.note-list small {
		color: var(--muted-foreground);
	}
	.note-card-body {
		display: block;
		font-size: 0.9rem;
		line-height: 1.62;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.selection-match {
		justify-self: start;
		border-radius: 999rem;
		padding: 0.16rem 0.42rem;
		background: color-mix(in oklch, var(--reader-accent) 16%, transparent);
		color: var(--reader-accent);
		font-size: 0.66rem;
		font-weight: 680;
	}
	.note-list small {
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.empty-course {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 0.75rem;
		min-block-size: 20rem;
		color: var(--muted-foreground);
		text-align: center;
	}
	.empty-course h2 {
		color: var(--foreground);
		font-size: 1.2rem;
	}

	@container (max-width: 56rem) {
		.reader-layout {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.85rem;
		}
		.course-map {
			position: static;
			max-block-size: none;
			overflow: visible;
		}
		.course-outline {
			border: 1px solid var(--border);
			border-radius: 0.65rem;
			background: var(--card);
		}
		.course-map nav {
			max-block-size: 18rem;
			padding: 0 0.5rem;
			overflow-y: auto;
		}
		.frame-progress {
			margin-inline: 0.5rem;
			margin-block-end: 0.5rem;
		}
		.sidebar-note {
			display: none;
		}
		.course-heading {
			margin-block-end: 1rem;
			padding-block-end: 1rem;
		}
	}
	@container (max-width: 38rem) {
		.course-reader {
			padding: 0.55rem;
			padding-block-end: calc(0.55rem + var(--reader-bottom-space, 0px));
		}
		.course-heading {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.65rem;
		}
		.course-meta {
			inline-size: 100%;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			font-size: 0.76rem;
		}
		h1 {
			font-size: 1.35rem;
		}
		.course-description {
			font-size: 0.84rem;
			line-height: 1.55;
		}
		.study-toolbar {
			flex-wrap: wrap;
			gap: 0.55rem;
			padding: 0.65rem;
		}
		.lesson-position {
			display: flex;
			align-items: center;
			justify-content: space-between;
			inline-size: 100%;
		}
		.study-tools {
			inline-size: 100%;
		}
		.study-tools :global([data-slot='button']) {
			flex: 1;
			min-inline-size: 0;
			min-block-size: 2.75rem;
		}
		.lesson-content {
			padding: 0.45rem;
		}
		.lesson-content :global(.document-heading h1) {
			font-size: clamp(1.45rem, 7.5cqi, 1.7rem);
			line-height: 1.32;
		}
		.lesson-content :global(.document-description) {
			font-size: 0.92rem;
			line-height: 1.6;
		}
		.lesson-content :global(.passage-copy),
		.lesson-content :global(.course-rich-text) {
			font-size: 1.05rem;
			line-height: 1.76;
		}
		.lesson-content
			:global(.course-rich-text:dir(ltr) .rich-text-prosemirror > p:first-child::first-letter),
		.lesson-content :global(.passage-copy:dir(ltr)::first-letter) {
			font-size: 2.8em;
		}
		.footer-progress {
			display: none;
		}
		.study-drawer {
			inset-block-start: auto;
			inset-block-end: calc(
				var(--reader-visual-bottom, 0px) +
					max(
						var(--reader-player-clearance, 0px),
						calc(var(--app-bottom-inset, 0px) + 0.5rem),
						env(safe-area-inset-bottom)
					)
			);
			inset-inline: 0.5rem;
			inline-size: auto;
			block-size: min(65dvh, 36rem);
			max-block-size: calc(
				var(--reader-visual-height, 100dvh) - var(--reader-player-clearance, 0px) -
					var(--app-header-height, 4rem) - 1.5rem
			);
		}
		.study-panel-body {
			padding: 0.8rem;
		}
		.note-submit-row,
		.answer-actions {
			align-items: stretch;
			flex-direction: column;
		}
	}
	@media (max-width: 38rem) and (max-height: 30rem) {
		.study-toolbar {
			flex-wrap: nowrap;
			min-block-size: 3.5rem;
			gap: 0.5rem;
			padding: 0.4rem;
		}
		.lesson-position {
			inline-size: auto;
		}
		.selection-status {
			display: none;
		}
		.study-tools {
			inline-size: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.disclosure-arrow) {
			transition: none;
		}
		:global(.loading-spinner) {
			animation: none;
		}
	}
	@media print {
		.course-map,
		.study-toolbar,
		.lesson-footer,
		.study-drawer,
		.course-meta {
			display: none !important;
		}
		.course-reader,
		.reader-layout {
			display: block;
			inline-size: 100%;
		}
		.course-heading {
			padding: 0 0 1rem;
		}
		.lesson-content {
			border: 0;
			padding: 0;
			background: white;
		}
	}
</style>
