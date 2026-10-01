<script lang="ts">
	import { CourseReader } from '$lib/features/course-builder';
	let { data } = $props();
</script>

<svelte:head><title>{data.reader.course.title} · Learning studio</title></svelte:head>
<CourseReader
	initialData={data.reader}
	nativeLanguage={data.nativeLanguage}
	viewerId={data.viewerId}
/>
