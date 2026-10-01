<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		ArrowLeft,
		Check,
		ChevronLeft,
		ChevronRight,
		CircleAlert,
		Languages,
		LoaderCircle,
		Pause,
		RotateCcw,
		Save,
		Search,
		Sparkles,
		X
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { nativeLanguages } from '$lib/domain/native-languages';
	import {
		chunkCourseSentences,
		courseSentenceAnchor,
		lessonCourseSentences,
		type CourseNote,
		type CourseSentence
	} from './course-notes';
	import type { CourseLessonRecord } from './model';

	type SentenceFilter = 'all' | 'untranslated' | 'translated' | 'draft' | 'selected' | 'failed';
	type Drafts = Record<string, Record<string, string>>;
	type Props = {
		courseId: string;
		lesson: CourseLessonRecord;
		notes?: CourseNote[];
		nativeLanguage?: string;
		drafts?: Drafts;
		onDraftsChange?: (drafts: Drafts) => void;
		onBusyChange?: (busy: boolean) => void;
		onNotesChange?: (notes: CourseNote[]) => void;
		onBeforeSave?: () => Promise<boolean | void>;
		onClose?: () => void;
	};

	let {
		courseId,
		lesson,
		notes = [],
		nativeLanguage,
		drafts = {},
		onDraftsChange = () => undefined,
		onBusyChange = () => undefined,
		onNotesChange = () => undefined,
		onBeforeSave = async () => true,
		onClose
	}: Props = $props();

	const sentences = $derived(lessonCourseSentences(lesson.document));
	let manualDrafts = $state<Drafts>(untrack(() => drafts));
	let returnedNotes = $state<CourseNote[]>([]);
	let targetLanguage = $state(
		untrack(
			() =>
				notes.find(
					(note) =>
						note.lessonId === lesson.id &&
						note.kind === 'translation' &&
						note.visibility === 'course' &&
						note.language
				)?.language ??
				(nativeLanguages.some(({ code }) => code === nativeLanguage) ? nativeLanguage! : '')
		)
	);
	let selectedSentenceIds = $state<string[]>([]);
	let sentenceSearch = $state('');
	let sentenceFilter = $state<SentenceFilter>('all');
	let sentencePage = $state(1);
	let pageSize = $state(20);
	let busy = $state(false);
	let operation = $state<'manual' | 'ai'>('manual');
	let pauseRequested = $state(false);
	let resumeIds = $state<string[]>([]);
	let activeIds = $state<string[]>([]);
	let failures = $state<Record<string, string>>({});
	let progressDone = $state(0);
	let progressTotal = $state(0);
	let savedCount = $state(0);
	let statusMessage = $state<string | null>(null);
	let statusError = $state(false);
	let sentenceList = $state<HTMLDivElement>();
	let languageOverview = $state<HTMLDivElement>();
	let disposed = false;

	$effect(() => {
		if (!targetLanguage || !languageOverview) return;
		const selectedCard = languageOverview.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
		if (!selectedCard) return;
		const cardBounds = selectedCard.getBoundingClientRect();
		const overviewBounds = languageOverview.getBoundingClientRect();
		if (cardBounds.left < overviewBounds.left) {
			languageOverview.scrollBy({ left: cardBounds.left - overviewBounds.left });
		} else if (cardBounds.right > overviewBounds.right) {
			languageOverview.scrollBy({ left: cardBounds.right - overviewBounds.right });
		}
	});

	const sentenceIds = $derived(new Set(sentences.map(({ id }) => id)));
	const sentenceNumbers = $derived(new Map(sentences.map(({ id }, index) => [id, index + 1])));
	const selectedIds = $derived(new Set(selectedSentenceIds));
	const activeIdSet = $derived(new Set(activeIds));
	const selectedSentences = $derived(sentences.filter(({ id }) => selectedIds.has(id)));
	const translationsByLanguage = $derived.by(() => {
		const byLanguage = new SvelteMap<string, Map<string, CourseNote>>();
		const merged = new SvelteMap(notes.map((note) => [note.id, note]));
		for (const note of returnedNotes) merged.set(note.id, note);
		for (const note of [...merged.values()].toSorted((a, b) =>
			b.updatedAt.localeCompare(a.updatedAt)
		)) {
			if (
				note.lessonId !== lesson.id ||
				note.kind !== 'translation' ||
				note.visibility !== 'course' ||
				!note.language
			)
				continue;
			for (const anchor of note.anchors) {
				if (!sentenceIds.has(anchor.key)) continue;
				const languageNotes = byLanguage.get(note.language) ?? new SvelteMap<string, CourseNote>();
				if (!languageNotes.has(anchor.key)) languageNotes.set(anchor.key, note);
				byLanguage.set(note.language, languageNotes);
			}
		}
		return byLanguage;
	});
	const translations = $derived(
		translationsByLanguage.get(targetLanguage) ?? new Map<string, CourseNote>()
	);
	const currentDrafts = $derived(manualDrafts[targetLanguage] ?? {});
	const dirtySentences = $derived(sentences.filter(({ id }) => Object.hasOwn(currentDrafts, id)));
	const savableSentences = $derived(dirtySentences.filter(({ id }) => currentDrafts[id].trim()));
	const failedSentences = $derived(sentences.filter(({ id }) => failures[id]));
	const remainingCount = $derived(sentences.length - translations.size);
	const languageStats = $derived.by(() => {
		const codes = new SvelteSet([...translationsByLanguage.keys(), ...Object.keys(manualDrafts)]);
		if (targetLanguage) codes.add(targetLanguage);
		return [...codes]
			.map((code) => ({
				code,
				label: languageLabel(code),
				saved: translationsByLanguage.get(code)?.size ?? 0,
				drafts: Object.keys(manualDrafts[code] ?? {}).filter((id) => sentenceIds.has(id)).length
			}))
			.filter((language) => language.saved || language.drafts || language.code === targetLanguage)
			.toSorted((a, b) => a.label.localeCompare(b.label));
	});
	const filteredSentences = $derived.by(() => {
		const query = sentenceSearch.trim().toLocaleLowerCase();
		return sentences.filter((sentence) => {
			if (
				query &&
				![
					sentence.text,
					translations.get(sentence.id)?.body ?? '',
					currentDrafts[sentence.id] ?? ''
				].some((text) => text.toLocaleLowerCase().includes(query))
			)
				return false;
			switch (sentenceFilter) {
				case 'untranslated':
					return !translations.has(sentence.id);
				case 'translated':
					return translations.has(sentence.id);
				case 'draft':
					return Object.hasOwn(currentDrafts, sentence.id);
				case 'selected':
					return selectedIds.has(sentence.id);
				case 'failed':
					return Boolean(failures[sentence.id]);
				default:
					return true;
			}
		});
	});
	const pageCount = $derived(Math.max(1, Math.ceil(filteredSentences.length / pageSize)));
	const activePage = $derived(Math.min(sentencePage, pageCount));
	const pagedSentences = $derived(
		filteredSentences.slice((activePage - 1) * pageSize, activePage * pageSize)
	);
	const selectedOnPage = $derived(pagedSentences.filter(({ id }) => selectedIds.has(id)).length);
	const allPageSelected = $derived(
		pagedSentences.length > 0 && selectedOnPage === pagedSentences.length
	);
	const allResultsSelected = $derived(
		filteredSentences.length > 0 && filteredSentences.every(({ id }) => selectedIds.has(id))
	);
	const hiddenSelectedCount = $derived(
		selectedSentences.filter(({ id }) => !pagedSentences.some((sentence) => sentence.id === id))
			.length
	);
	const aiScope = $derived(selectedSentences.length ? selectedSentences : filteredSentences);
	const aiCandidates = $derived(aiScope.filter(canGenerate));
	const retryCandidates = $derived(failedSentences.filter(canGenerate));
	const resumeCandidates = $derived(
		sentences.filter(({ id }) => resumeIds.includes(id)).filter(canGenerate)
	);
	const filters = $derived([
		{ key: 'all', label: 'All', count: sentences.length },
		{ key: 'untranslated', label: 'Missing', count: remainingCount },
		{ key: 'translated', label: 'Translated', count: translations.size },
		{ key: 'draft', label: 'Unsaved', count: dirtySentences.length },
		{ key: 'selected', label: 'Selected', count: selectedSentences.length },
		...(failedSentences.length
			? [{ key: 'failed' as const, label: 'Failed', count: failedSentences.length }]
			: [])
	] satisfies { key: SentenceFilter; label: string; count: number }[]);

	function languageLabel(code: string): string {
		return nativeLanguages.find((language) => language.code === code)?.label ?? code.toUpperCase();
	}

	function translationDraft(sentence: CourseSentence): string {
		return currentDrafts[sentence.id] ?? translations.get(sentence.id)?.body ?? '';
	}

	function canGenerate(sentence: CourseSentence): boolean {
		return !translations.has(sentence.id) && !Object.hasOwn(currentDrafts, sentence.id);
	}

	function updateDraft(sentenceId: string, value: string) {
		const next = { ...currentDrafts };
		if (value.trim() === (translations.get(sentenceId)?.body ?? '').trim()) delete next[sentenceId];
		else next[sentenceId] = value;
		setLanguageDrafts(next);
		if (failures[sentenceId]) {
			const nextFailures = { ...failures };
			delete nextFailures[sentenceId];
			failures = nextFailures;
		}
		statusMessage = null;
	}

	function setLanguageDrafts(next: Record<string, string>) {
		const all = { ...manualDrafts };
		if (Object.keys(next).length) all[targetLanguage] = next;
		else delete all[targetLanguage];
		manualDrafts = all;
		onDraftsChange(all);
	}

	function resetDraft(sentence: CourseSentence) {
		updateDraft(sentence.id, translations.get(sentence.id)?.body ?? '');
	}

	function changeLanguage(value: string) {
		if (busy || value === targetLanguage) return;
		targetLanguage = value;
		selectedSentenceIds = [];
		failures = {};
		resumeIds = [];
		statusMessage = null;
		progressTotal = 0;
		if (sentenceFilter === 'failed' || sentenceFilter === 'selected') sentenceFilter = 'all';
		goToPage(1);
	}

	function changeFilter(value: SentenceFilter) {
		sentenceFilter = value;
		goToPage(1);
	}

	function goToPage(page: number) {
		sentencePage = page;
		sentenceList?.scrollTo({ top: 0 });
	}

	function toggleSentence(id: string, checked: boolean) {
		selectedSentenceIds = checked
			? [...new Set([...selectedSentenceIds, id])]
			: selectedSentenceIds.filter((candidate) => candidate !== id);
	}

	function togglePage(checked: boolean) {
		const pageIds = new Set(pagedSentences.map(({ id }) => id));
		selectedSentenceIds = checked
			? [...new Set([...selectedSentenceIds, ...pageIds])]
			: selectedSentenceIds.filter((id) => !pageIds.has(id));
	}

	function selectResults() {
		selectedSentenceIds = [
			...new Set([...selectedSentenceIds, ...filteredSentences.map(({ id }) => id)])
		];
	}

	function responseError(body: unknown, fallback: string): string {
		return body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
			? body.error
			: fallback;
	}

	function notesFromResponse(body: unknown): CourseNote[] {
		if (!body || typeof body !== 'object') return [];
		if ('notes' in body && Array.isArray(body.notes)) return body.notes as CourseNote[];
		if ('note' in body && body.note && typeof body.note === 'object')
			return [body.note as CourseNote];
		if ('id' in body && 'kind' in body && 'anchors' in body) return [body as CourseNote];
		return [];
	}

	function applyReturnedNotes(incoming: CourseNote[]) {
		const merged = new SvelteMap(returnedNotes.map((note) => [note.id, note]));
		for (const note of incoming) merged.set(note.id, note);
		returnedNotes = [...merged.values()];
		onNotesChange(incoming);
	}

	function aiBatches(items: readonly CourseSentence[]): CourseSentence[][] {
		const byLanguage = new SvelteMap<string, CourseSentence[]>();
		for (const sentence of items) {
			const group = byLanguage.get(sentence.language) ?? [];
			group.push(sentence);
			byLanguage.set(sentence.language, group);
		}
		return [...byLanguage.values()]
			.flatMap((items) => chunkCourseSentences(items, 5))
			.flatMap((group) => {
				const batches: CourseSentence[][] = [];
				let batch: CourseSentence[] = [];
				let characters = 0;
				for (const sentence of group) {
					if (batch.length && characters + sentence.text.length > 10_000) {
						batches.push(batch);
						batch = [];
						characters = 0;
					}
					batch.push(sentence);
					characters += sentence.text.length;
				}
				if (batch.length) batches.push(batch);
				return batches;
			});
	}

	async function beginRequest(total: number, nextOperation: 'manual' | 'ai'): Promise<boolean> {
		busy = true;
		onBusyChange(true);
		operation = nextOperation;
		progressDone = 0;
		progressTotal = total;
		savedCount = 0;
		pauseRequested = false;
		statusMessage = null;
		statusError = false;
		try {
			if ((await onBeforeSave()) === false)
				throw new Error('Save the lesson before translating it.');
			return !disposed;
		} catch (error) {
			statusError = true;
			statusMessage = error instanceof Error ? error.message : 'The lesson could not be saved.';
			return false;
		}
	}

	function finishRequest() {
		busy = false;
		activeIds = [];
		onBusyChange(false);
	}

	async function saveManualTranslations() {
		if (busy || !targetLanguage || !savableSentences.length) return;
		const items = savableSentences.map((sentence) => ({
			sentence,
			body: translationDraft(sentence).trim()
		}));
		try {
			if (!(await beginRequest(items.length, 'manual'))) return;
			for (const { sentence, body: text } of items) {
				if (disposed) break;
				activeIds = [sentence.id];
				const response = await fetch('/api/courses/' + encodeURIComponent(courseId) + '/notes', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						lessonId: lesson.id,
						kind: 'translation',
						visibility: 'course',
						source: 'manual',
						anchors: [courseSentenceAnchor(sentence)],
						body: text,
						language: targetLanguage
					})
				});
				const body = (await response.json().catch(() => null)) as unknown;
				if (!response.ok) throw new Error(responseError(body, 'Translation could not be saved.'));
				const incoming = notesFromResponse(body);
				if (!incoming.some((note) => note.anchors.some((anchor) => anchor.key === sentence.id))) {
					throw new Error(
						'The saved translation could not be confirmed. Your draft has been kept; try saving again.'
					);
				}
				applyReturnedNotes(incoming);
				const next = { ...currentDrafts };
				delete next[sentence.id];
				setLanguageDrafts(next);
				progressDone += 1;
				savedCount += 1;
			}
			statusMessage = savedCount + ' translation' + (savedCount === 1 ? '' : 's') + ' saved.';
		} catch (error) {
			statusError = true;
			statusMessage =
				(error instanceof Error ? error.message : 'Translations could not be saved.') +
				' ' +
				savedCount +
				' saved. Remaining drafts are kept.';
		} finally {
			finishRequest();
		}
	}

	async function generateTranslations(items: readonly CourseSentence[] = aiCandidates) {
		if (busy || !targetLanguage) return;
		const queue = items.filter(canGenerate);
		if (!queue.length) return;
		const batches = aiBatches(queue);
		const nextFailures = { ...failures };
		for (const { id } of queue) delete nextFailures[id];
		failures = nextFailures;
		resumeIds = [...new Set([...resumeCandidates, ...queue].map(({ id }) => id))];
		try {
			if (!(await beginRequest(queue.length, 'ai'))) return;
			for (let index = 0; index < batches.length; index += 1) {
				if (disposed) break;
				if (pauseRequested) break;
				const batch = batches[index];
				activeIds = batch.map(({ id }) => id);
				const response = await fetch(
					'/api/courses/' + encodeURIComponent(courseId) + '/translations',
					{
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({
							lessonId: lesson.id,
							sourceLanguage: batch[0]?.language,
							targetLanguage,
							sentences: batch.map(({ id, text }) => ({ id, text }))
						})
					}
				);
				const body = (await response.json().catch(() => null)) as unknown;
				if (!response.ok)
					throw new Error(responseError(body, 'AI translation could not be completed.'));
				const incoming = notesFromResponse(body);
				applyReturnedNotes(incoming);
				const completed = new Set(incoming.flatMap((note) => note.anchors.map(({ key }) => key)));
				const errors =
					body && typeof body === 'object' && 'errors' in body && Array.isArray(body.errors)
						? (body.errors as { id: string; error: string }[])
						: [];
				const next = { ...failures };
				for (const sentence of batch) {
					if (completed.has(sentence.id)) savedCount += 1;
					else
						next[sentence.id] =
							errors.find(({ id }) => id === sentence.id)?.error ??
							'No translation returned. Try again.';
				}
				failures = next;
				resumeIds = resumeIds.filter((id) => !activeIds.includes(id));
				progressDone += batch.length;
			}
			const failed = queue.filter(({ id }) => failures[id]).length;
			statusError = failed > 0;
			statusMessage =
				(resumeIds.length ? 'Paused. ' : '') +
				savedCount +
				' translation' +
				(savedCount === 1 ? '' : 's') +
				' saved.' +
				(failed ? ' ' + failed + ' failed. You can retry them below.' : '') +
				(resumeIds.length ? ' ' + resumeIds.length + ' remaining.' : '');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'AI translation could not be completed.';
			const next = { ...failures };
			for (const id of activeIds) next[id] = message;
			failures = next;
			resumeIds = resumeIds.filter((id) => !activeIds.includes(id));
			statusError = true;
			statusMessage =
				message + ' ' + savedCount + ' translations saved; unfinished sentences can be retried.';
		} finally {
			finishRequest();
		}
	}

	function saveShortcut(event: KeyboardEvent) {
		if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
		event.preventDefault();
		event.stopPropagation();
		void saveManualTranslations();
	}

	onDestroy(() => {
		disposed = true;
	});
</script>

<section class="translation-manager" aria-label="Sentence translations">
	<header class="manager-header">
		<div class="manager-heading">
			{#if onClose}
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Back to lesson editor"
					disabled={busy}
					onclick={onClose}><ArrowLeft /></Button
				>
			{/if}
			<span class="heading-icon" aria-hidden="true"><Languages size={21} /></span>
			<div>
				<p class="eyebrow">Translations</p>
				<h2>{lesson.title}</h2>
				<p class="muted">
					{sentences.length} sentences · Edit translations alongside the original text.
				</p>
			</div>
		</div>
		<label class="language-picker">
			<span>Translation language</span>
			<select
				aria-label="Translation language"
				value={targetLanguage}
				disabled={busy}
				onchange={(event) => changeLanguage(event.currentTarget.value)}
			>
				<option value="" disabled>Choose a language</option>
				{#each nativeLanguages as language (language.code)}
					<option value={language.code}
						>{language.label}{translationsByLanguage.has(language.code)
							? ' · ' + translationsByLanguage.get(language.code)!.size + '/' + sentences.length
							: ''}</option
					>
				{/each}
			</select>
		</label>
	</header>

	{#if sentences.length}
		<div
			class="language-overview"
			bind:this={languageOverview}
			role="group"
			aria-label="Translation language coverage"
		>
			{#each languageStats as language (language.code)}
				<button
					type="button"
					class="language-card"
					class:active={language.code === targetLanguage}
					aria-pressed={language.code === targetLanguage}
					disabled={busy}
					onclick={() => changeLanguage(language.code)}
				>
					<span class="language-card-heading"
						><strong>{language.label}</strong>
						{#if language.saved === sentences.length}<Check size={14} />{:else}<span
								>{Math.round((language.saved / sentences.length) * 100)}%</span
							>{/if}
					</span>
					<span class="coverage-track" aria-hidden="true"
						><span style:width={(language.saved / sentences.length) * 100 + '%'}></span></span
					>
					<small
						>{language.saved} / {sentences.length} translated{language.drafts
							? ' · ' + language.drafts + ' unsaved'
							: ''}</small
					>
				</button>
			{:else}
				<p class="language-empty">
					<Languages size={18} />Choose a language above to start translating this lesson.
				</p>
			{/each}
		</div>

		{#if targetLanguage}
			<div class="translation-workspace">
				<div class="workspace-toolbar">
					<div class="filter-row">
						<label class="sentence-search">
							<Search size={16} aria-hidden="true" />
							<input
								aria-label="Search source text or translations"
								placeholder="Search source or translation…"
								value={sentenceSearch}
								oninput={(event) => {
									sentenceSearch = event.currentTarget.value;
									goToPage(1);
								}}
							/>
							{#if sentenceSearch}
								<button
									type="button"
									aria-label="Clear search"
									onclick={() => {
										sentenceSearch = '';
										goToPage(1);
									}}><X size={14} /></button
								>
							{/if}
						</label>
						<div class="status-filters" role="group" aria-label="Filter sentences">
							{#each filters as filter (filter.key)}
								<button
									type="button"
									class:active={sentenceFilter === filter.key}
									aria-pressed={sentenceFilter === filter.key}
									onclick={() => changeFilter(filter.key)}
									>{filter.label}<span>{filter.count}</span></button
								>
							{/each}
						</div>
					</div>
					<div class="action-row">
						<div class="action-context">
							<strong
								>{selectedSentences.length
									? selectedSentences.length + ' selected'
									: filteredSentences.length + ' sentences'}</strong
							>
							<span
								>{selectedSentences.length
									? (hiddenSelectedCount
											? hiddenSelectedCount + ' selected on other pages or hidden by filters. '
											: '') + 'AI applies to your selection.'
									: sentenceSearch || sentenceFilter !== 'all'
										? 'AI applies to these filtered results.'
										: 'AI applies to all missing translations.'}</span
							>
						</div>
						<div class="bulk-actions">
							{#if busy}
								<span class="working-label"
									><LoaderCircle size={15} class="spin" />{operation === 'ai'
										? 'Translating…'
										: 'Saving…'}</span
								>
								{#if operation === 'ai'}
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={pauseRequested}
										onclick={() => (pauseRequested = true)}
										><Pause size={14} />{pauseRequested ? 'Pausing…' : 'Pause'}</Button
									>
								{/if}
							{:else}
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={!aiCandidates.length}
									onclick={() => void generateTranslations()}
									><Sparkles size={14} />Translate missing{aiCandidates.length
										? ' (' + aiCandidates.length + ')'
										: ''}</Button
								>
								<Button
									type="button"
									size="sm"
									disabled={!savableSentences.length}
									onclick={saveManualTranslations}
									><Save size={14} />Save changes{savableSentences.length
										? ' (' + savableSentences.length + ')'
										: ''}</Button
								>
							{/if}
						</div>
					</div>
					<p class="action-hint">
						{#if busy}
							{pauseRequested
								? 'Finishing the current group before pausing. Completed translations are saved.'
								: operation === 'ai'
									? 'Translations are saved as they finish. You can pause at any time.'
									: 'Saving your changes…'}
						{:else if dirtySentences.length}
							Save changes saves all edited translations in {languageLabel(targetLanguage)}, across
							pages.
							{#if dirtySentences.length > savableSentences.length}
								Empty edits cannot be saved; add text or undo the edit.{/if}
						{:else}
							AI fills empty translations. Saved translations and unsaved edits are kept. Click any
							translation to edit it.
						{/if}
					</p>
					{#if progressTotal > 0 && busy}
						<div class="translation-progress" role="status">
							<span>{progressDone} of {progressTotal} processed · {savedCount} saved</span>
							<progress aria-label="Translation progress" max={progressTotal} value={progressDone}
							></progress>
						</div>
					{/if}
					{#if !busy && (statusMessage || resumeCandidates.length || retryCandidates.length)}
						<div
							class="request-status"
							class:error={statusError && Boolean(statusMessage)}
							role={statusError && statusMessage ? 'alert' : 'status'}
						>
							{#if statusError}<CircleAlert size={16} />{:else}<Check size={16} />{/if}
							<span
								>{statusMessage ?? 'Continue the unfinished translations when you are ready.'}</span
							>
							{#if !busy && resumeCandidates.length}
								<button type="button" onclick={() => void generateTranslations(resumeCandidates)}
									>Resume ({resumeCandidates.length})</button
								>
							{/if}
							{#if !busy && retryCandidates.length}
								<button type="button" onclick={() => void generateTranslations(retryCandidates)}
									>Retry failed ({retryCandidates.length})</button
								>
							{/if}
						</div>
					{/if}
				</div>

				<div class="selection-bar">
					<label
						><input
							type="checkbox"
							aria-label="Select this page"
							checked={allPageSelected}
							indeterminate={selectedOnPage > 0 && !allPageSelected}
							disabled={busy || !pagedSentences.length}
							onchange={(event) => togglePage(event.currentTarget.checked)}
						/>Select page</label
					>
					<button
						type="button"
						disabled={busy || allResultsSelected || !filteredSentences.length}
						onclick={selectResults}>Select all {filteredSentences.length} results</button
					>
					{#if selectedSentences.length}<button
							type="button"
							disabled={busy}
							onclick={() => (selectedSentenceIds = [])}>Clear selection</button
						>{/if}
					<span
						>{filteredSentences.length ? (activePage - 1) * pageSize + 1 : 0}–{Math.min(
							activePage * pageSize,
							filteredSentences.length
						)} of {filteredSentences.length}</span
					>
				</div>

				<div class="column-headings" aria-hidden="true">
					<span>Source text</span><span>{languageLabel(targetLanguage)} translation</span>
				</div>
				<!-- The scrollable sentence region needs keyboard focus for arrow-key scrolling. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					class="sentence-list"
					bind:this={sentenceList}
					role="region"
					aria-label="Translation sentences"
					tabindex="0"
				>
					{#each pagedSentences as sentence (sentence.id)}
						{@const saved = translations.get(sentence.id)}
						{@const dirty = Object.hasOwn(currentDrafts, sentence.id)}
						{@const working = activeIdSet.has(sentence.id)}
						<article
							class="sentence-row"
							class:selected={selectedIds.has(sentence.id)}
							class:dirty
							class:failed={Boolean(failures[sentence.id])}
							class:working
						>
							<div class="source-cell">
								<div class="sentence-meta">
									<label class="sentence-select">
										<input
											type="checkbox"
											aria-label={'Select sentence ' + sentenceNumbers.get(sentence.id)}
											checked={selectedIds.has(sentence.id)}
											disabled={busy}
											onchange={(event) => toggleSentence(sentence.id, event.currentTarget.checked)}
										/>
										<span class="sentence-number"
											>{String(sentenceNumbers.get(sentence.id)).padStart(2, '0')}</span
										>
									</label>
									<span>{languageLabel(sentence.language)}</span>
								</div>
								<p lang={sentence.language} dir={sentence.direction}>{sentence.text}</p>
							</div>
							<div class="translation-cell">
								<div class="translation-meta">
									{#if working}
										<span class="row-status"
											><LoaderCircle size={12} class="spin" />{operation === 'ai'
												? 'Translating'
												: 'Saving'}</span
										>
									{:else if dirty}
										<span class="row-status unsaved">Unsaved edit</span>
									{:else if failures[sentence.id]}
										<span class="row-status failed"><CircleAlert size={12} />Failed</span>
									{:else if saved}
										<span class="row-status saved"
											><Check size={12} />{saved.source === 'ai'
												? 'AI translated'
												: 'Translated'}</span
										>
									{:else}
										<span class="row-status">Missing translation</span>
									{/if}
									{#if dirty}
										<button
											type="button"
											class="undo-edit"
											disabled={busy}
											aria-label={'Undo edit for sentence ' + sentenceNumbers.get(sentence.id)}
											onclick={() => resetDraft(sentence)}><RotateCcw size={12} />Undo</button
										>
									{/if}
								</div>
								<textarea
									aria-label={languageLabel(targetLanguage) +
										' translation for sentence ' +
										sentenceNumbers.get(sentence.id)}
									lang={targetLanguage}
									dir="auto"
									value={translationDraft(sentence)}
									rows="2"
									maxlength="20000"
									onkeydown={saveShortcut}
									disabled={busy}
									placeholder={'Write a ' + languageLabel(targetLanguage) + ' translation…'}
									oninput={(event) => updateDraft(sentence.id, event.currentTarget.value)}
								></textarea>
								{#if failures[sentence.id]}<p class="row-error">{failures[sentence.id]}</p>{/if}
							</div>
						</article>
					{:else}
						<div class="empty-state filtered-empty">
							{#if sentenceFilter === 'untranslated' && !sentenceSearch && !remainingCount}
								<Check size={26} /><strong>All sentences translated</strong>
								<p>{languageLabel(targetLanguage)} is ready for this lesson.</p>
							{:else}
								<Search size={26} /><strong>No matching sentences</strong>
								<p>Try another search or show all sentences.</p>
							{/if}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={() => {
									sentenceSearch = '';
									changeFilter('all');
								}}>Show all sentences</Button
							>
						</div>
					{/each}
				</div>
				<footer class="pagination">
					<label
						>Rows per page <select
							value={pageSize}
							onchange={(event) => {
								pageSize = Number(event.currentTarget.value);
								goToPage(1);
							}}
						>
							<option value={20}>20</option><option value={40}>40</option><option value={80}
								>80</option
							>
						</select></label
					>
					<div class="page-controls">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={activePage === 1}
							aria-label="Previous sentence page"
							onclick={() => goToPage(activePage - 1)}><ChevronLeft /></Button
						>
						<label
							>Page <input
								aria-label="Sentence page"
								type="number"
								min="1"
								max={pageCount}
								value={activePage}
								onchange={(event) =>
									goToPage(
										Math.min(
											pageCount,
											Math.max(1, Math.floor(Number(event.currentTarget.value) || 1))
										)
									)}
							/>
							of {pageCount}</label
						>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							disabled={activePage === pageCount}
							aria-label="Next sentence page"
							onclick={() => goToPage(activePage + 1)}><ChevronRight /></Button
						>
					</div>
				</footer>
			</div>
		{/if}
	{:else}
		<div class="empty-state">
			<Languages size={28} /><strong>Nothing to translate yet</strong>
			<p>Add passage or rich text content to this lesson, then return here.</p>
		</div>
	{/if}
</section>

<style>
	.translation-manager {
		container-type: inline-size;
		min-inline-size: 0;
		border: 1px solid var(--border);
		border-radius: 1rem;
		background: var(--card);
		padding: clamp(0.75rem, 2cqi, 1.5rem);
		color: var(--foreground);
	}
	.manager-header,
	.manager-heading,
	.language-card-heading,
	.filter-row,
	.sentence-search,
	.status-filters,
	.action-row,
	.bulk-actions,
	.working-label,
	.request-status,
	.selection-bar,
	.sentence-meta,
	.sentence-select,
	.translation-meta,
	.row-status,
	.undo-edit,
	.pagination,
	.page-controls,
	.pagination label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.manager-header {
		justify-content: space-between;
		gap: 1.25rem;
		margin-block-end: 1.25rem;
	}
	.manager-heading {
		min-inline-size: 0;
		gap: 0.75rem;
	}
	.manager-heading > div {
		min-inline-size: 0;
	}
	h2,
	p {
		margin: 0;
	}
	h2 {
		font-size: clamp(1.05rem, 2.2cqi, 1.4rem);
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.eyebrow {
		color: var(--editor-selection);
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.muted {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.6;
	}
	.heading-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		inline-size: 2.8rem;
		block-size: 2.8rem;
		border-radius: 0.8rem;
		background: color-mix(in oklab, var(--editor-selection) 10%, transparent);
		color: var(--editor-selection);
	}
	.language-picker {
		display: grid;
		gap: 0.35rem;
		flex: 0 0 14rem;
		font-size: 0.72rem;
		font-weight: 650;
	}
	select,
	.pagination input {
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.5rem 0.65rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
	}
	.language-picker select {
		inline-size: 100%;
		min-inline-size: 0;
	}
	.language-overview {
		display: flex;
		gap: 0.65rem;
		overflow-x: auto;
		padding-block: 0.15rem 1rem;
		scrollbar-width: thin;
	}
	.language-card {
		display: grid;
		flex: 0 0 12rem;
		gap: 0.5rem;
		padding: 0.8rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: 0.7rem;
		background: var(--background);
		color: var(--foreground);
		text-align: start;
		font: inherit;
		cursor: pointer;
	}
	.language-card.active {
		border-color: var(--editor-selection);
		background: color-mix(in oklab, var(--editor-selection) 6%, var(--background));
		box-shadow: inset 0 0 0 1px var(--editor-selection);
	}
	.language-card-heading {
		justify-content: space-between;
		font-size: 0.8rem;
	}
	.language-card-heading > span {
		color: var(--muted-foreground);
		font-size: 0.7rem;
	}
	.language-card small {
		color: var(--muted-foreground);
		font-size: 0.65rem;
		font-variant-numeric: tabular-nums;
	}
	.coverage-track {
		block-size: 0.25rem;
		border-radius: 1rem;
		background: var(--muted);
		overflow: hidden;
	}
	.coverage-track > span {
		display: block;
		block-size: 100%;
		border-radius: inherit;
		background: var(--editor-selection);
	}
	.language-empty {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 2rem 1rem;
		color: var(--muted-foreground);
		font-size: 0.85rem;
	}
	.translation-workspace {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 0.8rem;
		background: var(--background);
	}
	.workspace-toolbar {
		display: grid;
		gap: 0.7rem;
		padding: 1rem;
	}
	.filter-row {
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.sentence-search {
		flex: 1 1 15rem;
		min-inline-size: 0;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.55rem 0.65rem;
		color: var(--muted-foreground);
	}
	.sentence-search input {
		inline-size: 100%;
		min-inline-size: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: 0.78rem;
	}
	.sentence-search button {
		display: grid;
		place-items: center;
		border: 0;
		background: none;
		color: var(--muted-foreground);
		cursor: pointer;
	}
	.status-filters {
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.status-filters button {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		border: 0;
		border-radius: 0.45rem;
		padding: 0.5rem;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.status-filters button.active {
		color: var(--editor-selection);
		background: color-mix(in oklab, var(--editor-selection) 10%, transparent);
		font-weight: 700;
	}
	.status-filters button span {
		font-size: 0.63rem;
		font-variant-numeric: tabular-nums;
	}
	.action-row {
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.action-context {
		display: grid;
		gap: 0.2rem;
		flex: 1 1 15rem;
	}
	.action-context strong {
		font-size: 0.82rem;
	}
	.action-context > span,
	.action-hint {
		color: var(--muted-foreground);
		font-size: 0.7rem;
		line-height: 1.5;
	}
	.bulk-actions {
		flex-wrap: wrap;
	}
	.working-label {
		color: var(--editor-selection);
		font-size: 0.78rem;
	}
	.translation-progress {
		display: grid;
		gap: 0.4rem;
		font-size: 0.72rem;
		color: var(--muted-foreground);
	}
	.translation-progress progress {
		inline-size: 100%;
		block-size: 0.4rem;
		accent-color: var(--editor-selection);
	}
	.request-status {
		flex-wrap: wrap;
		padding: 0.65rem;
		border-radius: 0.5rem;
		background: color-mix(in oklab, var(--editor-selection) 8%, transparent);
		font-size: 0.75rem;
		line-height: 1.5;
	}
	.request-status > span {
		flex: 1 1 14rem;
	}
	.request-status.error {
		background: color-mix(in oklab, var(--destructive) 7%, transparent);
		color: var(--destructive);
	}
	.request-status button {
		border: 1px solid currentColor;
		border-radius: 0.4rem;
		padding: 0.3rem 0.6rem;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.selection-bar {
		flex-wrap: wrap;
		padding: 0.65rem 1rem;
		border-block: 1px solid var(--border);
		background: color-mix(in oklab, var(--muted) 35%, transparent);
		font-size: 0.7rem;
		gap: 0.8rem;
	}
	.selection-bar label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}
	input[type='checkbox'] {
		inline-size: 1rem;
		block-size: 1rem;
		margin: 0;
		accent-color: var(--editor-selection);
		cursor: pointer;
	}
	.selection-bar button {
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--editor-selection);
		font: inherit;
		cursor: pointer;
	}
	.selection-bar > span {
		margin-inline-start: auto;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.column-headings,
	.sentence-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}
	.column-headings {
		padding: 0.7rem 1rem;
		gap: 2rem;
		color: var(--muted-foreground);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.025em;
		border-block-end: 1px solid var(--border);
	}
	.sentence-list {
		max-block-size: 65svh;
		min-block-size: 14rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		scrollbar-gutter: stable;
	}
	.sentence-row {
		border-block-end: 1px solid var(--border);
	}
	.sentence-row:last-child {
		border-block-end: 0;
	}
	.sentence-row.selected {
		background: color-mix(in oklab, var(--editor-selection) 5%, var(--background));
	}
	.sentence-row.working {
		background: color-mix(in oklab, var(--editor-selection) 9%, var(--background));
	}
	.source-cell,
	.translation-cell {
		min-inline-size: 0;
		padding: 0.85rem 1rem;
	}
	.translation-cell {
		border-inline-start: 1px solid color-mix(in oklab, var(--border) 65%, transparent);
	}
	.sentence-meta,
	.translation-meta {
		min-block-size: 1.3rem;
		margin-block-end: 0.5rem;
		justify-content: space-between;
		color: var(--muted-foreground);
		font-size: 0.65rem;
	}
	.sentence-select {
		cursor: pointer;
	}
	.sentence-number {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.source-cell p {
		font-size: 0.86rem;
		line-height: 1.7;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.row-status {
		gap: 0.3rem;
	}
	.row-status.saved {
		color: var(--studio-green, #52816c);
	}
	.row-status.unsaved {
		color: var(--editor-selection);
		font-weight: 650;
	}
	.row-status.failed,
	.row-error {
		color: var(--destructive);
	}
	.undo-edit {
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		cursor: pointer;
	}
	.translation-cell textarea {
		display: block;
		field-sizing: content;
		inline-size: 100%;
		min-block-size: 4rem;
		max-block-size: 20rem;
		min-inline-size: 0;
		resize: vertical;
		border: 1px solid transparent;
		border-radius: 0.5rem;
		padding: 0.45rem 0.55rem;
		background: color-mix(in oklab, var(--muted) 30%, transparent);
		color: var(--foreground);
		font: inherit;
		font-size: 0.86rem;
		line-height: 1.7;
	}
	.translation-cell textarea:hover {
		border-color: var(--border);
	}
	.translation-cell textarea::placeholder {
		color: var(--muted-foreground);
		opacity: 0.75;
		font-size: 0.78rem;
	}
	.dirty textarea {
		border-color: color-mix(in oklab, var(--editor-selection) 35%, var(--border));
	}
	.failed textarea {
		border-color: color-mix(in oklab, var(--destructive) 35%, var(--border));
	}
	.row-error {
		margin-block-start: 0.4rem;
		font-size: 0.7rem;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.pagination {
		justify-content: space-between;
		flex-wrap: wrap;
		padding: 0.6rem 1rem;
		border-block-start: 1px solid var(--border);
		color: var(--muted-foreground);
		font-size: 0.7rem;
	}
	.pagination select,
	.pagination input {
		padding: 0.3rem;
		font-size: 0.72rem;
	}
	.pagination input {
		inline-size: 3.4rem;
		text-align: center;
	}
	.empty-state {
		display: grid;
		gap: 0.65rem;
		justify-items: center;
		align-content: center;
		min-block-size: 20rem;
		padding: 2rem;
		text-align: center;
		color: var(--muted-foreground);
		font-size: 0.85rem;
	}
	.empty-state strong {
		color: var(--foreground);
	}
	.filtered-empty {
		min-block-size: 18rem;
	}
	button:disabled {
		cursor: default;
		opacity: 0.45;
	}
	select:focus-visible,
	button:focus-visible,
	textarea:focus,
	.sentence-list:focus-visible,
	.sentence-search:focus-within,
	.pagination input:focus {
		outline: 2px solid color-mix(in oklab, var(--editor-selection) 60%, transparent);
		outline-offset: 2px;
	}
	:global(.spin) {
		animation: spin 850ms linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@container (max-width: 42rem) {
		.manager-header {
			align-items: stretch;
			flex-direction: column;
			gap: 0.8rem;
		}
		.language-picker {
			flex: auto;
		}
		.column-headings {
			display: none;
		}
		.sentence-row {
			grid-template-columns: minmax(0, 1fr);
		}
		.source-cell {
			padding-block-end: 0.45rem;
		}
		.translation-cell {
			border-inline-start: 0;
			padding-block-start: 0.35rem;
		}
		.sentence-list {
			max-block-size: 60svh;
		}
		.bulk-actions {
			inline-size: 100%;
		}
		.bulk-actions :global(button) {
			flex: 1;
		}
		.language-card {
			flex-basis: 10rem;
		}
		.workspace-toolbar {
			padding: 0.75rem;
		}
		.selection-bar {
			gap: 0.65rem;
			padding-inline: 0.75rem;
		}
		.pagination {
			justify-content: center;
			gap: 0.6rem;
		}
		.heading-icon {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.spin) {
			animation: none;
		}
	}
</style>
