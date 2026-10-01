<script lang="ts">
	import { AudioLines, Settings2, Sparkles, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		anchorRichTextDocument,
		createRichTextDocument
	} from '$lib/components/rich-text';
	import {
		courseMediaResourceCues,
		type CourseMediaResource
	} from '$lib/domain/course-media-resource';
	import type { AnyWidgetContent, WidgetInstance } from '../model/types';

	type RichTextInstance = WidgetInstance<'content.rich-text'>;

	let {
		widget,
		mediaResources = [],
		onClose,
		onContentChange,
		onGenerateTranscription = undefined
	}: {
		widget: WidgetInstance;
		mediaResources?: readonly CourseMediaResource[];
		onClose: () => void;
		onContentChange: (content: AnyWidgetContent) => void;
		onGenerateTranscription?: (
			resource: CourseMediaResource
		) => Promise<CourseMediaResource | null>;
	} = $props();
	let transcriptionPending = $state(false);
	let transcriptionError = $state<string | null>(null);

	const richTextWidget = $derived(
		widget?.type === 'content.rich-text' ? (widget as RichTextInstance) : null
	);
	const audioResources = $derived(mediaResources.filter((resource) => resource.kind === 'audio'));
	const selectedResource = $derived(
		richTextWidget
			? (audioResources.find(
					(resource) => resource.name === richTextWidget.content.highlightResourceName
				) ?? null)
			: null
	);
	const cues = $derived(selectedResource ? courseMediaResourceCues(selectedResource) : []);

	function updateRichText(content: RichTextInstance['content']) {
		onContentChange(content);
	}

	function selectHighlightResource(event: Event) {
		if (!richTextWidget) return;
		const name = (event.currentTarget as HTMLSelectElement).value || undefined;
		updateRichText({ ...richTextWidget.content, highlightResourceName: name });
	}

	function writeTranscriptionToRichText(resource: CourseMediaResource) {
		const resourceCues = courseMediaResourceCues(resource);
		const transcription = resource.transcribedText;
		const text =
			transcription?.text.trim() || transcription?.tokens.map((token) => token.text).join(' ').trim();
		if (!richTextWidget || !text || !resourceCues.length) return false;
		updateRichText({
			...richTextWidget.content,
			document: anchorRichTextDocument(createRichTextDocument([{ text }]), resourceCues)
		});
		return true;
	}

	async function generateTranscription() {
		if (!selectedResource || !onGenerateTranscription || transcriptionPending) return;
		transcriptionPending = true;
		transcriptionError = null;
		try {
			const updated = await onGenerateTranscription(selectedResource);
			if (updated && !writeTranscriptionToRichText(updated))
				transcriptionError =
					'The generated transcription did not include usable text and word timings.';
		} catch (error) {
			transcriptionError =
				error instanceof Error ? error.message : 'The audio transcription could not be generated.';
		} finally {
			transcriptionPending = false;
		}
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={keydown} />

<div
	class="drawer-backdrop"
	role="presentation"
	onclick={(event) => event.target === event.currentTarget && onClose()}
>
	<div
		class="properties-drawer"
		role="dialog"
		aria-modal="true"
		aria-labelledby="widget-properties-title"
		tabindex="-1"
	>
			<div class="drawer-heading">
				<span class="drawer-icon"><Settings2 size={17} /></span>
				<div>
					<p>Widget properties</p>
					<h2 id="widget-properties-title">{richTextWidget ? 'Rich text' : widget.type}</h2>
				</div>
				<Button type="button" variant="ghost" size="icon-sm" aria-label="Close widget properties" onclick={onClose}><X /></Button>
			</div>
			<div class="drawer-description">
				<p>Settings affect the selected widget without interrupting the lesson canvas.</p>
			</div>

			<div class="drawer-body">
				{#if richTextWidget}
					<fieldset>
						<legend>Automatic highlighting</legend>
						<p class="field-help">Link an imported audio resource, then generate its transcription to write and mark the RichText content for playback.</p>
						<label class="field-label">
							<span>Highlight media source</span>
							<select
								value={richTextWidget.content.highlightResourceName ?? ''}
								onchange={selectHighlightResource}
							>
								<option value="">No automatic highlighting</option>
								{#each audioResources as resource (resource.id)}
									<option value={resource.name}>{resource.name} · {resource.mediaName}</option>
								{/each}
							</select>
						</label>
						{#if selectedResource}
							<div class="source-status" class:ready={cues.length > 0}>
								<AudioLines size={15} />
								<span>{cues.length ? `${cues.length} timing cues ready` : 'This resource needs transcript timings.'}</span>
							</div>
						{/if}
						<Button
							type="button"
							variant="secondary"
							disabled={!selectedResource || !onGenerateTranscription || transcriptionPending}
							onclick={generateTranscription}
						>{#if transcriptionPending}<Sparkles class="spin" data-icon="inline-start" />Generating transcription…{:else}<Sparkles data-icon="inline-start" />Generate transcription from audio{/if}</Button
						>
						{#if transcriptionError}
							<p class="field-error" role="alert">{transcriptionError}</p>
						{/if}
						{#if !audioResources.length}
							<p class="field-help">Import an audio resource in the course Resources tab to make it available here.</p>
						{:else if !onGenerateTranscription}
							<p class="field-help">Audio transcription is available while editing the course.</p>
						{/if}
					</fieldset>
				{:else}
					<div class="empty-properties"><Settings2 size={20} /><strong>No additional properties</strong><p>This widget’s content is edited directly on the canvas.</p></div>
				{/if}
			</div>
			<footer><Button type="button" onclick={onClose}>Done</Button></footer>
	</div>
</div>

<style>
	.drawer-backdrop { position: fixed; z-index: 110; inset: 0; display: flex; justify-content: flex-end; background: color-mix(in oklab, #17141e 28%, transparent); backdrop-filter: blur(0.0625rem); }
	.properties-drawer { display: flex; flex-direction: column; inline-size: min(100%, 25rem); block-size: 100%; border-inline-start: 0.0625rem solid var(--border); background: var(--background); color: var(--foreground); box-shadow: -1rem 0 3rem color-mix(in oklab, #17141e 18%, transparent); outline: none; }
	.drawer-heading { display: flex; align-items: center; gap: 0.65rem; border-block-end: 0.0625rem solid var(--border); padding: 1rem 1rem 0.7rem; }
	.drawer-icon { display: grid; inline-size: 2rem; block-size: 2rem; place-items: center; border-radius: 0.55rem; background: color-mix(in oklab, var(--editor-selection) 14%, transparent); color: var(--editor-selection); }
	.drawer-heading > div { display: grid; flex: 1; gap: 0.06rem; }
	.drawer-heading p { margin: 0; color: var(--muted-foreground); font-size: 0.58rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; }
	.drawer-heading h2 { margin: 0; font-size: 0.96rem; letter-spacing: -0.015em; }
	.drawer-description { margin: 0; padding: 0.55rem 1rem; border-block-end: 0.0625rem solid var(--border); color: var(--muted-foreground); font-size: 0.67rem; line-height: 1.45; }
	.drawer-description p { margin: 0; }
	.drawer-body { flex: 1; overflow: auto; padding: 1rem; }
	fieldset { display: grid; gap: 0.65rem; margin: 0; padding: 0; border: 0; }
	legend { padding: 0; font-size: 0.78rem; font-weight: 700; }
	.field-help { margin: -0.35rem 0 0; color: var(--muted-foreground); font-size: 0.65rem; line-height: 1.45; }
	.field-error { margin: -0.25rem 0 0; color: var(--destructive); font-size: 0.65rem; line-height: 1.45; }
	.field-label { display: grid; gap: 0.25rem; color: var(--muted-foreground); font-size: 0.66rem; font-weight: 650; }
	.field-label select { inline-size: 100%; min-block-size: 2.2rem; border: 0.0625rem solid var(--border); border-radius: 0.5rem; padding-inline: 0.55rem; background: var(--background); color: var(--foreground); font: inherit; font-size: 0.75rem; }
	.field-label select:focus-visible { outline: 0.125rem solid var(--ring); outline-offset: 0.06rem; }
	.source-status { display: flex; align-items: center; gap: 0.4rem; border-radius: 0.5rem; padding: 0.5rem; background: color-mix(in oklab, var(--muted) 65%, transparent); color: var(--muted-foreground); font-size: 0.64rem; }
	.source-status.ready { background: color-mix(in oklab, var(--studio-sage, #e8f1eb) 78%, transparent); color: var(--studio-green, #52816c); }
	.empty-properties { display: grid; min-block-size: 12rem; place-items: center; align-content: center; gap: 0.45rem; color: var(--muted-foreground); text-align: center; }
	.empty-properties strong { color: var(--foreground); font-size: 0.75rem; }
	.empty-properties p { max-inline-size: 17rem; margin: 0; font-size: 0.65rem; line-height: 1.45; }
	footer { display: flex; justify-content: flex-end; border-block-start: 0.0625rem solid var(--border); padding: 0.75rem 1rem; }
	:global(.spin) { animation: widget-properties-spin 900ms linear infinite; }
	@keyframes widget-properties-spin { to { transform: rotate(1turn); } }
	@media (max-width: 32rem) {
		.drawer-heading { padding: 0.85rem 0.75rem 0.65rem; }
		.drawer-description { padding-inline: 0.75rem; }
		.drawer-body { padding: 0.75rem; }
		footer { padding: 0.65rem 0.75rem calc(0.65rem + env(safe-area-inset-bottom)); }
	}
</style>
