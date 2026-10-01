<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { Snippet } from 'svelte';
	import AppHeader from './AppHeader.svelte';
	import AppSidebar from './AppSidebar.svelte';
	import MobileNavigation from './MobileNavigation.svelte';
	import { DEFAULT_APP_NAVIGATION } from './navigation';
	import type {
		AppRole,
		AppShellAccountAction,
		AppShellBrand,
		AppShellBreadcrumb,
		AppShellDirection,
		AppShellMobileNavigation,
		AppShellNavGroup,
		AppShellNavItem,
		AppShellUser
	} from './types';

	let {
		brand = { name: 'Learning studio', shortName: 'L', href: '/dashboard' },
		navigation = DEFAULT_APP_NAVIGATION,
		user,
		role = undefined,
		currentPath = '',
		title,
		breadcrumbs = [],
		accountActions = [],
		notificationCount = 0,
		direction = 'ltr',
		mobileNavigation = 'tabs',
		contentWidth = 'wide',
		mainId = 'app-main-content',
		sidebarCollapsed = $bindable(false),
		headerActions,
		sidebarFooter,
		children,
		onNavigate = () => undefined,
		onNotifications = undefined,
		onAccountAction = () => undefined,
		onSidebarCollapsedChange = () => undefined
	}: {
		brand?: AppShellBrand;
		navigation?: readonly AppShellNavGroup[];
		user: AppShellUser;
		role?: AppRole;
		currentPath?: string;
		title: string;
		breadcrumbs?: readonly AppShellBreadcrumb[];
		accountActions?: readonly AppShellAccountAction[];
		notificationCount?: number;
		direction?: AppShellDirection;
		mobileNavigation?: AppShellMobileNavigation;
		contentWidth?: 'fluid' | 'wide' | 'reading';
		mainId?: string;
		sidebarCollapsed?: boolean;
		headerActions?: Snippet;
		sidebarFooter?: Snippet;
		children: Snippet;
		onNavigate?: (item: AppShellNavItem) => void;
		onNotifications?: (() => void) | undefined;
		onAccountAction?: (action: AppShellAccountAction) => void;
		onSidebarCollapsedChange?: (collapsed: boolean) => void;
	} = $props();

	let mobileNavigationOpen = $state(false);
	let headerBlockSize = $state(0);
	let previousCollapsed = sidebarCollapsed;
	const resolvedRole = $derived(role ?? user.role);

	$effect(() => {
		if (sidebarCollapsed === previousCollapsed) return;
		previousCollapsed = sidebarCollapsed;
		onSidebarCollapsedChange(sidebarCollapsed);
	});
</script>

<Tooltip.Provider delayDuration={350}>
	<div
		class:sidebar-collapsed={sidebarCollapsed}
		class:has-mobile-tabs={mobileNavigation === 'tabs'}
		class="app-shell"
		style:--app-header-height={headerBlockSize ? `${headerBlockSize}px` : undefined}
		dir={direction}
	>
		<a class="skip-link" href={`#${mainId}`}>Skip to main content</a>

		<AppSidebar
			{brand}
			{navigation}
			role={resolvedRole}
			{currentPath}
			tooltipSide={direction === 'rtl' ? 'left' : 'right'}
			bind:collapsed={sidebarCollapsed}
			footer={sidebarFooter}
			{onNavigate}
		/>

		<div class="app-workspace">
			<AppHeader
				bind:blockSize={headerBlockSize}
				{title}
				{breadcrumbs}
				{user}
				{accountActions}
				{notificationCount}
				mobileMenuAvailable={mobileNavigation !== 'none'}
				actions={headerActions}
				onOpenNavigation={() => (mobileNavigationOpen = true)}
				{onNotifications}
				{onAccountAction}
			/>

			<main id={mainId} tabindex="-1">
				<div class="content-boundary" data-width={contentWidth}>
					{@render children()}
				</div>
			</main>
		</div>

		<MobileNavigation
			bind:open={mobileNavigationOpen}
			mode={mobileNavigation}
			{brand}
			{navigation}
			role={resolvedRole}
			{user}
			{currentPath}
			{onNavigate}
		/>
	</div>
</Tooltip.Provider>

<style>
	.app-shell {
		--app-header-height: 4.25rem;
		--studio-workspace: #f5f3ef;
		--studio-paper: #ffffff;
		--studio-ink: #252736;
		--studio-muted: #85838d;
		--studio-muted-strong: #615d69;
		--studio-line: #e8e4df;
		--studio-purple: #8065b4;
		--studio-lilac: #efe8fa;
		--studio-sage: #e8f1eb;
		--studio-green: #52816c;
		display: grid;
		grid-template-columns: 16rem minmax(0, 1fr);
		min-block-size: 100svh;
		background: var(--studio-workspace);
		color: var(--studio-ink);
		transition: grid-template-columns 180ms ease;
	}

	.app-shell.sidebar-collapsed {
		grid-template-columns: 4.35rem minmax(0, 1fr);
	}

	.skip-link {
		position: fixed;
		z-index: 100;
		inset-block-start: 0.6rem;
		inset-inline-start: 0.6rem;
		padding: 0.65rem 0.85rem;
		border-radius: 0.65rem;
		background: var(--studio-purple);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 650;
		text-decoration: none;
		transform: translateY(-180%);
		transition: transform 120ms ease;
	}

	.skip-link:focus {
		transform: translateY(0);
	}

	.app-workspace {
		min-inline-size: 0;
	}

	main {
		min-inline-size: 0;
		min-block-size: calc(100svh - 4.25rem);
		padding-block: var(--page-gutter);
		padding-inline-start: max(var(--page-gutter), env(safe-area-inset-left));
		padding-inline-end: max(var(--page-gutter), env(safe-area-inset-right));
		background-color: var(--studio-workspace);
		background-image: radial-gradient(
			circle,
			color-mix(in oklch, var(--studio-line), transparent 14%) 0.045rem,
			transparent 0.055rem
		);
		background-size: 1.35rem 1.35rem;
		scroll-margin-block-start: 5rem;
	}

	main:focus {
		outline: none;
	}

	.content-boundary {
		inline-size: 100%;
		margin-inline: auto;
	}

	.content-boundary[data-width='wide'] {
		max-inline-size: 90rem;
	}

	.content-boundary[data-width='reading'] {
		max-inline-size: 66rem;
	}

	@media (max-width: 56rem) {
		.app-shell,
		.app-shell.sidebar-collapsed {
			display: block;
		}

		main {
			min-block-size: calc(100svh - 3.75rem);
		}

		.app-shell.has-mobile-tabs {
			--app-bottom-inset: calc(4.15rem + env(safe-area-inset-bottom));
		}

		.app-shell.has-mobile-tabs main {
			padding-block-end: calc(var(--app-bottom-inset) + 0.75rem);
		}
	}

	@media (max-width: 40rem) {
		.app-shell {
			--app-header-height: 3.75rem;
		}

		main {
			padding-block-start: var(--page-gutter);
			background-size: 1.15rem 1.15rem;
		}
	}

	:global(.dark) .app-shell {
		--studio-workspace: #1b1a1d;
		--studio-paper: #242328;
		--studio-ink: #f2eff5;
		--studio-muted: #a7a2ad;
		--studio-muted-strong: #c7c1cb;
		--studio-line: #39363d;
		--studio-purple: #ad91dd;
		--studio-lilac: #342b45;
		--studio-sage: #24352d;
		--studio-green: #8ac5a6;
	}

	@media (prefers-reduced-motion: reduce) {
		.app-shell,
		.skip-link {
			transition: none;
		}
	}
</style>
