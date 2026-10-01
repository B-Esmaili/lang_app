<script lang="ts">
	import { CourseBuilder } from '$lib/features/course-builder';
	let { data } = $props();
</script>

<svelte:head><title>{data.builder.course.title} · Course builder</title></svelte:head>
<CourseBuilder initialData={data.builder} nativeLanguage={data.nativeLanguage} />
