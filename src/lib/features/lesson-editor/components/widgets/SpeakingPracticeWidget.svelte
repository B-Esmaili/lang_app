<script lang="ts">
	import SpeakingPractice from '$lib/features/speaking-practice/SpeakingPractice.svelte';
	import type { SpeakingSentence } from '$lib/features/speaking-practice/model';
	import type { WidgetInstance } from '../../model/types';
	import WidgetSurface from './WidgetSurface.svelte';

	type SpeakingPracticeInstance = WidgetInstance<'language.speaking-practice'>;

	let {
		widget,
		selected = false,
		editing = false,
		sentences = [],
		onSelect,
		onContentChange
	}: {
		widget: SpeakingPracticeInstance;
		selected?: boolean;
		editing?: boolean;
		sentences?: readonly SpeakingSentence[];
		onSelect: () => void;
		onContentChange: (content: SpeakingPracticeInstance['content']) => void;
	} = $props();
</script>

<WidgetSurface widgetType={widget.type} label="Speaking Practice" {selected} {editing} {onSelect}>
	<SpeakingPractice
		{sentences}
		configuration={widget.content}
		{editing}
		onConfigurationChange={(configuration) => {
			if (editing) onContentChange({ ...widget.content, ...configuration });
		}}
	/>
</WidgetSurface>
