<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowLeft, GraduationCap } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let headerHeight = $state(0);

	const initials = $derived(
		data.viewer.name
			.split(/\s+/u)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toLocaleUpperCase())
			.join('') || 'LS'
	);
</script>

<div
	class="course-shell"
	style:--app-header-height={headerHeight ? `${headerHeight}px` : undefined}
>
	<a class="skip-link" href="#course-content">Skip to course content</a>

	<header class="course-header" data-reading-overlay="top" bind:offsetHeight={headerHeight}>
		<div class="header-boundary">
			<a class="brand" href={resolve('/dashboard')} aria-label="Learning studio dashboard">
				<span class="brand-mark"><GraduationCap size={19} /></span>
				<span class="brand-copy">
					<strong>Learning studio</strong>
					<small>Course player</small>
				</span>
			</a>

			<div class="header-actions">
				<div class="viewer" title={data.viewer.email}>
					{#if data.viewer.avatarUrl}
						<img src={data.viewer.avatarUrl} alt="" />
					{:else}
						<span class="viewer-avatar" aria-hidden="true">{initials}</span>
					{/if}
					<span class="viewer-copy">
						<strong>{data.viewer.name}</strong>
						<small>{data.viewer.role}</small>
					</span>
				</div>
				<Button
					href={data.viewer.role === 'student' ? resolve('/learn') : resolve('/courses')}
					variant="outline"
					size="sm"
					aria-label="Exit course"
				>
					<ArrowLeft data-icon="inline-start" />
					<span class="exit-label">Exit course</span>
				</Button>
			</div>
		</div>
	</header>

	<main id="course-content" tabindex="-1">
		{@render children()}
	</main>
</div>

<style>
	.course-shell {
		--app-header-height: 4.25rem;
		--studio-workspace: #f8f9fb;
		--studio-paper: #ffffff;
		--studio-ink: #252736;
		--studio-line: #e8e4df;
		--course-muted-foreground: color-mix(in oklch, var(--foreground) 72%, var(--background));
		--muted-foreground: var(--course-muted-foreground);
		min-block-size: 100svh;
		background: var(--studio-workspace);
		color: var(--studio-ink);
		font-family: var(
			--font-content,
			'Inter Variable',
			'Noto Sans Arabic Variable',
			system-ui,
			sans-serif
		);
		font-optical-sizing: auto;
		text-rendering: optimizeLegibility;
	}

	.skip-link {
		position: fixed;
		z-index: 100;
		inset-block-start: 0.6rem;
		inset-inline-start: 0.6rem;
		border-radius: 0.6rem;
		padding: 0.6rem 0.8rem;
		background: var(--editor-selection);
		color: white;
		font-size: 0.8125rem;
		font-weight: 650;
		text-decoration: none;
		transform: translateY(-180%);
		transition: transform 120ms ease;
	}

	.skip-link:focus {
		transform: translateY(0);
	}

	.course-header {
		position: sticky;
		z-index: 40;
		inset-block-start: 0;
		border-block-end: 0.0625rem solid color-mix(in oklch, var(--border) 84%, transparent);
		background: color-mix(in oklch, var(--background) 92%, transparent);
		backdrop-filter: blur(1rem);
	}

	.header-boundary {
		display: flex;
		inline-size: min(100%, 90rem);
		min-block-size: 4.25rem;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-inline: auto;
		padding-inline: clamp(0.85rem, 3vw, 2rem);
	}

	.brand,
	.header-actions,
	.viewer {
		display: flex;
		align-items: center;
	}

	.brand {
		min-inline-size: 0;
		gap: 0.65rem;
		color: inherit;
		text-decoration: none;
	}

	.brand-mark,
	.viewer-avatar,
	.viewer img {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 0.65rem;
	}

	.brand-mark {
		inline-size: 2.15rem;
		block-size: 2.15rem;
		background: var(--editor-selection-soft);
		color: var(--editor-selection);
	}

	.brand-copy,
	.viewer-copy {
		display: grid;
		min-inline-size: 0;
	}

	.brand-copy strong {
		font-size: 0.9rem;
		font-weight: 680;
		letter-spacing: -0.015em;
	}

	.brand-copy small,
	.viewer-copy small {
		color: var(--muted-foreground);
		font-size: 0.7rem;
		line-height: 1.35;
		text-transform: capitalize;
	}

	.header-actions {
		flex: 0 0 auto;
		gap: 0.75rem;
	}

	.viewer {
		gap: 0.5rem;
	}

	.viewer-avatar,
	.viewer img {
		inline-size: 1.85rem;
		block-size: 1.85rem;
	}

	.viewer-avatar {
		background: color-mix(in oklch, var(--muted) 78%, var(--background));
		color: var(--muted-foreground);
		font-size: 0.7rem;
		font-weight: 750;
	}

	.viewer img {
		object-fit: cover;
	}

	.viewer-copy strong {
		max-inline-size: 10rem;
		overflow: hidden;
		font-size: 0.78rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	main {
		min-inline-size: 0;
		min-block-size: calc(100svh - var(--app-header-height));
		padding-block: var(--page-gutter);
		padding-inline-start: max(var(--page-gutter), env(safe-area-inset-left));
		padding-inline-end: max(var(--page-gutter), env(safe-area-inset-right));
		scroll-margin-block-start: calc(var(--app-header-height) + 1rem);
	}

	main:focus {
		outline: none;
	}

	:global(.dark) .course-shell {
		--studio-workspace: #1b1a1d;
		--studio-paper: #242328;
		--studio-ink: #f2eff5;
		--studio-line: #39363d;
	}

	@media (max-width: 38rem) {
		.course-shell {
			--app-header-height: 3.75rem;
		}

		.header-boundary {
			min-block-size: 3.75rem;
			gap: 0.6rem;
			padding-inline: 0.625rem;
		}

		.brand {
			gap: 0.5rem;
		}

		.brand-mark {
			inline-size: 2rem;
			block-size: 2rem;
		}

		.viewer-copy,
		.brand-copy small {
			display: none;
		}

		.header-actions {
			gap: 0.3rem;
		}
	}

	@media (max-width: 25rem) {
		.exit-label {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skip-link {
			transition: none;
		}
	}
</style>
