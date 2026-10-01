<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowUpRight, BookOpenText, Clock3, Languages } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import type { CourseSummary } from './model';

	type CourseHref = (`/builder/${string}` | `/learn/${string}`) & {};

	let { course, href }: { course: CourseSummary; href: CourseHref } = $props();

	const updated = $derived(
		new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(course.updatedAt))
	);
</script>

<a href={resolve(href)} class="course-card" data-accent={course.accent}>
	<div class="cover" aria-hidden="true">
		<span class="cover-language">{course.language.toLocaleUpperCase()}</span>
		<div class="cover-lines"><i></i><i></i><i></i></div>
		<span class="cover-mark"><Languages size={24} strokeWidth={1.5} /></span>
	</div>
	<div class="course-body">
		<header>
			<Badge variant={course.status === 'published' ? 'secondary' : 'outline'}
				>{course.status}</Badge
			>
			<ArrowUpRight size={17} strokeWidth={1.7} />
		</header>
		<div class="course-copy" lang={course.language} dir={course.direction}>
			<h3>{course.title}</h3>
			<p>{course.description || 'A new course ready for its first learning experience.'}</p>
		</div>
		<footer dir="ltr">
			<span
				><BookOpenText size={14} />{course.lessonCount}
				{course.lessonCount === 1 ? 'lesson' : 'lessons'}</span
			>
			<span><Clock3 size={14} />{updated}</span>
		</footer>
	</div>
</a>

<style>
	.course-card {
		display: grid;
		grid-template-columns: minmax(8.5rem, 34%) 1fr;
		min-block-size: 12.5rem;
		overflow: hidden;
		border: 0.0625rem solid color-mix(in oklab, var(--border) 82%, transparent);
		border-radius: 1.15rem;
		background: color-mix(in oklab, var(--card) 96%, transparent);
		color: var(--foreground);
		box-shadow: 0 1.3rem 3.2rem -2.8rem color-mix(in oklab, var(--foreground) 30%, transparent);
		text-decoration: none;
		transition:
			transform 160ms ease,
			box-shadow 160ms ease,
			border-color 160ms ease;
	}

	.course-card:hover,
	.course-card:focus-visible {
		border-color: color-mix(in oklab, var(--editor-selection) 40%, var(--border));
		box-shadow: 0 1.5rem 3rem -2.3rem color-mix(in oklab, var(--editor-selection) 28%, transparent);
		outline: none;
		transform: translateY(-0.15rem);
	}

	.cover {
		display: grid;
		position: relative;
		overflow: hidden;
		align-content: space-between;
		padding: 1rem;
		background: linear-gradient(145deg, #eee7f6, #ded2ec);
		color: #664e8d;
	}

	.course-card[data-accent='sage'] .cover {
		background: linear-gradient(145deg, #eaf3ed, #ccdfd2);
		color: #4f7762;
	}
	.course-card[data-accent='sun'] .cover {
		background: linear-gradient(145deg, #faf0c9, #f0dca6);
		color: #866a2c;
	}

	.cover::after {
		position: absolute;
		inline-size: 8rem;
		block-size: 8rem;
		border: 0.0625rem solid currentColor;
		border-radius: 50%;
		content: '';
		opacity: 0.15;
		inset-block-end: -4rem;
		inset-inline-end: -3rem;
	}

	.cover-language {
		font-size: 0.64rem;
		font-weight: 760;
		letter-spacing: 0.13em;
	}
	.cover-mark {
		display: grid;
		position: relative;
		z-index: 1;
		inline-size: 3rem;
		block-size: 3rem;
		place-items: center;
		border-radius: 50%;
		background: #ffffff99;
	}
	.cover-lines {
		display: grid;
		gap: 0.35rem;
		opacity: 0.36;
	}
	.cover-lines i {
		block-size: 0.22rem;
		border-radius: 1rem;
		background: currentColor;
	}
	.cover-lines i:nth-child(2) {
		inline-size: 72%;
	}
	.cover-lines i:nth-child(3) {
		inline-size: 48%;
	}

	.course-body {
		display: grid;
		min-inline-size: 0;
		align-content: space-between;
		gap: 1rem;
		padding: 1rem 1.1rem;
	}
	.course-body > header,
	footer,
	footer span {
		display: flex;
		align-items: center;
	}
	.course-body > header {
		justify-content: space-between;
		color: var(--muted-foreground);
	}
	.course-copy {
		min-inline-size: 0;
		text-align: start;
	}
	.course-copy:lang(fa),
	.course-copy:lang(ar) {
		font-family: var(--font-arabic);
	}
	h3 {
		margin: 0;
		overflow: hidden;
		font-size: clamp(1rem, 2vw, 1.24rem);
		font-weight: 700;
		letter-spacing: -0.025em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.course-copy p {
		display: -webkit-box;
		margin: 0.38rem 0 0;
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.55;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}
	footer {
		justify-content: space-between;
		gap: 0.7rem;
		color: var(--muted-foreground);
		font-size: 0.66rem;
	}
	footer span {
		gap: 0.32rem;
	}

	@media (max-width: 34rem) {
		.course-card {
			grid-template-columns: 6.7rem 1fr;
			min-block-size: 10.5rem;
		}
		.cover {
			padding: 0.75rem;
		}
		.course-body {
			padding: 0.85rem;
		}
		footer span:last-child {
			display: none;
		}
	}
</style>
