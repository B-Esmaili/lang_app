<script lang="ts">
	import type { PassageAnnotation } from '../../../model/types';
	import { segmentAnnotatedText, type AnnotatedTextSegment } from '../annotation-segments';
	import type { TextTag } from './model';
	let {
		value,
		annotations = [],
		tag = 'div',
		language = 'en',
		direction = 'auto',
		class: className = '',
		placeholder = ''
	}: {
		value: string;
		annotations?: PassageAnnotation[];
		tag?: TextTag;
		language?: string;
		direction?: 'auto' | 'ltr' | 'rtl';
		class?: string;
		placeholder?: string;
	} = $props();
	const segments = $derived(segmentAnnotatedText(value, annotations));
	function layers(segment: AnnotatedTextSegment) {
		return [
			...(segment.strong ? [{ tag: 'strong', kind: 'strong' }] : []),
			...(segment.emphasis ? [{ tag: 'em', kind: 'emphasis' }] : []),
			...(segment.highlight ? [{ tag: 'mark', kind: 'highlight' }] : []),
			...(segment.underline ? [{ tag: 'u', kind: 'underline' }] : []),
			...(segment.vocabulary ? [{ tag: 'span', kind: 'vocabulary' }] : [])
		];
	}
</script>

{#snippet marked(segment: AnnotatedTextSegment, marks: ReturnType<typeof layers>, at = 0)}
	{#if at < marks.length}
		<svelte:element
			this={marks[at].tag}
			class={`editable-mark-${marks[at].kind}`}
			data-tone={marks[at].kind === 'highlight' ? (segment.highlightTone ?? 'yellow') : undefined}
		>
			{@render marked(segment, marks, at + 1)}
		</svelte:element>
	{:else}{segment.text}{/if}
{/snippet}

<svelte:element
	this={tag}
	class={`editable-text content-language ${className}`}
	lang={language}
	dir={direction}
	data-placeholder={placeholder}
>
	{#each segments as segment (segment.start)}
		<span data-annotation-ids={segment.annotationIds || undefined}
			>{@render marked(segment, layers(segment))}</span
		>
	{/each}
</svelte:element>
