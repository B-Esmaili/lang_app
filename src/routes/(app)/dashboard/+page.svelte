<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, BookOpenText, LayoutTemplate, Sparkles, UsersRound } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { CourseCard } from '$lib/features/course-builder';
	let { data } = $props();

	const author = $derived(data.viewer.role === 'admin' || data.viewer.role === 'teacher');
	const published = $derived(data.courses.filter((course) => course.status === 'published').length);
	const lessons = $derived(data.courses.reduce((total, course) => total + course.lessonCount, 0));
</script>

<svelte:head><title>Overview · Learning studio</title></svelte:head>

<div class="dashboard">
	<section class="welcome">
		<div class="welcome-copy">
			<Badge variant="secondary"
				>{data.viewer.role === 'student' ? 'Learning space' : 'Creative workspace'}</Badge
			>
			<h1>Welcome back, <em>{data.viewer.name.split(' ')[0]}</em></h1>
			<p>
				{author
					? 'Build a lesson where text, sound, and visual ideas share the same calm document.'
					: 'Your next lesson is ready whenever you are.'}
			</p>
			<div class="welcome-actions">
				{#if author}<Button href="/courses"
						><Sparkles data-icon="inline-start" />Build a course</Button
					><Button href="/templates" variant="outline" class="hero-secondary-action"
						><LayoutTemplate data-icon="inline-start" />Design a template</Button
					>{:else}<Button href="/learn"
						>Continue learning <ArrowRight data-icon="inline-end" /></Button
					>{/if}
			</div>
		</div>
		<div class="hero-layout" aria-hidden="true">
			<div class="hero-paper">
				<span>LANGUAGE LESSON</span>
				<h2>Every phrase has a rhythm.</h2>
				<p>Listen · notice · respond</p>
				<div class="hero-wave">
					{#each [30, 55, 38, 76, 48, 88, 42, 68, 35, 58, 30] as height, index (index)}<i
							style={`--h:${height}%`}
						></i>{/each}
				</div>
			</div>
			<div class="hero-note" dir="rtl" lang="fa">آهنگ واژه‌ها را پیدا کنید</div>
		</div>
	</section>

	<section class="metrics" aria-label="Workspace summary">
		<article>
			<span><BookOpenText size={18} /></span>
			<div>
				<strong>{data.courses.length}</strong><small>{author ? 'Courses' : 'Active courses'}</small>
			</div>
		</article>
		<article>
			<span><Sparkles size={18} /></span>
			<div><strong>{lessons}</strong><small>Learning lessons</small></div>
		</article>
		<article>
			<span><LayoutTemplate size={18} /></span>
			<div><strong>{published}</strong><small>Published paths</small></div>
		</article>
		{#if data.viewer.role === 'admin'}<a href={resolve('/admin/users')}
				><span><UsersRound size={18} /></span>
				<div><strong>Manage</strong><small>People & access</small></div>
				<ArrowRight size={16} /></a
			>{/if}
	</section>

	<section class="recent">
		<header>
			<div>
				<p>{author ? 'Recent work' : 'Your courses'}</p>
				<h2>
					{data.courses.length ? (author ? 'Keep creating' : 'Keep learning') : 'A clean beginning'}
				</h2>
			</div>
			{#if data.courses.length}<Button
					href={author ? '/courses' : '/learn'}
					variant="ghost"
					size="sm">View all <ArrowRight data-icon="inline-end" /></Button
				>{/if}
		</header>
		{#if data.courses.length}
			<div class="course-grid">
				{#each data.courses.slice(0, 3) as course (course.id)}<CourseCard
						{course}
						href={author ? `/builder/${course.id}` : `/learn/${course.id}`}
					/>{/each}
			</div>
		{:else}
			<div class="empty">
				<span><Sparkles size={21} /></span>
				<div>
					<strong>{author ? 'Create the first course' : 'No courses have been assigned yet'}</strong
					>
					<p>
						{author
							? 'We will begin with a blank borderless frame. Add a tailored template whenever the lesson needs more structure.'
							: 'Your teacher will make a learning path available here.'}
					</p>
				</div>
				{#if author}<Button href="/courses" variant="outline">Start building</Button>{/if}
			</div>
		{/if}
	</section>

	<section class="principles">
		<p>Built into the studio</p>
		<div>
			<article>
				<b>01</b><strong>Flow first</strong><span>Lessons grow one frame at a time.</span>
			</article>
			<article>
				<b>02</b><strong>Responsive by design</strong><span
					>Desktop, tablet, and phone stay intentional.</span
				>
			</article>
			<article dir="rtl" lang="fa">
				<b>۰۳</b><strong>راست‌به‌چپ واقعی</strong><span>فارسی و عربی در قلب ویرایشگر هستند.</span>
			</article>
		</div>
	</section>
</div>

<style>
	.dashboard {
		display: grid;
		gap: clamp(1rem, 2.4vw, 1.8rem);
		inline-size: min(100%, 88rem);
		margin-inline: auto;
	}
	.welcome {
		display: grid;
		grid-template-columns: minmax(0, 1.05fr) minmax(20rem, 0.95fr);
		min-block-size: 22rem;
		overflow: hidden;
		border-radius: 1.35rem;
		background: #292633;
		color: #f8f5fa;
		box-shadow: 0 2rem 5rem -3rem #231c2f8f;
	}
	.welcome-copy {
		align-self: center;
		padding: clamp(1.5rem, 4vw, 3.3rem);
	}
	.welcome-copy :global([data-slot='badge']) {
		background: #3e3949;
		color: #d7ccdf;
	}
	.welcome h1 {
		margin: 0.85rem 0 0.65rem;
		font-size: clamp(2rem, 4.8vw, 4rem);
		font-weight: 600;
		letter-spacing: -0.06em;
		line-height: 1;
	}
	.welcome h1 em {
		color: #bda8d8;
		font-family: Georgia, serif;
		font-weight: 450;
	}
	.welcome-copy > p {
		max-inline-size: 38rem;
		margin: 0;
		color: #b8b1bd;
		font-size: 0.88rem;
		line-height: 1.65;
	}
	.welcome-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
		margin-block-start: 1.35rem;
	}
	.welcome-actions :global([data-slot='button']:first-child) {
		background: #8b70bb;
	}
	.welcome-actions :global(.hero-secondary-action) {
		border-color: #ffffff55;
		background: transparent;
		color: #f8f5fa;
	}
	.welcome-actions :global(.hero-secondary-action:hover) {
		border-color: #ffffff80;
		background: #ffffff14;
		color: #fff;
	}
	.hero-layout {
		position: relative;
		min-block-size: 22rem;
		background: radial-gradient(circle at 50% 45%, #8770aa55, transparent 55%);
	}
	.hero-paper {
		position: absolute;
		inset: 12% 8% 10% 4%;
		border-radius: 1rem;
		padding: clamp(1.2rem, 3vw, 2rem);
		background: #f8f6f1;
		color: #39343d;
		box-shadow: 0 2.2rem 5rem #11101570;
		transform: rotate(2deg);
	}
	.hero-paper > span {
		color: #8065b4;
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.13em;
	}
	.hero-paper h2 {
		max-inline-size: 19rem;
		margin: 1.2rem 0 0.35rem;
		font-family: Georgia, serif;
		font-size: clamp(1.4rem, 3vw, 2.2rem);
		font-weight: 500;
		line-height: 1.05;
	}
	.hero-paper p {
		margin: 0;
		color: #8b838d;
		font-size: 0.65rem;
	}
	.hero-wave {
		display: flex;
		block-size: 4.2rem;
		align-items: center;
		gap: 0.3rem;
		margin-block-start: 1.2rem;
	}
	.hero-wave i {
		inline-size: 0.24rem;
		block-size: var(--h);
		border-radius: 2rem;
		background: #ad96cb;
	}
	.hero-note {
		position: absolute;
		inset-inline-end: 3%;
		inset-block-end: 6%;
		border-radius: 0.7rem;
		padding: 0.7rem 0.9rem;
		background: #e5f0e8;
		color: #53705d;
		font-family: var(--font-arabic);
		font-size: 0.72rem;
		box-shadow: 0 1rem 2rem #15111d40;
		transform: rotate(-3deg);
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.65rem;
	}
	.metrics article,
	.metrics a {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		border: 0.0625rem solid var(--border);
		border-radius: 0.9rem;
		padding: 0.8rem;
		background: color-mix(in oklab, var(--card) 94%, transparent);
		color: var(--foreground);
		text-decoration: none;
	}
	.metrics article > span,
	.metrics a > span {
		display: grid;
		inline-size: 2.35rem;
		block-size: 2.35rem;
		place-items: center;
		border-radius: 0.72rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}
	.metrics div {
		display: grid;
	}
	.metrics strong {
		font-size: 0.9rem;
	}
	.metrics small {
		color: var(--muted-foreground);
		font-size: 0.62rem;
	}
	.metrics a > :global(svg) {
		margin-inline-start: auto;
		color: var(--muted-foreground);
	}
	.recent {
		display: grid;
		gap: 1rem;
	}
	.recent > header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}
	.recent header p,
	.recent header h2 {
		margin: 0;
	}
	.recent header p,
	.principles > p {
		color: var(--editor-selection);
		font-size: 0.62rem;
		font-weight: 760;
		letter-spacing: 0.11em;
		text-transform: uppercase;
	}
	.recent header h2 {
		margin-block-start: 0.15rem;
		font-size: clamp(1.2rem, 2vw, 1.55rem);
	}
	.course-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		gap: 0.8rem;
	}
	.empty {
		display: flex;
		align-items: center;
		gap: 1rem;
		min-block-size: 8rem;
		border: 0.08rem dashed color-mix(in oklab, var(--editor-selection) 30%, var(--border));
		border-radius: 1rem;
		padding: 1rem;
		background: color-mix(in oklab, var(--card) 75%, transparent);
	}
	.empty > span {
		display: grid;
		inline-size: 2.8rem;
		block-size: 2.8rem;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 0.8rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}
	.empty > div {
		flex: 1;
	}
	.empty strong {
		font-size: 0.8rem;
	}
	.empty p {
		margin: 0.2rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.68rem;
		line-height: 1.5;
	}
	.principles {
		border-block-start: 0.0625rem solid var(--border);
		padding-block-start: 1rem;
	}
	.principles > p {
		margin: 0 0 0.65rem;
	}
	.principles > div {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.65rem;
	}
	.principles article {
		display: grid;
		gap: 0.15rem;
		min-inline-size: 0;
		border-radius: 0.8rem;
		padding: 0.8rem;
		background: color-mix(in oklab, var(--muted) 58%, transparent);
		text-align: start;
	}
	.principles b {
		color: var(--editor-selection);
		font-size: 0.55rem;
	}
	.principles strong {
		font-size: 0.72rem;
	}
	.principles span {
		color: var(--muted-foreground);
		font-size: 0.62rem;
		line-height: 1.45;
	}
	@media (max-width: 58rem) {
		.welcome {
			grid-template-columns: 1fr;
		}
		.hero-layout {
			display: none;
		}
		.welcome {
			min-block-size: auto;
		}
		.principles > div {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 36rem) {
		.empty {
			align-items: flex-start;
		}
		.empty > :global([data-slot='button']) {
			display: none;
		}
	}
</style>
