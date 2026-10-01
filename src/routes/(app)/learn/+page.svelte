<script lang="ts">
	import { BookOpenCheck } from '@lucide/svelte';
	import { CourseCard } from '$lib/features/course-builder';
	let { data } = $props();
</script>

<svelte:head><title>My learning · Learning studio</title></svelte:head>
<div class="learning-page">
	<header>
		<p>My learning</p>
		<h1>Continue where you left off</h1>
		<span>Your published, active courses appear here.</span>
	</header>
	{#if data.courses.length}
		<div class="grid">
			{#each data.courses as course (course.id)}<CourseCard
					{course}
					href={`/learn/${course.id}`}
				/>{/each}
		</div>
	{:else}
		<section>
			<i><BookOpenCheck size={25} /></i>
			<h2>No active courses yet</h2>
			<p>Your teacher can enroll you in a published course.</p>
		</section>
	{/if}
</div>

<style>
	.learning-page {
		display: grid;
		gap: 1.5rem;
		inline-size: min(100%, 82rem);
		margin-inline: auto;
	}
	header p,
	header h1,
	header span {
		margin: 0;
	}
	header p {
		color: var(--editor-selection);
		font-size: 0.68rem;
		font-weight: 760;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	header h1 {
		margin-block: 0.2rem 0.4rem;
		font-size: clamp(1.65rem, 4vw, 2.6rem);
		letter-spacing: -0.05em;
	}
	header span {
		color: var(--muted-foreground);
		font-size: 0.82rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 25rem), 1fr));
		gap: 1rem;
	}
	section {
		display: grid;
		min-block-size: 24rem;
		place-items: center;
		align-content: center;
		gap: 0.55rem;
		text-align: center;
	}
	section i {
		display: grid;
		inline-size: 3.3rem;
		block-size: 3.3rem;
		place-items: center;
		border-radius: 1rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}
	section h2,
	section p {
		margin: 0;
	}
	section h2 {
		font-size: 1rem;
	}
	section p {
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}
</style>
