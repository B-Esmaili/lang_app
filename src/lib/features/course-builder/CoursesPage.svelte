<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { BookPlus, Plus, Search, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import CourseCard from './CourseCard.svelte';
	import type { CourseBuilderData, CourseSummary } from './model';

	let { initialCourses = [] }: { initialCourses?: CourseSummary[] } = $props();
	let courses = $state<CourseSummary[]>(untrack(() => initialCourses));
	let query = $state('');
	let dialogOpen = $state(false);
	let title = $state('');
	let description = $state('');
	let language = $state('en');
	let direction = $state<'auto' | 'ltr' | 'rtl'>('auto');
	let busy = $state(false);
	let message = $state<string | null>(null);

	const filtered = $derived(
		courses.filter((course) =>
			`${course.title} ${course.description} ${course.language}`
				.toLocaleLowerCase()
				.includes(query.toLocaleLowerCase())
		)
	);

	async function createCourse(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		message = null;
		try {
			const response = await fetch('/api/courses', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title, description, language, direction })
			});
			const body = (await response.json().catch(() => null)) as
				CourseBuilderData | { error?: string } | null;
			if (!response.ok || !body || !('course' in body)) {
				throw new Error(
					body && 'error' in body && body.error ? body.error : 'Could not create the course.'
				);
			}
			await goto(resolve('/(app)/builder/[courseId]', { courseId: body.course.id }));
		} catch (error) {
			message = error instanceof Error ? error.message : 'Could not create the course.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="courses-page">
	<header class="intro">
		<div>
			<p class="eyebrow">Course builder</p>
			<h1>Shape a learning path</h1>
			<p>
				Arrange lessons as a clear flow, then compose each one with responsive frames and widgets.
			</p>
		</div>
		<Button onclick={() => (dialogOpen = true)}><Plus data-icon="inline-start" /> New course</Button
		>
	</header>

	<div class="tools">
		<label
			><Search size={17} /><span class="sr-only">Search courses</span><input
				bind:value={query}
				type="search"
				placeholder="Search courses…"
			/></label
		>
		<span>{filtered.length} {filtered.length === 1 ? 'course' : 'courses'}</span>
	</div>

	{#if filtered.length > 0}
		<div class="course-grid">
			{#each filtered as course (course.id)}
				<CourseCard {course} href={`/builder/${course.id}`} />
			{/each}
		</div>
	{:else}
		<section class="empty">
			<span><BookPlus size={24} /></span>
			<h2>{query ? 'No course matches that search' : 'Create your first course'}</h2>
			<p>
				{query
					? 'Try a different title or language.'
					: 'Start with a title; the builder creates a blank, borderless lesson frame for you.'}
			</p>
			{#if !query}<Button onclick={() => (dialogOpen = true)}>Create course</Button>{/if}
		</section>
	{/if}
</div>

{#if dialogOpen}
	<div
		class="backdrop"
		role="presentation"
		onclick={(event) => event.target === event.currentTarget && !busy && (dialogOpen = false)}
	>
		<div
			class="dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="create-course-title"
			tabindex="-1"
		>
			<header>
				<div>
					<p class="eyebrow">New learning path</p>
					<h2 id="create-course-title">Create a course</h2>
				</div>
				<Button variant="ghost" size="icon" aria-label="Close" onclick={() => (dialogOpen = false)}
					><X /></Button
				>
			</header>
			<form onsubmit={createCourse}>
				<label
					><span>Course title</span><input
						bind:value={title}
						required
						maxlength="180"
						dir={direction}
						lang={language}
					/></label
				>
				<label
					><span>Short description</span><textarea
						bind:value={description}
						rows="3"
						maxlength="2000"
						dir={direction}
						lang={language}></textarea></label
				>
				<div class="field-pair">
					<label
						><span>Content language</span><select bind:value={language}
							><option value="en">English</option><option value="fa">فارسی · Persian</option><option
								value="ar">العربية · Arabic</option
							></select
						></label
					>
					<label
						><span>Writing direction</span><select bind:value={direction}
							><option value="auto">Automatic</option><option value="ltr">Left to right</option
							><option value="rtl">Right to left</option></select
						></label
					>
				</div>
				{#if message}<p class="error" role="alert">{message}</p>{/if}
				<footer>
					<Button type="button" variant="ghost" onclick={() => (dialogOpen = false)}>Cancel</Button
					><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Open builder'}</Button>
				</footer>
			</form>
		</div>
	</div>
{/if}

<style>
	.courses-page {
		display: grid;
		gap: clamp(1.2rem, 2.5vw, 2rem);
		inline-size: min(100%, 84rem);
		margin-inline: auto;
	}
	.intro,
	.tools,
	.dialog header,
	.dialog footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.intro > div {
		max-inline-size: 45rem;
	}
	.eyebrow,
	h1,
	h2,
	.intro p,
	.error {
		margin: 0;
	}
	.eyebrow {
		margin-block-end: 0.2rem;
		color: var(--editor-selection);
		font-size: 0.67rem;
		font-weight: 760;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h1 {
		font-size: clamp(1.65rem, 4vw, 2.65rem);
		letter-spacing: -0.05em;
	}
	.intro > div > p:last-child {
		margin-block-start: 0.45rem;
		color: var(--muted-foreground);
		font-size: 0.84rem;
		line-height: 1.55;
	}
	.tools {
		border-block: 0.0625rem solid color-mix(in oklab, var(--border) 72%, transparent);
		padding-block: 0.75rem;
		color: var(--muted-foreground);
		font-size: 0.72rem;
	}
	.tools label {
		display: flex;
		inline-size: min(100%, 24rem);
		align-items: center;
		gap: 0.55rem;
	}
	.tools input {
		inline-size: 100%;
		border: 0;
		background: transparent;
		color: var(--foreground);
		outline: none;
	}
	.course-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 25rem), 1fr));
		gap: 1rem;
	}
	.empty {
		display: grid;
		min-block-size: 23rem;
		place-items: center;
		align-content: center;
		gap: 0.65rem;
		text-align: center;
	}
	.empty > span {
		display: grid;
		inline-size: 3.4rem;
		block-size: 3.4rem;
		place-items: center;
		border-radius: 1rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}
	.empty p {
		max-inline-size: 27rem;
		margin: 0 0 0.45rem;
		color: var(--muted-foreground);
		font-size: 0.8rem;
	}
	.backdrop {
		position: fixed;
		z-index: 90;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: #17141f70;
		backdrop-filter: blur(0.35rem);
	}
	.dialog {
		inline-size: min(100%, 35rem);
		border: 0.0625rem solid var(--border);
		border-radius: 1.25rem;
		padding: 1.25rem;
		background: var(--card);
		box-shadow: 0 2rem 6rem #16111f4a;
	}
	.dialog h2 {
		font-size: 1.4rem;
	}
	.dialog form,
	.dialog label {
		display: grid;
	}
	.dialog form {
		gap: 1rem;
		margin-block-start: 1.2rem;
	}
	.dialog label {
		gap: 0.4rem;
		font-size: 0.75rem;
		font-weight: 650;
	}
	.dialog input,
	.dialog textarea,
	.dialog select {
		inline-size: 100%;
		border: 0.0625rem solid var(--input);
		border-radius: 0.72rem;
		padding: 0.72rem 0.78rem;
		background: var(--background);
		color: var(--foreground);
		font: inherit;
		outline: none;
		resize: vertical;
	}
	.dialog input:focus,
	.dialog textarea:focus,
	.dialog select:focus {
		border-color: var(--editor-selection);
		box-shadow: 0 0 0 0.2rem var(--editor-selection-soft);
	}
	.field-pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.8rem;
	}
	.dialog footer {
		justify-content: flex-end;
		margin-block-start: 0.25rem;
	}
	.error {
		border-radius: 0.6rem;
		padding: 0.65rem;
		background: color-mix(in oklab, var(--destructive) 10%, transparent);
		color: var(--destructive);
		font-size: 0.74rem;
	}
	.sr-only {
		position: absolute;
		inline-size: 0.0625rem;
		block-size: 0.0625rem;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
	}
	@media (max-width: 38rem) {
		.intro {
			align-items: flex-start;
		}
		.intro > div > p:last-child {
			display: none;
		}
		.field-pair {
			grid-template-columns: 1fr;
		}
	}
</style>
