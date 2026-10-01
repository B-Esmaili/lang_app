<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, untrack } from 'svelte';
	import {
		AudioLines,
		BookOpenText,
		Check,
		ChevronLeft,
		CircleAlert,
		Cloud,
		CloudUpload,
		FileText,
		Image,
		LibraryBig,
		Languages,
		LoaderCircle,
		Pencil,
		Plus,
		Search,
		Trash2,
		Video,
		X
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		MediaPickerDialog,
		type MediaPickerFolder,
		type MediaPickerItem
	} from '$lib/components/media-picker';
	import {
		normalizeCourseMediaResourceName,
		type CourseMediaResource
	} from '$lib/domain/course-media-resource';
	import { LessonEditor, type LessonDocument } from '$lib/features/lesson-editor';
	import CourseTranslationManager from './CourseTranslationManager.svelte';
	import { lessonCourseSentences, type CourseNote } from './course-notes';
	import type { CourseBuilderData, CourseLessonRecord, CourseStatus, CourseSummary } from './model';

	let { initialData, nativeLanguage }: { initialData: CourseBuilderData; nativeLanguage?: string } =
		$props();
	const snapshot = untrack(() => structuredClone($state.snapshot(initialData)));
	let course = $state(snapshot.course);
	let lessons = $state<CourseLessonRecord[]>(snapshot.lessons);
	let resources = $state<CourseMediaResource[]>(snapshot.resources ?? []);
	let notes = $state<CourseNote[]>(snapshot.notes ?? []);
	let selectedLessonId = $state(snapshot.lessons[0]?.id ?? '');
	let sidebarTab = $state<'lessons' | 'resources'>('lessons');
	let translationWorkspaceOpen = $state(false);
	let translationBusy = $state(false);
	let translationDrafts = $state<Record<string, Record<string, Record<string, string>>>>({});
	const hasTranslationDrafts = $derived(
		lessons.some((lesson) => {
			const languages = translationDrafts[lesson.id];
			if (!languages) return false;
			const sentenceIds = new Set(lessonCourseSentences(lesson.document).map(({ id }) => id));
			return Object.values(languages).some((drafts) =>
				Object.keys(drafts).some((id) => sentenceIds.has(id))
			);
		})
	);
	let courseTitle = $state(snapshot.course.title);
	let saveState = $state<'saved' | 'pending' | 'saving' | 'error'>('saved');
	let saveMessage = $state<string | null>(null);
	let pendingSave = $state<{ lessonId: string; document: LessonDocument } | null>(null);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let saveInFlight: Promise<void> | null = null;
	let creatingLesson = $state(false);
	let updatingCourse = $state(false);
	let switchingLessonId = $state<string | null>(null);
	let lessonPendingDeletion = $state<CourseLessonRecord | null>(null);
	let deletingLesson = $state(false);
	let builderBarHeight = $state(0);
	let resourceMediaId = $state<string | null>(null);
	let resourceName = $state('');
	let resourceSearch = $state('');
	let mediaPickerOpen = $state(false);
	let resourceComposerOpen = $state(false);
	let resourceBusy = $state(false);
	let processingResourceId = $state<string | null>(null);
	let resourceMessage = $state<string | null>(null);

	const selectedLesson = $derived(lessons.find((lesson) => lesson.id === selectedLessonId));
	const selectedLessonNumber = $derived(
		Math.max(lessons.findIndex((lesson) => lesson.id === selectedLessonId) + 1, 1)
	);
	const templates = $derived(snapshot.templates.map((template) => template.definition));
	const availableMedia = $derived(snapshot.availableMedia ?? []);
	const mediaPickerItems = $derived<MediaPickerItem[]>(
		availableMedia.map((media) => ({
			id: media.id,
			name: media.name,
			kind: media.kind,
			folderId: media.folderId,
			description: `${media.kind} · ${media.mimeType ?? 'Media asset'}`
		}))
	);
	const mediaPickerFolders = $derived<MediaPickerFolder[]>(
		(snapshot.availableMediaFolders ?? []).map((folder) => ({
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId
		}))
	);
	const selectedResourceMedia = $derived(
		availableMedia.find((media) => media.id === resourceMediaId) ?? null
	);
	const visibleResources = $derived(
		resources.filter((resource) => {
			const term = resourceSearch.trim().toLocaleLowerCase();
			return (
				!term ||
				`${resource.name} ${resource.mediaName} ${resource.kind}`.toLocaleLowerCase().includes(term)
			);
		})
	);

	function mergeNotes(incoming: CourseNote[]) {
		const merged = new Map([...notes, ...incoming].map((note) => [note.id, note]));
		notes = [...merged.values()].toSorted((left, right) =>
			right.updatedAt.localeCompare(left.updatedAt)
		);
	}

	function changed(document: LessonDocument) {
		const lessonId = selectedLessonId;
		lessons = lessons.map((lesson) =>
			lesson.id === lessonId ? { ...lesson, title: document.title, document } : lesson
		);
		pendingSave = { lessonId, document };
		saveState = saveInFlight ? 'saving' : 'pending';
		saveMessage = null;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = saveInFlight ? null : setTimeout(() => void saveNow(), 650);
	}

	async function persistLesson(save: { lessonId: string; document: LessonDocument }) {
		const response = await fetch(`/api/courses/${course.id}/lessons/${save.lessonId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			// A generated transcription can exceed the browser's keepalive request-body limit.
			body: JSON.stringify({ document: save.document })
		});
		const body = (await response.json().catch(() => null)) as
			CourseLessonRecord | { error?: string } | null;
		if (!response.ok) {
			throw new Error(
				body && 'error' in body && body.error ? body.error : 'Lesson could not be saved.'
			);
		}
	}

	async function saveNow() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = null;

		if (saveInFlight) return saveInFlight;
		saveInFlight = flushPendingSaves();
		try {
			await saveInFlight;
		} finally {
			saveInFlight = null;
		}
	}

	async function viewCourse(event: MouseEvent) {
		event.preventDefault();
		await saveNow();
		if (saveState === 'error') return;
		await goto(resolve('/(course)/learn/[courseId]', { courseId: course.id }));
	}

	function selectSidebarTab(tab: 'lessons' | 'resources') {
		if (translationBusy) return;
		sidebarTab = tab;
		translationWorkspaceOpen = false;
	}

	async function toggleTranslationWorkspace() {
		if (translationBusy) return;
		if (translationWorkspaceOpen) {
			translationWorkspaceOpen = false;
			return;
		}
		await saveNow();
		if (saveState === 'error') return;
		sidebarTab = 'lessons';
		translationWorkspaceOpen = true;
	}

	async function saveBeforeTranslation(): Promise<boolean> {
		await saveNow();
		return saveState !== 'error';
	}

	async function flushPendingSaves() {
		while (pendingSave) {
			const save = pendingSave;
			pendingSave = null;
			saveState = 'saving';
			try {
				await persistLesson(save);
			} catch (error) {
				saveState = 'error';
				saveMessage = error instanceof Error ? error.message : 'Lesson could not be saved.';
				pendingSave ??= save;
				return;
			}
		}
		saveState = 'saved';
	}

	async function updateCourse(changes: Record<string, unknown>) {
		saveMessage = null;
		updatingCourse = true;
		try {
			const response = await fetch(`/api/courses/${course.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(changes)
			});
			const body = (await response.json().catch(() => null)) as
				typeof course | { error?: string } | null;
			if (!response.ok || !body || !('id' in body) || !('title' in body))
				throw new Error(
					body && 'error' in body && body.error ? body.error : 'Course could not be updated.'
				);
			const updated = body as CourseSummary;
			course = updated;
			courseTitle = updated.title;
			return true;
		} catch (error) {
			saveMessage = error instanceof Error ? error.message : 'Course could not be updated.';
			courseTitle = course.title;
			return false;
		} finally {
			updatingCourse = false;
		}
	}

	function commitCourseTitle() {
		const title = courseTitle.trim();
		if (!title) {
			courseTitle = course.title;
			return;
		}
		if (title !== course.title) void updateCourse({ title });
	}

	function titleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			(event.currentTarget as HTMLInputElement).blur();
		}
		if (event.key === 'Escape') {
			courseTitle = course.title;
			(event.currentTarget as HTMLInputElement).blur();
		}
	}

	async function addLesson() {
		creatingLesson = true;
		saveMessage = null;
		await saveNow();
		try {
			const response = await fetch(`/api/courses/${course.id}/lessons`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}'
			});
			const body = (await response.json().catch(() => null)) as
				CourseLessonRecord | { error?: string } | null;
			if (!response.ok || !body || !('id' in body) || !('document' in body))
				throw new Error(
					body && 'error' in body && body.error ? body.error : 'Lesson could not be created.'
				);
			const created = body as CourseLessonRecord;
			lessons = [...lessons, created];
			selectedLessonId = created.id;
			course = { ...course, lessonCount: lessons.length };
		} catch (error) {
			saveMessage = error instanceof Error ? error.message : 'Lesson could not be created.';
		} finally {
			creatingLesson = false;
		}
	}

	async function removeLesson() {
		const lesson = lessonPendingDeletion;
		if (!lesson || lessons.length <= 1 || deletingLesson) return;
		deletingLesson = true;
		saveMessage = null;
		await saveNow();
		try {
			const response = await fetch(`/api/courses/${course.id}/lessons/${lesson.id}`, {
				method: 'DELETE'
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? 'Lesson could not be deleted.');
			}
			lessons = lessons.filter((candidate) => candidate.id !== lesson.id);
			const remainingDrafts = { ...translationDrafts };
			delete remainingDrafts[lesson.id];
			translationDrafts = remainingDrafts;
			if (selectedLessonId === lesson.id) selectedLessonId = lessons[0]?.id ?? '';
			course = { ...course, lessonCount: lessons.length };
			lessonPendingDeletion = null;
		} catch (error) {
			saveMessage = error instanceof Error ? error.message : 'Lesson could not be deleted.';
		} finally {
			deletingLesson = false;
		}
	}

	async function selectLesson(id: string) {
		if (translationBusy || id === selectedLessonId || switchingLessonId) return;
		switchingLessonId = id;
		await saveNow();
		selectedLessonId = id;
		switchingLessonId = null;
	}

	function statusChanged(status: CourseStatus) {
		void updateCourse({ status });
	}

	function normalizeResourceName() {
		resourceName = normalizeCourseMediaResourceName(resourceName);
	}

	function selectResourceMedia(mediaId: string) {
		resourceMediaId = mediaId;
		resourceComposerOpen = true;
		if (!resourceName.trim()) {
			const media = availableMedia.find((candidate) => candidate.id === mediaId);
			resourceName = normalizeCourseMediaResourceName(media?.name ?? '');
		}
	}

	function startResourceAdd() {
		resourceName = '';
		resourceMediaId = null;
		resourceComposerOpen = false;
		mediaPickerOpen = true;
	}

	async function addResource() {
		if (!resourceMediaId || !resourceName || resourceBusy) return;
		resourceBusy = true;
		resourceMessage = null;
		await saveNow();
		try {
			const response = await fetch(`/api/courses/${course.id}/resources`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ mediaId: resourceMediaId, name: resourceName })
			});
			const body = (await response.json().catch(() => null)) as
				CourseMediaResource | { error?: string } | null;
			if (!response.ok || !body || !('id' in body)) {
				throw new Error(
					body && 'error' in body && body.error ? body.error : 'Resource could not be imported.'
				);
			}
			resources = [...resources, body as CourseMediaResource].toSorted((left, right) =>
				left.name.localeCompare(right.name)
			);
			resourceName = '';
			resourceMediaId = null;
			resourceComposerOpen = false;
			resourceMessage = 'Media imported as a course resource.';
		} catch (error) {
			resourceMessage = error instanceof Error ? error.message : 'Resource could not be imported.';
		} finally {
			resourceBusy = false;
		}
	}

	async function removeResource(resource: CourseMediaResource) {
		if (resourceBusy) return;
		resourceBusy = true;
		resourceMessage = null;
		try {
			const response = await fetch(`/api/courses/${course.id}/resources/${resource.id}`, {
				method: 'DELETE'
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? 'Resource could not be removed.');
			}
			resources = resources.filter((candidate) => candidate.id !== resource.id);
			resourceMessage = 'Course resource removed.';
		} catch (error) {
			resourceMessage = error instanceof Error ? error.message : 'Resource could not be removed.';
		} finally {
			resourceBusy = false;
		}
	}

	async function generateResourceTranscription(
		resource: CourseMediaResource
	): Promise<CourseMediaResource | null> {
		if (resourceBusy) return null;
		resourceBusy = true;
		processingResourceId = resource.id;
		resourceMessage = null;
		try {
			const response = await fetch(
				`/api/courses/${course.id}/resources/${resource.id}/transcription`,
				{ method: 'POST' }
			);
			const body = (await response.json().catch(() => null)) as
				CourseMediaResource | { error?: string } | null;
			if (!response.ok || !body || !('id' in body)) {
				throw new Error(
					body && 'error' in body && body.error ? body.error : 'Timings could not be generated.'
				);
			}
			resources = resources.map((candidate) =>
				candidate.id === resource.id ? (body as CourseMediaResource) : candidate
			);
			resourceMessage = 'Audio transcription is ready for RichText highlighting.';
			return body as CourseMediaResource;
		} catch (error) {
			resourceMessage =
				error instanceof Error ? error.message : 'Audio transcription could not be generated.';
			return null;
		} finally {
			resourceBusy = false;
			processingResourceId = null;
		}
	}

	function builderShortcut(event: KeyboardEvent) {
		if (event.key === 'Escape' && lessonPendingDeletion && !deletingLesson) {
			lessonPendingDeletion = null;
			return;
		}
		if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
		event.preventDefault();
		commitCourseTitle();
		void saveNow();
	}

	function warnAboutUnsavedChanges(event: BeforeUnloadEvent) {
		if (!pendingSave && !saveInFlight && !hasTranslationDrafts && !translationBusy) return;
		event.preventDefault();
	}

	beforeNavigate((navigation) => {
		if (!hasTranslationDrafts && !translationBusy) return;
		if (navigation.to?.url.href === window.location.href) return;
		if (navigation.willUnload) {
			navigation.cancel();
			return;
		}
		if (translationBusy) {
			navigation.cancel();
			return;
		}
		if (!window.confirm('Leave this course? Unsaved translation edits will be lost.'))
			navigation.cancel();
	});

	onDestroy(() => {
		if (saveTimer) clearTimeout(saveTimer);
		void saveNow();
	});
</script>

<svelte:window onkeydown={builderShortcut} onbeforeunload={warnAboutUnsavedChanges} />

<div
	class="course-builder"
	style:--builder-bar-height={builderBarHeight ? `${builderBarHeight}px` : undefined}
>
	<header class="builder-bar" bind:offsetHeight={builderBarHeight}>
		<div class="course-identity">
			<Button
				href="/courses"
				variant="ghost"
				size="icon"
				class="back-button"
				aria-label="Back to courses"><ChevronLeft /></Button
			>
			<div class="identity-copy">
				<div class="builder-context">
					<span>Course workspace</span>
					<span class="status-pill" data-status={course.status}>{course.status}</span>
				</div>
				<label class="title-field">
					<span class="sr-only">Course title</span>
					<input
						bind:value={courseTitle}
						maxlength="180"
						lang={course.language}
						dir={course.direction}
						onblur={commitCourseTitle}
						onkeydown={titleKeydown}
					/>
					<Pencil size={13} aria-hidden="true" />
				</label>
			</div>
		</div>
		<div class="builder-actions">
			<div class="save-state" data-state={saveState} aria-live="polite">
				<span class="save-icon">
					{#if saveState === 'saved' && !updatingCourse}
						<Check size={14} />
					{:else if saveState === 'saving' || updatingCourse}
						<LoaderCircle class="spin" size={14} />
					{:else if saveState === 'error'}
						<CircleAlert size={14} />
					{:else}
						<Cloud size={14} />
					{/if}
				</span>
				<span class="save-copy">
					<strong
						>{saveState === 'saved' && !updatingCourse
							? 'Saved'
							: saveState === 'error'
								? 'Save failed'
								: saveState === 'pending'
									? 'Unsaved changes'
									: 'Saving'}</strong
					>
					<small
						>{saveState === 'saved' ? 'Changes sync automatically' : 'Keep this page open'}</small
					>
				</span>
			</div>
			<label class="status-control">
				<span>Course status</span>
				<select
					value={course.status}
					aria-label="Course status"
					disabled={updatingCourse}
					onchange={(event) => statusChanged(event.currentTarget.value as CourseStatus)}
				>
					<option value="draft">Draft</option>
					<option value="published">Published</option>
					<option value="archived">Archived</option>
				</select>
			</label>
			<Button
				variant={translationWorkspaceOpen ? 'default' : 'secondary'}
				size="sm"
				class="translation-action"
				aria-pressed={translationWorkspaceOpen}
				aria-controls="course-translations-panel"
				disabled={translationBusy}
				onclick={() => void toggleTranslationWorkspace()}
			>
				<Languages data-icon="inline-start" />
				<span class="translation-action-label">Translations</span>
			</Button>
			<Button
				href={resolve('/(course)/learn/[courseId]', { courseId: course.id })}
				variant="secondary"
				size="sm"
				class="view-course"
				aria-label="View course in student view"
				onclick={(event) => void viewCourse(event)}
			>
				<BookOpenText data-icon="inline-start" />
				<span class="view-course-label">View course</span>
			</Button>
			<Button
				variant={saveState === 'error' ? 'destructive' : 'outline'}
				size="sm"
				class="save-button"
				onclick={() => saveNow()}
				disabled={saveState === 'saved' || saveState === 'saving'}
			>
				<CloudUpload data-icon="inline-start" />
				{saveState === 'error' ? 'Retry' : 'Save'}
			</Button>
		</div>
	</header>

	{#if saveMessage}
		<div class="save-error" role="alert">
			<CircleAlert size={17} />
			<div><strong>We couldn’t save that change.</strong><span>{saveMessage}</span></div>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label="Dismiss error"
				onclick={() => (saveMessage = null)}><X /></Button
			>
		</div>
	{/if}

	<div class="builder-workspace">
		<aside class="lesson-rail" aria-label="Course workspace">
			<header class="rail-header">
				<div>
					<p>Course workspace</p>
					<strong
						>{translationWorkspaceOpen
							? 'Translation lessons'
							: sidebarTab === 'lessons'
								? 'Course outline'
								: 'Course resources'}</strong
					>
				</div>
				{#if sidebarTab === 'lessons' && !translationWorkspaceOpen}
					<Button
						variant="secondary"
						size="icon-sm"
						aria-label="Add lesson"
						onclick={addLesson}
						disabled={creatingLesson}
						>{#if creatingLesson}<LoaderCircle class="spin" />{:else}<Plus />{/if}</Button
					>
				{/if}
			</header>
			<div class="rail-tabs" role="tablist" aria-label="Course workspace sections">
				<button
					type="button"
					role="tab"
					id="course-lessons-tab"
					aria-controls="course-lessons-panel"
					aria-selected={sidebarTab === 'lessons'}
					disabled={translationBusy}
					onclick={() => void selectSidebarTab('lessons')}><BookOpenText size={14} />Lessons</button
				>
				<button
					type="button"
					role="tab"
					id="course-resources-tab"
					aria-controls="course-resources-panel"
					aria-selected={sidebarTab === 'resources'}
					disabled={translationBusy}
					onclick={() => void selectSidebarTab('resources')}
					><LibraryBig size={14} />Resources</button
				>
			</div>
			{#if sidebarTab === 'resources'}
				<div
					class="course-resources"
					id="course-resources-panel"
					role="tabpanel"
					aria-labelledby="course-resources-tab"
				>
					<header>
						<div>
							<p>Course library</p>
							<strong>Import and reference media</strong>
						</div>
						<Button
							type="button"
							size="xs"
							disabled={resourceBusy || !availableMedia.length}
							onclick={startResourceAdd}><Plus />Add resource</Button
						>
					</header>
					<p class="resource-intro">
						Each import gets a normalized alias. RichText uses an audio alias as its highlighting
						source.
					</p>
					{#if availableMedia.length}
						{#if resourceComposerOpen}
							<div class="resource-import">
								<div class="resource-media-field">
									<span>Media library asset</span>
									<button
										type="button"
										class="resource-media-trigger"
										disabled={resourceBusy}
										onclick={() => (mediaPickerOpen = true)}
									>
										<LibraryBig size={15} />
										<span
											><strong>{selectedResourceMedia?.name ?? 'Choose media'}</strong><small
												>{selectedResourceMedia
													? `${selectedResourceMedia.kind} · ${selectedResourceMedia.mimeType ?? 'Media asset'}`
													: 'Select from your Media Manager library.'}</small
											></span
										>
									</button>
								</div>
								<label class="resource-alias">
									<span>Course alias</span>
									<input
										bind:value={resourceName}
										maxlength="80"
										placeholder="lesson-narration"
										onblur={normalizeResourceName}
									/>
									<small>Lowercase and hyphenated. This is what lesson content references.</small>
								</label>
								<Button
									type="button"
									size="sm"
									disabled={resourceBusy || !resourceName}
									onclick={addResource}
									><LibraryBig data-icon="inline-start" />Import into course</Button
								>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={resourceBusy}
									onclick={() => (resourceComposerOpen = false)}>Cancel</Button
								>
							</div>
						{:else if !resources.length}
							<div class="resource-empty">
								<LibraryBig size={18} />
								<p>
									No course resources yet. Add media from your Media Manager library to give it a
									course-specific alias.
								</p>
							</div>
						{/if}
					{:else}
						<p class="resource-empty">
							Add media in Media Manager, then reload this course to import it.
						</p>
					{/if}
					{#if resources.length}
						<label class="resource-search">
							<Search size={13} /><span class="sr-only">Search course resources</span><input
								bind:value={resourceSearch}
								placeholder="Find a resource"
							/>
						</label>
						<ul aria-label="Imported course resources">
							{#each visibleResources as resource (resource.id)}
								<li>
									<span class="resource-kind" data-kind={resource.kind} aria-hidden="true">
										{#if resource.kind === 'audio'}<AudioLines
											/>{:else if resource.kind === 'video'}<Video />{:else}<Image />{/if}
									</span>
									<div class="resource-copy">
										<code>{resource.name}</code>
										{#if resource.kind === 'audio'}
											<span
												class:timings-ready={Boolean(resource.transcribedText)}
												class="timing-status"
											>
												{processingResourceId === resource.id
													? 'Generating transcription…'
													: resource.transcribedText
														? 'Transcript and highlight timings ready'
														: 'Ready for transcription'}
											</span>
										{/if}
										<small>{resource.kind} · {resource.mediaName}</small>
									</div>
									<div class="resource-actions">
										{#if resource.kind === 'audio'}
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												disabled={resourceBusy}
												aria-label={`Generate transcription for ${resource.name}`}
												onclick={() => generateResourceTranscription(resource)}
												>{#if resource.transcribedText}â†»{:else}âœ¦{/if}</Button
											>
										{/if}
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											disabled={resourceBusy}
											aria-label={`Remove ${resource.name}`}
											onclick={() => removeResource(resource)}><Trash2 /></Button
										>
									</div>
								</li>
							{/each}
						</ul>
						{#if !visibleResources.length}<p class="no-resource-match">
								No course resource matches “{resourceSearch}”.
							</p>{/if}
					{/if}
					{#if resourceMessage}<p class="resource-message" role="status">{resourceMessage}</p>{/if}
				</div>
			{/if}
			{#if sidebarTab === 'lessons'}
				<div
					id="course-lessons-panel"
					role="tabpanel"
					aria-labelledby="course-lessons-tab"
					class="lessons-panel"
				>
					<div class="outline-summary">
						<span>{lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}</span>
						<span>Lesson {selectedLessonNumber} selected</span>
					</div>
					<div class="lessons-collection">
						<ol aria-label="Lessons">
							{#each lessons as lesson, index (lesson.id)}
								<li class:active={lesson.id === selectedLessonId}>
									<button
										class="lesson-select"
										type="button"
										aria-current={lesson.id === selectedLessonId ? 'step' : undefined}
										disabled={translationBusy || switchingLessonId !== null}
										onclick={() => selectLesson(lesson.id)}
									>
										<span class="lesson-number">{String(index + 1).padStart(2, '0')}</span>
										<span
											class="lesson-copy"
											lang={lesson.document.language}
											dir={lesson.document.direction}
											><strong>{lesson.title}</strong><small
												><FileText size={11} />{lesson.document.frames.length}
												{lesson.document.frames.length === 1 ? 'frame' : 'frames'}</small
											></span
										>
									</button>
									{#if !translationWorkspaceOpen}
										<Button
											class="delete-lesson"
											variant="ghost"
											size="icon-xs"
											aria-label={`Delete ${lesson.title}`}
											disabled={lessons.length <= 1}
											onclick={() => (lessonPendingDeletion = lesson)}><Trash2 /></Button
										>
									{/if}
								</li>
							{/each}
						</ol>
						{#if !translationWorkspaceOpen}
							<Button
								class="add-lesson"
								variant="outline"
								size="sm"
								onclick={addLesson}
								disabled={creatingLesson}
								>{#if creatingLesson}<LoaderCircle class="spin" />{:else}<Plus
										data-icon="inline-start"
									/>{/if}
								{creatingLesson ? 'Adding lesson…' : 'Add lesson'}</Button
							>
						{/if}
						<div class="rail-note">
							{#if translationWorkspaceOpen}
								<Languages size={16} />
								<span
									><strong>Translation workspace</strong><small
										>Select a lesson to manage its sentence translations.</small
									></span
								>
							{:else}
								<BookOpenText size={16} />
								<span
									><strong>Student sequence</strong><small>Lessons appear in this order.</small
									></span
								>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</aside>

		<section class:translation-mode={translationWorkspaceOpen} class="editor-area">
			{#if translationWorkspaceOpen && selectedLesson}
				<div
					class="course-translations"
					id="course-translations-panel"
					role="region"
					aria-label="Sentence translations"
				>
					{#key selectedLesson.id}
						<CourseTranslationManager
							courseId={course.id}
							lesson={selectedLesson}
							{notes}
							{nativeLanguage}
							drafts={translationDrafts[selectedLesson.id] ?? {}}
							onDraftsChange={(drafts) => {
								translationDrafts = { ...translationDrafts, [selectedLesson.id]: drafts };
							}}
							onBusyChange={(busy) => (translationBusy = busy)}
							onNotesChange={mergeNotes}
							onBeforeSave={saveBeforeTranslation}
							onClose={() => (translationWorkspaceOpen = false)}
						/>
					{/key}
				</div>
			{:else if selectedLesson}
				{#key selectedLesson.id}
					<LessonEditor
						initialDocument={selectedLesson.document}
						{templates}
						subjectLabel="Language Learning"
						subjectKicker="زبان‌آموزی · Language Learning"
						subjectKickerLanguage="fa"
						subjectKickerDirection="rtl"
						embedded
						onDocumentChange={changed}
						mediaResources={resources}
						onGenerateMediaTranscription={generateResourceTranscription}
					/>
				{/key}
			{:else}
				<div class="no-lesson">Add a lesson to start building.</div>
			{/if}
		</section>
	</div>
</div>

<MediaPickerDialog
	open={mediaPickerOpen}
	items={mediaPickerItems}
	folders={mediaPickerFolders}
	selectedId={resourceMediaId}
	title="Choose course media"
	description="Select an item from Media Manager. You will give it a course-specific alias next."
	pickerLabel="Media library assets"
	emptyMessage="No media matches your search."
	disabled={resourceBusy}
	onSelect={selectResourceMedia}
	onClose={() => (mediaPickerOpen = false)}
/>

{#if lessonPendingDeletion}
	<div
		class="dialog-backdrop"
		role="presentation"
		onclick={(event) =>
			event.target === event.currentTarget && !deletingLesson && (lessonPendingDeletion = null)}
	>
		<div
			class="delete-dialog"
			role="alertdialog"
			tabindex="-1"
			aria-modal="true"
			aria-labelledby="delete-lesson-title"
			aria-describedby="delete-lesson-description"
		>
			<div class="danger-icon"><Trash2 size={19} /></div>
			<div class="dialog-copy">
				<p>Delete lesson</p>
				<h2 id="delete-lesson-title">Remove “{lessonPendingDeletion.title}”?</h2>
				<p id="delete-lesson-description">
					This removes the lesson and all of its frames from the course. This action can’t be
					undone.
				</p>
			</div>
			<footer>
				<Button
					variant="ghost"
					disabled={deletingLesson}
					onclick={() => (lessonPendingDeletion = null)}>Cancel</Button
				>
				<Button variant="destructive" disabled={deletingLesson} onclick={removeLesson}>
					{#if deletingLesson}<LoaderCircle class="spin" />{:else}<Trash2
							data-icon="inline-start"
						/>{/if}
					{deletingLesson ? 'Deleting…' : 'Delete lesson'}
				</Button>
			</footer>
		</div>
	</div>
{/if}

<style>
	.course-builder {
		--builder-bar-height: 4.6rem;
		--builder-bar-offset: calc(var(--app-header-height, 0rem) + 0.65rem);
		--editor-toolbar-gap: 0.75rem;
		--editor-toolbar-offset: calc(
			var(--builder-bar-offset) + var(--builder-bar-height) + var(--editor-toolbar-gap)
		);
		display: grid;
		gap: 0.75rem;
		min-inline-size: 0;
		container-type: inline-size;
	}
	.builder-bar,
	.course-identity,
	.builder-actions,
	.lesson-rail > header,
	.lesson-select,
	.rail-note,
	.save-state,
	.builder-context,
	.title-field,
	.outline-summary,
	.save-error {
		display: flex;
		align-items: center;
	}
	.builder-bar {
		position: sticky;
		z-index: 20;
		inset-block-start: var(--builder-bar-offset);
		justify-content: space-between;
		gap: 1rem;
		min-block-size: 4.6rem;
		border: 0.0625rem solid color-mix(in oklab, var(--border) 88%, transparent);
		border-radius: 1rem;
		padding: 0.6rem 0.75rem;
		background: color-mix(in oklab, var(--card) 96%, transparent);
		box-shadow: 0 1rem 2.5rem -2.2rem color-mix(in oklab, var(--foreground) 38%, transparent);
		backdrop-filter: blur(1rem);
	}
	.builder-bar::before {
		position: absolute;
		inset-block-end: 100%;
		inset-inline: -0.0625rem;
		block-size: 0.65rem;
		background: var(--studio-workspace, var(--background));
		content: '';
	}
	.course-identity {
		min-inline-size: 0;
		gap: 0.65rem;
	}
	.course-identity :global(.back-button) {
		border: 0.0625rem solid transparent;
		color: var(--muted-foreground);
	}
	.course-identity :global(.back-button:hover) {
		border-color: var(--border);
		background: var(--background);
		color: var(--foreground);
	}
	.identity-copy {
		display: grid;
		min-inline-size: 0;
		gap: 0.08rem;
	}
	.builder-context {
		gap: 0.45rem;
		color: var(--muted-foreground);
		font-size: 0.6rem;
		font-weight: 750;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}
	.status-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.28rem;
		border-radius: 999px;
		padding: 0.1rem 0.38rem;
		background: color-mix(in oklab, var(--muted) 78%, transparent);
		color: var(--muted-foreground);
		font-size: 0.53rem;
		letter-spacing: 0.06em;
	}
	.status-pill::before {
		inline-size: 0.32rem;
		block-size: 0.32rem;
		border-radius: 50%;
		background: currentColor;
		content: '';
	}
	.status-pill[data-status='published'] {
		background: color-mix(in oklab, var(--studio-sage, #e8f1eb) 88%, transparent);
		color: var(--studio-green, #52816c);
	}
	.status-pill[data-status='archived'] {
		background: color-mix(in oklab, var(--muted) 92%, transparent);
		color: var(--muted-foreground);
	}
	.title-field {
		position: relative;
		min-inline-size: 0;
		gap: 0.3rem;
	}
	.title-field input {
		inline-size: min(34rem, 39vw);
		min-inline-size: 0;
		border: 0;
		border-radius: 0.35rem;
		padding: 0.05rem 0.2rem;
		background: transparent;
		color: var(--foreground);
		font-size: 1.02rem;
		font-weight: 720;
		letter-spacing: -0.018em;
		outline: none;
		text-overflow: ellipsis;
	}
	.title-field input:hover,
	.title-field input:focus {
		background: color-mix(in oklab, var(--muted) 60%, transparent);
	}
	.title-field input:focus {
		box-shadow: 0 0 0 0.125rem color-mix(in oklab, var(--editor-selection) 35%, transparent);
	}
	.title-field > :global(svg) {
		flex: 0 0 auto;
		color: var(--muted-foreground);
		opacity: 0;
		transition: opacity 140ms ease;
	}
	.title-field:hover > :global(svg),
	.title-field:focus-within > :global(svg) {
		opacity: 1;
	}
	.builder-actions {
		gap: 0.55rem;
		flex: 0 0 auto;
	}
	.save-state {
		gap: 0.5rem;
		padding-inline: 0.25rem 0.45rem;
		color: var(--muted-foreground);
		white-space: nowrap;
	}
	.save-icon {
		display: grid;
		inline-size: 1.7rem;
		block-size: 1.7rem;
		place-items: center;
		border-radius: 50%;
		background: color-mix(in oklab, var(--muted) 70%, transparent);
	}
	.save-copy {
		display: grid;
		gap: 0.05rem;
	}
	.save-copy strong {
		color: var(--foreground);
		font-size: 0.67rem;
		font-weight: 650;
		line-height: 1.15;
	}
	.save-copy small {
		font-size: 0.55rem;
		line-height: 1.15;
	}
	.save-state[data-state='saved'] .save-icon {
		background: color-mix(in oklab, var(--studio-sage, #e8f1eb) 88%, transparent);
		color: var(--studio-green, #52816c);
	}
	.save-state[data-state='error'] .save-icon,
	.save-state[data-state='error'] strong {
		background: color-mix(in oklab, var(--destructive) 10%, transparent);
		color: var(--destructive);
	}
	.status-control {
		display: grid;
		gap: 0.05rem;
		min-inline-size: 7.7rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.7rem;
		padding: 0.3rem 0.55rem 0.32rem;
		background: color-mix(in oklab, var(--background) 88%, transparent);
	}
	.status-control:focus-within {
		border-color: color-mix(in oklab, var(--editor-selection) 55%, var(--border));
		box-shadow: 0 0 0 0.125rem color-mix(in oklab, var(--editor-selection) 14%, transparent);
	}
	.status-control > span {
		color: var(--muted-foreground);
		font-size: 0.5rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		line-height: 1;
		text-transform: uppercase;
	}
	.status-control select {
		inline-size: 100%;
		border: 0;
		padding: 0;
		background: transparent;
		color: var(--foreground);
		font-size: 0.7rem;
		font-weight: 650;
		outline: none;
	}
	.save-error {
		gap: 0.65rem;
		border: 0.0625rem solid color-mix(in oklab, var(--destructive) 20%, transparent);
		border-radius: 0.75rem;
		padding: 0.65rem 0.75rem;
		background: color-mix(in oklab, var(--destructive) 10%, transparent);
		color: var(--destructive);
	}
	.save-error > :global(svg) {
		flex: 0 0 auto;
	}
	.save-error > div {
		display: grid;
		flex: 1;
		gap: 0.08rem;
	}
	.save-error strong {
		font-size: 0.72rem;
	}
	.save-error span {
		font-size: 0.65rem;
	}
	.builder-workspace {
		display: grid;
		grid-template-columns: minmax(13.5rem, 15.5rem) minmax(0, 1fr);
		gap: 0.9rem;
		min-inline-size: 0;
		align-items: start;
	}
	.lesson-rail {
		display: grid;
		position: sticky;
		inset-block-start: var(--editor-toolbar-offset);
		gap: 0.75rem;
		max-block-size: calc(100svh - var(--editor-toolbar-offset) - 1rem);
		overflow: auto;
		border: 0.0625rem solid color-mix(in oklab, var(--border) 88%, transparent);
		border-radius: 1rem;
		padding: 0.8rem;
		background: color-mix(in oklab, var(--card) 96%, transparent);
		box-shadow: 0 1rem 2.4rem -2.35rem color-mix(in oklab, var(--foreground) 30%, transparent);
	}
	.lesson-rail > header {
		justify-content: space-between;
		gap: 0.5rem;
	}
	.lesson-rail header p,
	.lesson-rail header strong {
		margin: 0;
	}
	.lesson-rail header p {
		margin-block-end: 0.08rem;
		color: var(--muted-foreground);
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	.lesson-rail header strong {
		font-size: 0.84rem;
		letter-spacing: -0.015em;
	}
	.outline-summary {
		justify-content: space-between;
		gap: 0.5rem;
		padding-block-end: 0.65rem;
		border-block-end: 0.0625rem solid color-mix(in oklab, var(--border) 76%, transparent);
		color: var(--muted-foreground);
		font-size: 0.58rem;
	}
	.course-resources {
		display: grid;
		gap: 0.45rem;
		border-block-end: 0.0625rem solid color-mix(in oklab, var(--border) 76%, transparent);
		padding-block-end: 0.7rem;
	}
	.course-resources > header,
	.resource-actions,
	.course-resources li {
		display: flex;
		align-items: center;
	}
	.course-resources > header {
		justify-content: space-between;
		gap: 0.5rem;
	}
	.resource-import {
		display: grid;
		gap: 0.35rem;
	}
	.resource-import input {
		min-inline-size: 0;
		min-block-size: 2rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.45rem;
		padding-inline: 0.5rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		font-size: 0.65rem;
	}
	.resource-import :global([data-slot='button']) {
		justify-content: center;
	}
	.course-resources ul {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.course-resources li {
		justify-content: space-between;
		gap: 0.35rem;
		min-inline-size: 0;
		border: 0;
		border-radius: 0.45rem;
		padding: 0.35rem 0.25rem;
		background: color-mix(in oklab, var(--muted) 52%, transparent);
	}
	.course-resources li::before {
		display: none;
	}
	.course-resources li > div:first-child {
		display: grid;
		min-inline-size: 0;
		gap: 0.1rem;
	}
	.course-resources code,
	.course-resources small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.course-resources code {
		color: var(--foreground);
		font-size: 0.62rem;
	}
	.course-resources small,
	.resource-empty,
	.resource-message {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 0.56rem;
		line-height: 1.35;
	}
	.resource-actions {
		gap: 0.05rem;
		flex: 0 0 auto;
	}
	.resource-message {
		color: var(--editor-selection);
	}
	.rail-tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.2rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.65rem;
		padding: 0.2rem;
		background: color-mix(in oklab, var(--muted) 48%, transparent);
	}
	.rail-tabs button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.18rem;
		min-inline-size: 0;
		min-block-size: 1.9rem;
		border: 0;
		border-radius: 0.43rem;
		background: transparent;
		color: var(--muted-foreground);
		font: inherit;
		font-size: 0.6rem;
		font-weight: 700;
		cursor: pointer;
	}
	.rail-tabs button[aria-selected='true'] {
		background: var(--background);
		box-shadow: 0 0.1rem 0.35rem -0.25rem color-mix(in oklab, var(--foreground) 60%, transparent);
		color: var(--foreground);
	}
	.rail-tabs button:focus-visible {
		outline: 0.125rem solid color-mix(in oklab, var(--editor-selection) 60%, transparent);
		outline-offset: 0.06rem;
	}
	.lessons-panel,
	.lessons-collection {
		display: grid;
		gap: 0.75rem;
	}
	.course-translations {
		min-inline-size: 0;
		inline-size: 100%;
	}
	.course-resources {
		gap: 0.7rem;
		border-block-end: 0;
		padding-block-end: 0;
	}
	.resource-intro {
		margin: -0.2rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.6rem;
		line-height: 1.45;
	}
	.resource-media-field {
		display: grid;
		gap: 0.2rem;
	}
	.resource-media-field > span {
		color: var(--muted-foreground);
		font-size: 0.52rem;
		font-weight: 750;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.resource-media-trigger {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-inline-size: 0;
		min-block-size: 2.5rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.55rem;
		padding: 0.4rem 0.5rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		text-align: start;
		cursor: pointer;
	}
	.resource-media-trigger:hover:not(:disabled) {
		border-color: color-mix(in oklab, var(--editor-selection) 40%, var(--border));
		background: color-mix(in oklab, var(--editor-selection-soft) 42%, var(--background));
	}
	.resource-media-trigger:focus-visible {
		outline: 0.125rem solid color-mix(in oklab, var(--editor-selection) 55%, transparent);
		outline-offset: 0.06rem;
	}
	.resource-media-trigger:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}
	.resource-media-trigger > :global(svg) {
		flex: 0 0 auto;
		color: var(--editor-selection);
	}
	.resource-media-trigger > span {
		display: grid;
		min-inline-size: 0;
		gap: 0.08rem;
	}
	.resource-media-trigger strong,
	.resource-media-trigger small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.resource-media-trigger strong {
		font-size: 0.65rem;
		font-weight: 660;
	}
	.resource-media-trigger small {
		color: var(--muted-foreground);
		font-size: 0.54rem;
	}
	.resource-alias {
		display: grid;
		gap: 0.17rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.55rem;
		padding: 0.35rem 0.5rem 0.4rem;
		background: var(--background);
	}
	.resource-alias:focus-within,
	.resource-search:focus-within {
		border-color: color-mix(in oklab, var(--editor-selection) 55%, var(--border));
		box-shadow: 0 0 0 0.125rem color-mix(in oklab, var(--editor-selection) 12%, transparent);
	}
	.resource-alias > span {
		color: var(--muted-foreground);
		font-size: 0.52rem;
		font-weight: 750;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	.resource-import .resource-alias input {
		min-block-size: 1.35rem;
		border: 0;
		border-radius: 0;
		padding: 0;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.7rem;
		outline: none;
	}
	.resource-alias small {
		color: var(--muted-foreground);
		font-size: 0.53rem;
		line-height: 1.3;
	}
	.resource-search {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.45rem;
		padding-inline: 0.45rem;
		background: var(--background);
		color: var(--muted-foreground);
	}
	.resource-search input {
		inline-size: 100%;
		min-inline-size: 0;
		min-block-size: 1.8rem;
		border: 0;
		background: transparent;
		color: var(--foreground);
		font: inherit;
		font-size: 0.62rem;
		outline: none;
	}
	.course-resources li {
		align-items: flex-start;
		gap: 0.45rem;
		border: 0.0625rem solid transparent;
		padding: 0.45rem;
	}
	.course-resources li:hover {
		border-color: color-mix(in oklab, var(--border) 85%, transparent);
		background: color-mix(in oklab, var(--muted) 64%, transparent);
	}
	.resource-kind {
		display: grid;
		inline-size: 1.7rem;
		block-size: 1.7rem;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 0.42rem;
		background: color-mix(in oklab, var(--muted) 76%, transparent);
		color: var(--muted-foreground);
	}
	.resource-kind[data-kind='audio'] {
		background: color-mix(in oklab, #38bdf8 22%, transparent);
		color: #0369a1;
	}
	.resource-kind[data-kind='video'] {
		background: color-mix(in oklab, #a78bfa 24%, transparent);
		color: #6d28d9;
	}
	.resource-kind[data-kind='image'] {
		background: color-mix(in oklab, #34d399 23%, transparent);
		color: #047857;
	}
	.resource-kind :global(svg) {
		inline-size: 0.82rem;
	}
	.course-resources .resource-copy {
		display: grid;
		min-inline-size: 0;
		flex: 1;
		gap: 0.1rem;
	}
	.timing-status {
		color: var(--muted-foreground);
		font-size: 0.5rem;
	}
	.timing-status::before {
		display: inline-block;
		inline-size: 0.32rem;
		block-size: 0.32rem;
		margin-inline-end: 0.22rem;
		border-radius: 50%;
		background: currentColor;
		content: '';
	}
	.timing-status.timings-ready {
		color: var(--studio-green, #52816c);
	}
	.no-resource-match {
		margin: 0;
		color: var(--muted-foreground);
		font-size: 0.58rem;
		text-align: center;
	}
	ol {
		display: grid;
		gap: 0.28rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		position: relative;
		border: 0.0625rem solid transparent;
		border-radius: 0.75rem;
		transition:
			border-color 140ms ease,
			background-color 140ms ease;
	}
	li:hover {
		border-color: color-mix(in oklab, var(--border) 88%, transparent);
		background: color-mix(in oklab, var(--muted) 38%, transparent);
	}
	li.active {
		border-color: color-mix(in oklab, var(--editor-selection) 25%, transparent);
		background: color-mix(in oklab, var(--editor-selection-soft) 78%, var(--background));
	}
	li.active::before {
		position: absolute;
		z-index: 1;
		inset-block: 0.6rem;
		inset-inline-start: -0.13rem;
		inline-size: 0.2rem;
		border-radius: 999px;
		background: var(--editor-selection);
		content: '';
	}
	.lesson-select {
		inline-size: 100%;
		min-inline-size: 0;
		gap: 0.6rem;
		border: 0;
		border-radius: inherit;
		padding: 0.6rem 2rem 0.6rem 0.55rem;
		background: transparent;
		color: var(--foreground);
		text-align: start;
		cursor: pointer;
	}
	.lesson-select:focus-visible {
		outline: 0.125rem solid color-mix(in oklab, var(--editor-selection) 55%, transparent);
		outline-offset: 0.0625rem;
	}
	.lesson-number {
		display: grid;
		inline-size: 1.6rem;
		block-size: 1.6rem;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 0.48rem;
		background: color-mix(in oklab, var(--muted) 72%, transparent);
		color: var(--muted-foreground);
		font-size: 0.56rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	li.active .lesson-number {
		background: var(--editor-selection);
		color: white;
	}
	.lesson-copy {
		display: grid;
		min-inline-size: 0;
		gap: 0.16rem;
		text-align: start;
	}
	.lesson-copy strong,
	.lesson-copy small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lesson-copy strong {
		font-size: 0.7rem;
		font-weight: 650;
	}
	.lesson-copy small {
		display: flex;
		align-items: center;
		gap: 0.23rem;
		color: var(--muted-foreground);
		font-size: 0.56rem;
	}
	:global(.delete-lesson) {
		position: absolute;
		inset-block-start: 50%;
		inset-inline-end: 0.38rem;
		color: var(--muted-foreground);
		opacity: 0;
		transform: translateY(-50%);
		transition:
			opacity 120ms ease,
			color 120ms ease;
	}
	li:hover :global(.delete-lesson),
	li:focus-within :global(.delete-lesson) {
		opacity: 1;
	}
	:global(.delete-lesson:hover) {
		color: var(--destructive);
	}
	:global(.add-lesson) {
		inline-size: 100%;
		border-style: dashed;
		color: var(--muted-foreground);
	}
	.rail-note {
		gap: 0.55rem;
		border-radius: 0.7rem;
		padding: 0.65rem;
		background: color-mix(in oklab, var(--studio-sage, #e8f1eb) 78%, transparent);
		color: var(--studio-green, #52816c);
	}
	.rail-note > :global(svg) {
		flex: 0 0 auto;
	}
	.rail-note span {
		display: grid;
		gap: 0.05rem;
	}
	.rail-note strong {
		font-size: 0.61rem;
	}
	.rail-note small {
		font-size: 0.56rem;
		line-height: 1.35;
	}
	.editor-area {
		min-inline-size: 0;
	}
	.no-lesson {
		display: grid;
		min-block-size: 35rem;
		place-items: center;
		color: var(--muted-foreground);
	}
	.dialog-backdrop {
		display: grid;
		position: fixed;
		z-index: 100;
		inset: 0;
		place-items: center;
		padding: 1rem;
		background: color-mix(in oklab, #16131d 48%, transparent);
		backdrop-filter: blur(0.2rem);
	}
	.delete-dialog {
		display: grid;
		inline-size: min(100%, 27rem);
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.8rem;
		border: 0.0625rem solid var(--border);
		border-radius: 1rem;
		padding: 1rem;
		background: var(--background);
		box-shadow: 0 2rem 5rem -2rem #11101880;
	}
	.danger-icon {
		display: grid;
		inline-size: 2.35rem;
		block-size: 2.35rem;
		place-items: center;
		border-radius: 0.7rem;
		background: color-mix(in oklab, var(--destructive) 11%, transparent);
		color: var(--destructive);
	}
	.dialog-copy {
		display: grid;
		gap: 0.3rem;
	}
	.dialog-copy > p:first-child {
		color: var(--destructive);
		font-size: 0.6rem;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.dialog-copy h2,
	.dialog-copy p {
		margin: 0;
	}
	.dialog-copy h2 {
		font-size: 1rem;
		letter-spacing: -0.02em;
	}
	.dialog-copy p:last-child {
		color: var(--muted-foreground);
		font-size: 0.7rem;
		line-height: 1.55;
	}
	.delete-dialog footer {
		display: flex;
		grid-column: 1 / -1;
		justify-content: flex-end;
		gap: 0.4rem;
		padding-block-start: 0.35rem;
	}
	:global(.spin) {
		animation: spin 850ms linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@container (max-width: 82rem) {
		.builder-workspace {
			grid-template-columns: 1fr;
		}
		.lesson-rail {
			position: static;
			max-block-size: none;
			grid-template-columns: auto minmax(0, 1fr) auto;
			align-items: center;
		}
		.lesson-rail > header {
			min-inline-size: 9rem;
		}
		.outline-summary,
		.rail-note {
			display: none;
		}
		.lessons-panel {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.course-resources {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.lesson-rail ol {
			grid-column: 1 / -1;
			grid-row: 1;
			display: flex;
			overflow-x: auto;
			padding: 0.08rem;
		}
		li {
			inline-size: 12.5rem;
			flex: 0 0 auto;
		}
		:global(.add-lesson) {
			grid-column: 1 / -1;
			grid-row: 2;
			inline-size: auto;
			flex: 0 0 auto;
		}
	}
	@container (max-width: 62rem) {
		.save-copy small,
		.status-control > span {
			display: none;
		}
		.status-control {
			min-inline-size: 6.8rem;
			padding-block: 0.46rem;
		}
	}
	@container (max-width: 48rem) {
		.course-builder {
			--builder-bar-height: 4rem;
		}
		.builder-bar {
			min-block-size: 4rem;
			gap: 0.45rem;
			padding: 0.45rem;
		}
		.save-state,
		.builder-actions > :global(.save-button) {
			display: none;
		}
		.builder-actions > :global(.view-course) {
			inline-size: 1.9rem;
			block-size: 1.9rem;
			padding: 0;
		}
		.builder-actions > :global(.translation-action) {
			inline-size: 1.9rem;
			block-size: 1.9rem;
			padding: 0;
		}
		.builder-actions :global(.view-course-label) {
			display: none;
		}
		.builder-actions :global(.translation-action-label) {
			display: none;
		}
		.course-identity {
			gap: 0.25rem;
		}
		.course-identity :global(.back-button) {
			inline-size: 1.9rem;
			block-size: 1.9rem;
		}
		.title-field input {
			inline-size: min(47vw, 20rem);
			font-size: 0.85rem;
		}
		.builder-context > span:first-child,
		.title-field > :global(svg) {
			display: none;
		}
		.status-control {
			min-inline-size: 6.1rem;
			padding-inline: 0.4rem;
		}
		.status-control select {
			font-size: 0.65rem;
		}
		.builder-workspace {
			gap: 0.55rem;
		}
		.lesson-rail {
			grid-template-columns: 1fr auto;
			gap: 0.55rem;
			padding: 0.65rem;
		}
		.lesson-rail > header {
			min-inline-size: 0;
		}
		.lesson-rail > header > :global([data-slot='button']) {
			display: none;
		}
		.rail-tabs {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.lessons-panel {
			grid-column: 1 / -1;
			grid-row: 3;
		}
		.lesson-rail ol {
			grid-column: 1 / -1;
			grid-row: 1;
		}
		.course-resources {
			grid-column: 1 / -1;
			grid-row: 3;
		}
		.lesson-rail :global(.add-lesson) {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		li {
			inline-size: 11.5rem;
		}
		.save-error strong {
			display: none;
		}
		.delete-dialog {
			align-self: end;
			border-end-end-radius: 0;
			border-end-start-radius: 0;
		}
		.dialog-backdrop {
			padding: 0;
		}
	}
	@container (max-width: 32rem) {
		.builder-bar {
			gap: 0.3rem;
			padding: 0.35rem;
		}
		.title-field input {
			inline-size: 30vw;
		}
		.lesson-rail {
			gap: 0.4rem;
			padding: var(--panel-gutter);
		}
		li {
			inline-size: 10.5rem;
		}
		.delete-dialog {
			gap: 0.6rem;
			border-radius: 0.75rem 0.75rem 0 0;
			padding: 0.75rem;
		}
		.dialog-backdrop {
			align-items: end;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.spin) {
			animation-duration: 1.8s;
		}
	}
</style>
