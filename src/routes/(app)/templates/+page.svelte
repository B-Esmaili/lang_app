<script lang="ts">
	import { TemplateEditor } from '$lib/features/template-editor';
	let { data } = $props();
</script>

<svelte:head><title>Template studio · Learning studio</title></svelte:head>
<TemplateEditor initialTemplates={data.templates} />
