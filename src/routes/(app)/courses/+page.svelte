<script lang="ts">
	import { CoursesPage } from '$lib/features/course-builder';
	let { data } = $props();
</script>

<svelte:head><title>Courses · Learning studio</title></svelte:head>
<CoursesPage initialCourses={data.courses} />
